-- Ensure agent credit functions use one consistent internal user id per call.
-- This prevents mismatches where caps are read for one users.id and usage rows for another.

create or replace function public.daveri_internal_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select
      coalesce(
        nullif(public.daveri_request_user_id(), ''),
        nullif(auth.uid()::text, '')
      ) as request_user_id,
      nullif(auth.jwt() ->> 'email', '') as request_email
  )
  select u.id
  from public.users as u
  cross join req
  where
    (
      req.request_user_id is not null
      and (
        u.id = req.request_user_id
        or u.auth_user_id::text = req.request_user_id
      )
    )
    or (
      req.request_email is not null
      and lower(u.email) = lower(req.request_email)
    )
  order by
    case
      when req.request_user_id is not null and u.id = req.request_user_id then 0
      when req.request_user_id is not null and u.auth_user_id::text = req.request_user_id then 1
      when req.request_email is not null and lower(u.email) = lower(req.request_email) then 2
      else 3
    end,
    case
      when lower(coalesce(u.plan_id, '')) in ('pro', 'premium', 'individual', 'business', 'enterprise') then 0
      when lower(coalesce(u.plan_id, '')) = 'free' then 2
      else 1
    end,
    u.created_at desc nulls last,
    u.id asc
  limit 1;
$$;

create or replace function public.daveri_agent_reserve_credits(
  p_cost int default 1
)
returns table (
  day date,
  month date,
  daily_used int,
  daily_cap int,
  monthly_used int,
  monthly_cap int
)
language sql
security definer
set search_path = public
as $$
with
uid as (
  select public.daveri_internal_user_id() as user_id
),
nowv as (
  select
    now() as ts,
    (now() at time zone 'utc')::date as day,
    date_trunc('month', (now() at time zone 'utc'))::date as month
),
caps as (
  select
    coalesce(
      (
        select e.limit_value
        from public.v_effective_entitlements as e
        join uid on e.user_id = uid.user_id
        where e.feature_key = 'daily_credits_cap'
          and e.enabled = true
        limit 1
      ),
      0
    ) as daily_cap,
    coalesce(
      (
        select e.limit_value
        from public.v_effective_entitlements as e
        join uid on e.user_id = uid.user_id
        where e.feature_key = 'monthly_credits'
          and e.enabled = true
        limit 1
      ),
      0
    ) as monthly_cap
),
ins_d as (
  insert into public.agent_credit_usage_daily (user_id, day, credits_used, first_at, last_at)
  select uid.user_id, nowv.day, 0, nowv.ts, nowv.ts
  from uid, nowv
  where uid.user_id is not null
  on conflict (user_id, day) do nothing
  returning user_id
),
ins_m as (
  insert into public.agent_credit_usage_monthly (user_id, month, credits_used)
  select uid.user_id, nowv.month, 0
  from uid, nowv
  where uid.user_id is not null
  on conflict (user_id, month) do nothing
  returning user_id
),
upd_m as (
  update public.agent_credit_usage_monthly as m
  set credits_used = m.credits_used + p_cost
  from uid, nowv, caps
  where m.user_id = uid.user_id
    and m.month = nowv.month
    and p_cost > 0
    and (m.credits_used + p_cost) <= caps.monthly_cap
  returning m.credits_used as monthly_used
),
upd_d as (
  update public.agent_credit_usage_daily as d
  set
    credits_used = d.credits_used + p_cost,
    first_at = coalesce(d.first_at, (select ts from nowv)),
    last_at = greatest(d.last_at, (select ts from nowv))
  from uid, nowv, caps
  where d.user_id = uid.user_id
    and d.day = nowv.day
    and p_cost > 0
    and (d.credits_used + p_cost) <= caps.daily_cap
    and exists (select 1 from upd_m)
  returning d.credits_used as daily_used
),
compensate as (
  update public.agent_credit_usage_monthly as m
  set credits_used = m.credits_used - p_cost
  from uid, nowv
  where m.user_id = uid.user_id
    and m.month = nowv.month
    and exists (select 1 from upd_m)
    and not exists (select 1 from upd_d)
  returning 1
)
select
  nowv.day,
  nowv.month,
  (select daily_used from upd_d) as daily_used,
  caps.daily_cap,
  (select monthly_used from upd_m) as monthly_used,
  caps.monthly_cap
from nowv, caps
where exists (select 1 from upd_d);
$$;

create or replace function public.daveri_agent_credit_status()
returns table (
  day date,
  daily_used int,
  daily_cap int,
  month date,
  monthly_used int,
  monthly_cap int
)
language sql
security definer
set search_path = public
as $$
with
u as (
  select public.daveri_internal_user_id() as internal_user_id
),
t as (
  select
    (now() at time zone 'utc')::date as day,
    date_trunc('month', (now() at time zone 'utc'))::date as month
),
caps as (
  select
    coalesce(
      (
        select e.limit_value
        from public.v_effective_entitlements as e
        join u on e.user_id = u.internal_user_id
        where e.feature_key = 'daily_credits_cap'
          and e.enabled = true
        limit 1
      ),
      0
    ) as daily_cap,
    coalesce(
      (
        select e.limit_value
        from public.v_effective_entitlements as e
        join u on e.user_id = u.internal_user_id
        where e.feature_key = 'monthly_credits'
          and e.enabled = true
        limit 1
      ),
      0
    ) as monthly_cap
),
d as (
  select a.credits_used
  from public.agent_credit_usage_daily as a
  join u on a.user_id = u.internal_user_id
  join t on a.day = t.day
),
m as (
  select a.credits_used
  from public.agent_credit_usage_monthly as a
  join u on a.user_id = u.internal_user_id
  join t on a.month = t.month
)
select
  t.day,
  coalesce((select credits_used from d), 0) as daily_used,
  caps.daily_cap,
  t.month,
  coalesce((select credits_used from m), 0) as monthly_used,
  caps.monthly_cap
from t, caps;
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_internal_user_id() from public';
  execute 'revoke all on function public.daveri_internal_user_id() from anon';
  execute 'grant execute on function public.daveri_internal_user_id() to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_reserve_credits(int) from public';
  execute 'revoke all on function public.daveri_agent_reserve_credits(int) from anon';
  execute 'grant execute on function public.daveri_agent_reserve_credits(int) to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_credit_status() from public';
  execute 'revoke all on function public.daveri_agent_credit_status() from anon';
  execute 'grant execute on function public.daveri_agent_credit_status() to authenticated, service_role';
end;
$do$;
