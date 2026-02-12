do $do$
begin
  -- --- ALLOW (client) ---
  execute 'grant execute on function public.daveri_send_message_credit_limited(int, uuid, text, text, jsonb, text, text) to authenticated';
  execute 'grant execute on function public.daveri_agent_credit_status() to authenticated';

  -- --- DENY bypass paths (client) ---
  execute 'revoke execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from authenticated';
  execute 'revoke execute on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) from authenticated';
  execute 'revoke execute on function public.daveri_send_message_limited_by_plan(uuid, text, text, jsonb, text, text) from authenticated';

  execute 'revoke execute on function public.daveri_agent_reserve_daily_message(int) from authenticated';
  execute 'revoke execute on function public.daveri_agent_reserve_credits(int) from authenticated';

  -- keep admin/backend ability
  execute 'grant execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) to service_role';
  execute 'grant execute on function public.daveri_agent_reserve_credits(int) to service_role';
end;
$do$;
