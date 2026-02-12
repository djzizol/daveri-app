do $do$
begin
  -- Allow only credit-gated RPC for authenticated clients
  execute 'grant execute on function public.daveri_send_message_credit_limited(int, uuid, text, text, jsonb, text, text) to authenticated';

  -- Block bypass paths for authenticated
  execute 'revoke execute on function public.daveri_send_message_atomic(uuid, text, text, jsonb, text, text) from authenticated';
  execute 'revoke execute on function public.daveri_send_message_limited_by_plan(uuid, text, text, jsonb, text, text) from authenticated';
  execute 'revoke execute on function public.daveri_send_message_limited(int, uuid, text, text, jsonb, text, text) from authenticated';

  execute 'revoke execute on function public.daveri_agent_reserve_daily_message(int) from authenticated';
  execute 'revoke execute on function public.daveri_agent_reserve_credits(int) from authenticated'; -- optional: reserve only via wrapper
end;
$do$;
