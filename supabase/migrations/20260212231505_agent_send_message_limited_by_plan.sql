create or replace function public.daveri_send_message_limited_by_plan(
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
select *
from public.daveri_send_message_limited(
  public.daveri_agent_day_limit(),
  p_conversation_id,
  p_role,
  p_content,
  p_meta,
  p_active_bot_id,
  p_mode_default
);
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_send_message_limited_by_plan(uuid, text, text, jsonb, text, text) from public';
  execute 'revoke all on function public.daveri_send_message_limited_by_plan(uuid, text, text, jsonb, text, text) from anon';
  execute 'grant execute on function public.daveri_send_message_limited_by_plan(uuid, text, text, jsonb, text, text) to authenticated, service_role';
end;
$do$;
