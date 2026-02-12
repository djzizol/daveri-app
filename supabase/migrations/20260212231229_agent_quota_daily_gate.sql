-- ============================================================
-- Agent Dock: Daily quota gate (atomic reserve)
-- ============================================================

create or replace function public.daveri_agent_reserve_daily_message(
  p_day_limit int
)
returns table (
  usage_day date,
  usage_messages_count int
)
language sql
security definer
set search_path = public
as $$
with
uid as (
  select public.daveri_request_user_id() as user_id
),
nowv as (
  select now() as ts, (now() at time zone 'utc')::date as day
),
-- try insert first day row (count=0)
ins as (
  insert into public.agent_usage_daily (user_id, day, messages_count, first_message_at, last_message_at)
  select uid.user_id, nowv.day, 0, nowv.ts, nowv.ts
  from uid, nowv
  on conflict (user_id, day) do nothing
  returning user_id, day
),
-- atomic increment only if below limit
upd as (
  update public.agent_usage_daily u
  set
    messages_count = u.messages_count + 1,
    first_message_at = coalesce(u.first_message_at, (select ts from nowv)),
    last_message_at  = greatest(u.last_message_at, (select ts from nowv))
  from uid, nowv
  where u.user_id = uid.user_id
    and u.day = nowv.day
    and u.messages_count < p_day_limit
  returning u.day, u.messages_count
)
select day as usage_day, messages_count as usage_messages_count
from upd;
$$;

-- privileges (single statement to avoid your CLI prepared-statement issues)
do $do$
begin
  execute 'revoke all on function public.daveri_agent_reserve_daily_message(int) from public';
  execute 'revoke all on function public.daveri_agent_reserve_daily_message(int) from anon';
  execute 'grant execute on function public.daveri_agent_reserve_daily_message(int) to authenticated, service_role';
end;
$do$;
