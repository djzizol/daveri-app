-- ============================================================
-- Agent Dock: RPC grants (single-statement via DO block)
-- ============================================================

do $do$
begin
  -- get_or_create_conversation
  execute 'revoke all on function public.daveri_get_or_create_conversation(uuid, text, text) from public';
  execute 'revoke all on function public.daveri_get_or_create_conversation(uuid, text, text) from anon';
  execute 'grant execute on function public.daveri_get_or_create_conversation(uuid, text, text) to authenticated, service_role';

  -- send_message_atomic
  execute 'revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from public';
  execute 'revoke all on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from anon';
  execute 'grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to authenticated, service_role';
end;
$do$;
