-- 20260212_agent_dock.sql
-- Agent Dock: conversations/messages/usage/audit

-- Extensions (Supabase zwykle ma, ale bezpiecznie)
create extension if not exists pgcrypto;

-- Helper: resolve request user id as TEXT (works with:
-- - custom JWT claim: user_id
-- - Supabase auth uid/sub (uuid) cast to text
create or replace function public.daveri_request_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'user_id', ''),
    nullif(auth.jwt() ->> 'sub', ''),
    nullif(auth.uid()::text, '')
  );
$$;

-- updated_at trigger helper
create or replace function public.daveri_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- agent_conversations
-- =========================
create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  active_bot_id text null,
  mode_default text not null default 'advisor' check (mode_default in ('advisor','operator')),
  title text null,
  title_status text not null default 'auto' check (title_status in ('auto','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text null
);

create index if not exists idx_agent_conversations_user_last
  on public.agent_conversations (user_id, last_message_at desc);

create index if not exists idx_agent_conversations_user_updated
  on public.agent_conversations (user_id, updated_at desc);

drop trigger if exists trg_agent_conversations_updated_at on public.agent_conversations;
create trigger trg_agent_conversations_updated_at
before update on public.agent_conversations
for each row execute function public.daveri_set_updated_at();

-- =========================
-- agent_messages
-- =========================
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_messages_conversation_created
  on public.agent_messages (conversation_id, created_at asc);

create index if not exists idx_agent_messages_user_created
  on public.agent_messages (user_id, created_at desc);

-- =========================
-- agent_usage_daily
-- =========================
create table if not exists public.agent_usage_daily (
  user_id text not null,
  day date not null,
  messages_count int not null default 0 check (messages_count >= 0),
  first_message_at timestamptz null,
  last_message_at timestamptz null,
  primary key (user_id, day)
);

create index if not exists idx_agent_usage_daily_user_day
  on public.agent_usage_daily (user_id, day desc);

-- =========================
-- agent_action_audit
-- =========================
create table if not exists public.agent_action_audit (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid null references public.agent_conversations(id) on delete set null,
  user_id text not null,
  bot_id text null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','executed','failed','rejected')),
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_action_audit_user_created
  on public.agent_action_audit (user_id, created_at desc);

create index if not exists idx_agent_action_audit_conversation_created
  on public.agent_action_audit (conversation_id, created_at desc);

-- ============================================================
-- Trigger: maintain conversation last_message_at + preview
-- ============================================================

create or replace function public.daveri_agent_on_message_insert()
returns trigger
language plpgsql
as $$
declare
  v_preview text;
begin
  -- normalize whitespace + trim; then cap length
  v_preview := regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g');
  v_preview := btrim(v_preview);

  if length(v_preview) > 240 then
    v_preview := left(v_preview, 240);
  end if;

  update public.agent_conversations c
  set
    last_message_at = greatest(c.last_message_at, new.created_at),
    last_message_preview = v_preview
  where c.id = new.conversation_id
    and c.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_agent_messages_after_insert on public.agent_messages;
create trigger trg_agent_messages_after_insert
after insert on public.agent_messages
for each row
execute function public.daveri_agent_on_message_insert();

-- ============================================================
-- Agent Dock: RPC (production) - atomic write path
-- ============================================================

-- Safety: ensure consistent search_path for SECURITY DEFINER functions
-- (done per function via "set search_path = public")

-- ------------------------------------------------------------
-- RPC: get or create conversation (optional helper)
-- ------------------------------------------------------------
create or replace function public.daveri_get_or_create_conversation(
  p_conversation_id uuid default null,
  p_active_bot_id text default null,
  p_mode_default text default 'advisor'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_conv_id uuid;
begin
  v_user_id := public.daveri_request_user_id();
  if v_user_id is null or v_user_id = '' then
    raise exception 'Not authenticated';
  end if;

  if p_mode_default not in ('advisor','operator') then
    raise exception 'Invalid mode_default: %', p_mode_default;
  end if;

  if p_conversation_id is null then
    insert into public.agent_conversations (user_id, active_bot_id, mode_default)
    values (v_user_id, p_active_bot_id, p_mode_default)
    returning id into v_conv_id;

    return v_conv_id;
  end if;

  -- Validate ownership
  if not exists (
    select 1
    from public.agent_conversations c
    where c.id = p_conversation_id
      and c.user_id = v_user_id
  ) then
    raise exception 'Conversation not found or not owned';
  end if;

  return p_conversation_id;
end;
$$;

-- Lock down privileges
revoke all on function public.daveri_get_or_create_conversation(uuid, text, text) from public;
revoke all on function public.daveri_get_or_create_conversation(uuid, text, text) from anon;
grant execute on function public.daveri_get_or_create_conversation(uuid, text, text) to authenticated, service_role;


-- ------------------------------------------------------------
-- RPC: atomic send message (conversation + message + usage)
-- ------------------------------------------------------------
create or replace function public.daveri_send_message_atomic(
  p_conversation_id uuid default null,
  p_role text,
  p_content text,
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
    messages_count   = public.agent_usage_daily.messages_count + 1,
    first_message_at = coalesce(public.agent_usage_daily.first_message_at, excluded.first_message_at),
    last_message_at  = greatest(public.agent_usage_daily.last_message_at, excluded.last_message_at)
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

-- Lock down privileges
revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from public;
revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from anon;
grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to authenticated, service_role;

-- ============================================================
-- Agent Dock: GRANTS + RLS (hardened, Supabase-ready)
-- ============================================================

-- ----------------------------
-- GRANTS / PRIVILEGES
-- ----------------------------

-- Allow API roles to use public schema
grant usage on schema public to anon, authenticated;

-- Functions used by RLS / triggers
grant execute on function public.daveri_request_user_id() to anon, authenticated;
grant execute on function public.daveri_set_updated_at() to anon, authenticated;

-- Tables (RLS will enforce row access)
grant select, insert, update, delete on table public.agent_conversations to authenticated;
grant select, insert                 on table public.agent_messages      to authenticated;
grant select, insert, update         on table public.agent_usage_daily   to authenticated;
grant select, insert                 on table public.agent_action_audit  to authenticated;

-- (Optional) service_role has full access (usually Supabase already does this, but explicit is fine)
grant all on table public.agent_conversations to service_role;
grant all on table public.agent_messages      to service_role;
grant all on table public.agent_usage_daily   to service_role;
grant all on table public.agent_action_audit  to service_role;


-- ----------------------------
-- FORCE RLS (recommended)
-- ----------------------------

alter table public.agent_conversations force row level security;
alter table public.agent_messages      force row level security;
alter table public.agent_usage_daily   force row level security;
alter table public.agent_action_audit  force row level security;


-- ----------------------------
-- RLS POLICIES (HARDENED)
-- ----------------------------

-- ===== agent_conversations =====

drop policy if exists agent_conversations_select on public.agent_conversations;
create policy agent_conversations_select
on public.agent_conversations
for select
using (user_id = public.daveri_request_user_id());

drop policy if exists agent_conversations_insert on public.agent_conversations;
create policy agent_conversations_insert
on public.agent_conversations
for insert
with check (user_id = public.daveri_request_user_id());

drop policy if exists agent_conversations_update on public.agent_conversations;
create policy agent_conversations_update
on public.agent_conversations
for update
using (user_id = public.daveri_request_user_id())
with check (user_id = public.daveri_request_user_id());

drop policy if exists agent_conversations_delete on public.agent_conversations;
create policy agent_conversations_delete
on public.agent_conversations
for delete
using (user_id = public.daveri_request_user_id());


-- ===== agent_messages =====
-- Immutable log: select/insert allowed, update/delete blocked

drop policy if exists agent_messages_select on public.agent_messages;
create policy agent_messages_select
on public.agent_messages
for select
using (user_id = public.daveri_request_user_id());

drop policy if exists agent_messages_insert on public.agent_messages;
create policy agent_messages_insert
on public.agent_messages
for insert
with check (
  user_id = public.daveri_request_user_id()
  and exists (
    select 1
    from public.agent_conversations c
    where c.id = agent_messages.conversation_id
      and c.user_id = public.daveri_request_user_id()
      and c.user_id = agent_messages.user_id
  )
);

drop policy if exists agent_messages_update on public.agent_messages;
create policy agent_messages_update
on public.agent_messages
for update
using (false);

drop policy if exists agent_messages_delete on public.agent_messages;
create policy agent_messages_delete
on public.agent_messages
for delete
using (false);


-- ===== agent_usage_daily =====
-- Owner can select/insert/update (+ optional delete)

drop policy if exists agent_usage_daily_select on public.agent_usage_daily;
create policy agent_usage_daily_select
on public.agent_usage_daily
for select
using (user_id = public.daveri_request_user_id());

drop policy if exists agent_usage_daily_insert on public.agent_usage_daily;
create policy agent_usage_daily_insert
on public.agent_usage_daily
for insert
with check (user_id = public.daveri_request_user_id());

drop policy if exists agent_usage_daily_update on public.agent_usage_daily;
create policy agent_usage_daily_update
on public.agent_usage_daily
for update
using (user_id = public.daveri_request_user_id())
with check (user_id = public.daveri_request_user_id());

-- OPTIONAL (recommended for cleanup/GDPR)
drop policy if exists agent_usage_daily_delete on public.agent_usage_daily;
create policy agent_usage_daily_delete
on public.agent_usage_daily
for delete
using (user_id = public.daveri_request_user_id());


-- ===== agent_action_audit =====
-- Immutable log: select/insert allowed, update/delete blocked
-- If conversation_id is present, enforce it belongs to user.

drop policy if exists agent_action_audit_select on public.agent_action_audit;
create policy agent_action_audit_select
on public.agent_action_audit
for select
using (user_id = public.daveri_request_user_id());

drop policy if exists agent_action_audit_insert on public.agent_action_audit;
create policy agent_action_audit_insert
on public.agent_action_audit
for insert
with check (
  user_id = public.daveri_request_user_id()
  and (
    conversation_id is null
    or exists (
      select 1
      from public.agent_conversations c
      where c.id = agent_action_audit.conversation_id
        and c.user_id = public.daveri_request_user_id()
    )
  )
);

drop policy if exists agent_action_audit_update on public.agent_action_audit;
create policy agent_action_audit_update
on public.agent_action_audit
for update
using (false);

drop policy if exists agent_action_audit_delete on public.agent_action_audit;
create policy agent_action_audit_delete
on public.agent_action_audit
for delete
using (false);
