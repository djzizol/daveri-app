-- ============================================================
-- Agent Dock: prevent limit bypass from clients
-- ============================================================

do $do$
begin
  -- Hard block calling atomic directly from client (would bypass quotas)
  execute 'revoke execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from authenticated';
  execute 'grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to service_role';

  -- Optional: block calling limited-with-parameter from client as well
  execute 'revoke execute on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) from authenticated';
  execute 'grant execute on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) to service_role';

  -- Optional: block direct reserve with client-supplied limit
  execute 'revoke execute on function public.daveri_agent_reserve_daily_message(int) from authenticated';
  execute 'grant execute on function public.daveri_agent_reserve_daily_message(int) to service_role';
end;
$do$;
