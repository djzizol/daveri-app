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
-- statement-breakpoint

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
-- statement-breakpoint

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
-- statement-breakpoint

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
-- statement-breakpoint

drop trigger if exists trg_agent_messages_after_insert on public.agent_messages;
create trigger trg_agent_messages_after_insert
after insert on public.agent_messages
for each row
execute function public.daveri_agent_on_message_insert();
-- statement-breakpoint

-- RPC + grants/RLS moved into dedicated migrations:
-- - 20260212221647_agent_rpc.sql
-- - 20260212221648_agent_rls_grants.sql
