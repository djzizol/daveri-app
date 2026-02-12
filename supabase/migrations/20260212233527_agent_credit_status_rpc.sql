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
d as (
  select a.credits_used
  from public.agent_credit_usage_daily a
  join u on a.user_id = u.internal_user_id
  join t on a.day = t.day
),
m as (
  select a.credits_used
  from public.agent_credit_usage_monthly a
  join u on a.user_id = u.internal_user_id
  join t on a.month = t.month
)
select
  t.day,
  coalesce((select credits_used from d), 0) as daily_used,
  public.daveri_agent_daily_credits_cap() as daily_cap,
  t.month,
  coalesce((select credits_used from m), 0) as monthly_used,
  public.daveri_agent_monthly_credits() as monthly_cap
from t;
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_agent_credit_status() from public';
  execute 'revoke all on function public.daveri_agent_credit_status() from anon';
  execute 'grant execute on function public.daveri_agent_credit_status() to authenticated, service_role';
end;
$do$;
