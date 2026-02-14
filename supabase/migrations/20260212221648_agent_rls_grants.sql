-- ============================================================
-- Agent Dock: grants + FORCE RLS + policies
-- ============================================================

do $do$
begin
  -- Lock down RPC privileges
  execute 'revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from public';
  execute 'revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from anon';
  execute 'grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to authenticated, service_role';

  -- Allow API roles to use public schema
  execute 'grant usage on schema public to anon, authenticated';

  -- Functions used by RLS / triggers
  execute 'grant execute on function public.daveri_request_user_id() to anon, authenticated';
  execute 'grant execute on function public.daveri_set_updated_at() to anon, authenticated';

  -- Tables (RLS enforces row access)
  execute 'grant select, insert, update, delete on table public.agent_conversations to authenticated';
  execute 'grant select, insert on table public.agent_messages to authenticated';
  execute 'grant select, insert, update on table public.agent_usage_daily to authenticated';
  execute 'grant select, insert on table public.agent_action_audit to authenticated';

  -- service_role full access
  execute 'grant all on table public.agent_conversations to service_role';
  execute 'grant all on table public.agent_messages to service_role';
  execute 'grant all on table public.agent_usage_daily to service_role';
  execute 'grant all on table public.agent_action_audit to service_role';

  -- FORCE RLS
  execute 'alter table public.agent_conversations force row level security';
  execute 'alter table public.agent_messages force row level security';
  execute 'alter table public.agent_usage_daily force row level security';
  execute 'alter table public.agent_action_audit force row level security';

  -- ===== agent_conversations =====
  execute 'drop policy if exists agent_conversations_select on public.agent_conversations';
  execute 'create policy agent_conversations_select on public.agent_conversations for select using (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_conversations_insert on public.agent_conversations';
  execute 'create policy agent_conversations_insert on public.agent_conversations for insert with check (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_conversations_update on public.agent_conversations';
  execute 'create policy agent_conversations_update on public.agent_conversations for update using (user_id = public.daveri_request_user_id()) with check (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_conversations_delete on public.agent_conversations';
  execute 'create policy agent_conversations_delete on public.agent_conversations for delete using (user_id = public.daveri_request_user_id())';

  -- ===== agent_messages =====
  execute 'drop policy if exists agent_messages_select on public.agent_messages';
  execute 'create policy agent_messages_select on public.agent_messages for select using (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_messages_insert on public.agent_messages';
  execute 'create policy agent_messages_insert on public.agent_messages for insert with check (user_id = public.daveri_request_user_id() and exists (select 1 from public.agent_conversations c where c.id = agent_messages.conversation_id and c.user_id = public.daveri_request_user_id() and c.user_id = agent_messages.user_id))';
  execute 'drop policy if exists agent_messages_update on public.agent_messages';
  execute 'create policy agent_messages_update on public.agent_messages for update using (false)';
  execute 'drop policy if exists agent_messages_delete on public.agent_messages';
  execute 'create policy agent_messages_delete on public.agent_messages for delete using (false)';

  -- ===== agent_usage_daily =====
  execute 'drop policy if exists agent_usage_daily_select on public.agent_usage_daily';
  execute 'create policy agent_usage_daily_select on public.agent_usage_daily for select using (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_usage_daily_insert on public.agent_usage_daily';
  execute 'create policy agent_usage_daily_insert on public.agent_usage_daily for insert with check (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_usage_daily_update on public.agent_usage_daily';
  execute 'create policy agent_usage_daily_update on public.agent_usage_daily for update using (user_id = public.daveri_request_user_id()) with check (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_usage_daily_delete on public.agent_usage_daily';
  execute 'create policy agent_usage_daily_delete on public.agent_usage_daily for delete using (user_id = public.daveri_request_user_id())';

  -- ===== agent_action_audit =====
  execute 'drop policy if exists agent_action_audit_select on public.agent_action_audit';
  execute 'create policy agent_action_audit_select on public.agent_action_audit for select using (user_id = public.daveri_request_user_id())';
  execute 'drop policy if exists agent_action_audit_insert on public.agent_action_audit';
  execute 'create policy agent_action_audit_insert on public.agent_action_audit for insert with check (user_id = public.daveri_request_user_id() and (conversation_id is null or exists (select 1 from public.agent_conversations c where c.id = agent_action_audit.conversation_id and c.user_id = public.daveri_request_user_id())))';
  execute 'drop policy if exists agent_action_audit_update on public.agent_action_audit';
  execute 'create policy agent_action_audit_update on public.agent_action_audit for update using (false)';
  execute 'drop policy if exists agent_action_audit_delete on public.agent_action_audit';
  execute 'create policy agent_action_audit_delete on public.agent_action_audit for delete using (false)';
end;
$do$;
-- statement-breakpoint
