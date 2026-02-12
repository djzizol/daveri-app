create or replace function public.daveri_internal_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id::text = public.daveri_request_user_id()
  limit 1;
$$;

create or replace function public.daveri_agent_day_limit()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.limit_value
      from public.v_effective_entitlements e
      where e.user_id = public.daveri_internal_user_id()
        and e.feature_key = 'messages_per_day'
        and e.enabled = true
      limit 1
    ),
    0
  );
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_internal_user_id() from public';
  execute 'revoke all on function public.daveri_internal_user_id() from anon';
  execute 'grant execute on function public.daveri_internal_user_id() to authenticated, service_role';

  execute 'revoke all on function public.daveri_agent_day_limit() from public';
  execute 'revoke all on function public.daveri_agent_day_limit() from anon';
  execute 'grant execute on function public.daveri_agent_day_limit() to authenticated, service_role';
end;
$do$;
