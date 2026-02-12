-- ============================================================
-- Agent Dock: Credit-based quota (daily cap + monthly credits)
-- ============================================================

-- Daily usage for agent credits (UTC day)
create table if not exists public.agent_credit_usage_daily (
  user_id text not null,
  day date not null,
  credits_used int not null default 0 check (credits_used >= 0),
  first_at timestamptz null,
  last_at timestamptz null,
  primary key (user_id, day)
);

create index if not exists idx_agent_credit_usage_daily_user_day
on public.agent_credit_usage_daily (user_id, day desc);

-- Monthly usage for agent credits (UTC month bucket: YYYY-MM-01)
create table if not exists public.agent_credit_usage_monthly (
  user_id text not null,
  month date not null,
  credits_used int not null default 0 check (credits_used >= 0),
  primary key (user_id, month)
);

create index if not exists idx_agent_credit_usage_monthly_user_month
on public.agent_credit_usage_monthly (user_id, month desc);

alter table public.agent_credit_usage_daily enable row level security;
alter table public.agent_credit_usage_monthly enable row level security;

-- RLS: user can only read own usage; no direct writes (RPC only)
drop policy if exists agent_credit_usage_daily_select on public.agent_credit_usage_daily;
create policy agent_credit_usage_daily_select
on public.agent_credit_usage_daily
for select
using (user_id = public.daveri_internal_user_id());

drop policy if exists agent_credit_usage_monthly_select on public.agent_credit_usage_monthly;
create policy agent_credit_usage_monthly_select
on public.agent_credit_usage_monthly
for select
using (user_id = public.daveri_internal_user_id());

-- Helper: daily cap from entitlements (fallback 0)
create or replace function public.daveri_agent_daily_credits_cap()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.limit_value
      from public.v_effective_entitlements e
      where e.user_id = public.daveri_internal_user_id()
        and e.feature_key = 'daily_credits_cap'
        and e.enabled = true
      limit 1
    ),
    0
  );
$$;

-- Helper: monthly credits from entitlements (fallback 0)
create or replace function public.daveri_agent_monthly_credits()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.limit_value
      from public.v_effective_entitlements e
      where e.user_id = public.daveri_internal_user_id()
        and e.feature_key = 'monthly_credits'
        and e.enabled = true
      limit 1
    ),
    0
  );
$$;

-- Atomic reserve: increments daily+monthly usage only if both limits allow it.
-- Returns 1 row on success; 0 rows if quota exceeded / not mapped user.
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
    public.daveri_agent_daily_credits_cap() as daily_cap,
    public.daveri_agent_monthly_credits() as monthly_cap
),
-- ensure rows exist
ins_d as (
  insert into public.agent_credit_usage_daily (user_id, day, credits_used, first_at, last_at)
  select uid.user_id, nowv.day, 0, nowv.ts, nowv.ts
  from uid, nowv
  on conflict (user_id, day) do nothing
  returning user_id
),
ins_m as (
  insert into public.agent_credit_usage_monthly (user_id, month, credits_used)
  select uid.user_id, nowv.month, 0
  from uid, nowv
  on conflict (user_id, month) do nothing
  returning user_id
),
-- lock-step update: we do monthly first, then daily, both guarded.
upd_m as (
  update public.agent_credit_usage_monthly m
  set credits_used = m.credits_used + p_cost
  from uid, nowv, caps
  where m.user_id = uid.user_id
    and m.month = nowv.month
    and p_cost > 0
    and (m.credits_used + p_cost) <= caps.monthly_cap
  returning m.credits_used as monthly_used
),
upd_d as (
  update public.agent_credit_usage_daily d
  set
    credits_used = d.credits_used + p_cost,
    first_at = coalesce(d.first_at, (select ts from nowv)),
    last_at  = greatest(d.last_at, (select ts from nowv))
  from uid, nowv, caps
  where d.user_id = uid.user_id
    and d.day = nowv.day
    and p_cost > 0
    and (d.credits_used + p_cost) <= caps.daily_cap
    and exists (select 1 from upd_m) -- ensure monthly passed
  returning d.credits_used as daily_used
),
-- rollback monthly if daily failed after monthly succeeded (compensating update)
compensate as (
  update public.agent_credit_usage_monthly m
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

-- Grants/revokes (single DO for your CLI)
do $do$
begin
  execute 'revoke all on function public.daveri_agent_daily_credits_cap() from public';
  execute 'revoke all on function public.daveri_agent_daily_credits_cap() from anon';
  execute 'grant execute on function public.daveri_agent_daily_credits_cap() to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_monthly_credits() from public';
  execute 'revoke all on function public.daveri_agent_monthly_credits() from anon';
  execute 'grant execute on function public.daveri_agent_monthly_credits() to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_reserve_credits(int) from public';
  execute 'revoke all on function public.daveri_agent_reserve_credits(int) from anon';
  execute 'grant execute on function public.daveri_agent_reserve_credits(int) to authenticated, service_role';
end;
$do$;

-- Remove direct writes from authenticated (RPC-only)
revoke insert, update, delete on table public.agent_credit_usage_daily from authenticated;
revoke insert, update, delete on table public.agent_credit_usage_monthly from authenticated;
