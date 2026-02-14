begin;

create or replace function public.jsonb_strip_sensitive_keys(input jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  key text;
  value jsonb;
  lowered_key text;
  output jsonb := '{}'::jsonb;
begin
  if input is null then
    return '{}'::jsonb;
  end if;

  if jsonb_typeof(input) = 'object' then
    output := '{}'::jsonb;

    for key, value in
      select e.key, e.value
      from jsonb_each(input) as e
    loop
      lowered_key := lower(key);

      if lowered_key = any (array[
        'system_prompt',
        'owner_id',
        'user_id',
        'bubble_user_id',
        'api_key',
        'apikey',
        'access_token',
        'refresh_token',
        'client_secret',
        'secret',
        'secret_key',
        'password',
        'authorization'
      ]) then
        continue;
      end if;

      if lowered_key ~ '(secret|token|password|api[_-]?key|client[_-]?secret|authorization)' then
        continue;
      end if;

      output := output || jsonb_build_object(key, public.jsonb_strip_sensitive_keys(value));
    end loop;

    return output;
  end if;

  if jsonb_typeof(input) = 'array' then
    return (
      select coalesce(jsonb_agg(public.jsonb_strip_sensitive_keys(element.value)), '[]'::jsonb)
      from jsonb_array_elements(input) as element(value)
    );
  end if;

  return input;
end;
$$;

drop view if exists public.bots_public_config;

create view public.bots_public_config
with (security_barrier = true)
as
select
  b.id,
  public.jsonb_strip_sensitive_keys(b.config) as config,
  b.name,
  b.status,
  b.model
from public.bots as b
where coalesce(b.installed, false) = true
  and coalesce(lower(b.status), 'active') not in ('disabled', 'inactive', 'off', 'archived');

comment on view public.bots_public_config is
  'Public-safe bot config projection for widget usage.';

revoke all on table public.bots_public_config from public;
grant select on table public.bots_public_config to anon;
grant select on table public.bots_public_config to authenticated;
grant select on table public.bots_public_config to service_role;

commit;
