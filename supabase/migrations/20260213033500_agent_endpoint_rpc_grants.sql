-- Ensure AGENT endpoint RPC dependencies are callable by authenticated users.
-- Used by worker /v1/agent/ask flow:
-- 1) public.daveri_ensure_user_row()
-- 2) public.daveri_internal_user_id()
-- 3) public.daveri_agent_credit_status()

do $do$
begin
  execute 'revoke all on function public.daveri_ensure_user_row() from public';
  execute 'revoke all on function public.daveri_ensure_user_row() from anon';
  execute 'grant execute on function public.daveri_ensure_user_row() to authenticated, service_role';

  execute 'revoke all on function public.daveri_internal_user_id() from public';
  execute 'revoke all on function public.daveri_internal_user_id() from anon';
  execute 'grant execute on function public.daveri_internal_user_id() to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_credit_status() from public';
  execute 'revoke all on function public.daveri_agent_credit_status() from anon';
  execute 'grant execute on function public.daveri_agent_credit_status() to authenticated, service_role';
end;
$do$;

