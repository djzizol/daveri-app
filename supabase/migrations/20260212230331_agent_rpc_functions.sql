-- ============================================================
-- Agent Dock: RPC functions only (no grants)
-- ============================================================

create or replace function public.daveri_get_or_create_conversation(
  p_conversation_id uuid default null,
  p_active_bot_id text default null,
  p_mode_default text default 'advisor'
)
returns uuid
language sql
security definer
set search_path = public
as $$
with uid as (
  select public.daveri_request_user_id() as user_id
),
existing_conv as (
  select c.id
  from public.agent_conversations c, uid
  where p_conversation_id is not null
    and c.id = p_conversation_id
    and c.user_id = uid.user_id
),
new_conv as (
  insert into public.agent_conversations (user_id, active_bot_id, mode_default)
  select uid.user_id, p_active_bot_id, p_mode_default
  from uid
  where p_conversation_id is null
  returning id
),
conv as (
  select id from existing_conv
  union all
  select id from new_conv
)
select id from conv
limit 1;
$$;


create or replace function public.daveri_send_message_atomic(
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
uid as (
  select public.daveri_request_user_id() as user_id
),
existing_conv as (
  select c.id
  from public.agent_conversations c, uid
  where p_conversation_id is not null
    and c.id = p_conversation_id
    and c.user_id = uid.user_id
),
new_conv as (
  insert into public.agent_conversations (user_id, active_bot_id, mode_default, last_message_at)
  select uid.user_id, p_active_bot_id, p_mode_default, now()
  from uid
  where p_conversation_id is null
  returning id
),
conv as (
  select id from existing_conv
  union all
  select id from new_conv
),
msg as (
  insert into public.agent_messages (conversation_id, user_id, role, content, meta, created_at)
  select
    conv.id,
    uid.user_id,
    p_role,
    p_content,
    coalesce(p_meta, '{}'::jsonb),
    now()
  from conv, uid
  returning id, created_at
),
u as (
  insert into public.agent_usage_daily (user_id, day, messages_count, first_message_at, last_message_at)
  select
    uid.user_id,
    (now() at time zone 'utc')::date,
    1,
    (select created_at from msg),
    (select created_at from msg)
  from uid
  on conflict (user_id, day) do update
  set
    messages_count   = public.agent_usage_daily.messages_count + 1,
    first_message_at = coalesce(public.agent_usage_daily.first_message_at, excluded.first_message_at),
    last_message_at  = greatest(public.agent_usage_daily.last_message_at, excluded.last_message_at)
  returning day, messages_count
)
select
  (select id from conv) as conversation_id,
  (select id from msg) as message_id,
  (select created_at from msg) as message_created_at,
  (select day from u) as usage_day,
  (select messages_count from u) as usage_messages_count;
$$;
