-- ============================================================
-- Agent Dock: RPC atomic write path
-- ============================================================

create or replace function public.daveri_send_message_atomic(
  p_conversation_id uuid default null,
  p_role text default null,
  p_content text default null,
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_conv_id uuid;
  v_msg_id uuid;
  v_created_at timestamptz := now();
  v_day date := (now() at time zone 'utc')::date;
  v_count int;
begin
  -- Auth
  v_user_id := public.daveri_request_user_id();
  if v_user_id is null or v_user_id = '' then
    raise exception 'Not authenticated';
  end if;

  -- Input validation
  if p_role is null or p_role not in ('user','assistant','system','tool') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_content is null or length(btrim(p_content)) = 0 then
    raise exception 'Content cannot be empty';
  end if;

  if p_mode_default not in ('advisor','operator') then
    raise exception 'Invalid mode_default: %', p_mode_default;
  end if;

  -- Conversation: create or validate ownership
  if p_conversation_id is null then
    insert into public.agent_conversations (user_id, active_bot_id, mode_default, last_message_at)
    values (v_user_id, p_active_bot_id, p_mode_default, v_created_at)
    returning id into v_conv_id;
  else
    v_conv_id := p_conversation_id;

    if not exists (
      select 1
      from public.agent_conversations c
      where c.id = v_conv_id
        and c.user_id = v_user_id
    ) then
      raise exception 'Conversation not found or not owned';
    end if;
  end if;

  -- Insert message (immutable)
  insert into public.agent_messages (conversation_id, user_id, role, content, meta, created_at)
  values (v_conv_id, v_user_id, p_role, p_content, coalesce(p_meta, '{}'::jsonb), v_created_at)
  returning id, created_at into v_msg_id, v_created_at;

  -- Upsert usage daily (UTC day)
  insert into public.agent_usage_daily (user_id, day, messages_count, first_message_at, last_message_at)
  values (v_user_id, v_day, 1, v_created_at, v_created_at)
  on conflict (user_id, day) do update
  set
    messages_count = public.agent_usage_daily.messages_count + 1,
    first_message_at = coalesce(public.agent_usage_daily.first_message_at, excluded.first_message_at),
    last_message_at = greatest(public.agent_usage_daily.last_message_at, excluded.last_message_at)
  returning messages_count into v_count;

  -- Return
  conversation_id := v_conv_id;
  message_id := v_msg_id;
  message_created_at := v_created_at;
  usage_day := v_day;
  usage_messages_count := v_count;
  return next;
end;
$$;
-- statement-breakpoint
