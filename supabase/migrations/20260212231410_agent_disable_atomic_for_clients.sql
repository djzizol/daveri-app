-- Disable direct client access to atomic (bypass risk)
do $do$
begin
  execute 'revoke execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from authenticated';
  -- service_role zostaje (backend/admin)
  execute 'grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to service_role';
end;
$do$;
