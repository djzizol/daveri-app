-- ============================================================
-- Agent Dock: send message with daily quota enforcement
-- ============================================================

create or replace function public.daveri_send_message_limited(
  p_day_limit int,
  p_conversation_id uuid default null,
  p_role text default 'user',
  p_content text default '',
  p_meta jsonb default '{}'::jsonb,
  p_active_bot_id text default null,
  p_mode_default text default 'advisor'
)
returns table (
  conversation_id uuid,
  message_id uuid,
  message_created_at timestamptz,
  usage_day date,
  usage_messages_count int
)
language sql
security definer
set search_path = public
as $$
with
r as (
  select * from public.daveri_agent_reserve_daily_message(p_day_limit)
),
m as (
  select * from public.daveri_send_message_atomic(
    p_conversation_id,
    p_role,
    p_content,
    p_meta,
    p_active_bot_id,
    p_mode_default
  )
)
select
  m.conversation_id,
  m.message_id,
  m.message_created_at,
  r.usage_day,
  r.usage_messages_count
from r
join m on true;
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) from public';
  execute 'revoke all on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) from anon';
  execute 'grant execute on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) to authenticated, service_role';
end;
$do$;
