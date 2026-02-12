create or replace function public.daveri_agent_day_limit()
returns int
language sql
stable
as $$
  select 50; -- TODO: replace with plan lookup
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_agent_day_limit() from public';
  execute 'revoke all on function public.daveri_agent_day_limit() from anon';
  execute 'grant execute on function public.daveri_agent_day_limit() to authenticated, service_role';
end;
$do$;
