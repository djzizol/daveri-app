-- ============================================================
-- Supabase Auth bootstrap: ensure public.users row for auth user
-- ============================================================

alter table public.users
add column if not exists auth_user_id uuid;

create index if not exists idx_users_auth_user_id
on public.users (auth_user_id);

create or replace function public.daveri_internal_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where
    u.id = public.daveri_request_user_id()
    or u.auth_user_id::text = public.daveri_request_user_id()
  order by
    case when u.id = public.daveri_request_user_id() then 0 else 1 end
  limit 1;
$$;

create or replace function public.daveri_ensure_user_row()
returns table (
  user_id text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id_text text;
  v_auth_user_id uuid;
  v_email text;
begin
  v_auth_user_id_text := public.daveri_request_user_id();

  if v_auth_user_id_text is null or btrim(v_auth_user_id_text) = '' then
    raise exception 'Not authenticated';
  end if;

  begin
    v_auth_user_id := v_auth_user_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid auth uid: %', v_auth_user_id_text;
  end;

  v_email := nullif(auth.jwt() ->> 'email', '');
  if v_email is null then
    select au.email into v_email
    from auth.users au
    where au.id = v_auth_user_id
    limit 1;
  end if;

  if v_email is null or btrim(v_email) = '' then
    raise exception 'Missing user email in auth context';
  end if;

  begin
    insert into public.users (id, email, auth_user_id, plan_id)
    values (v_auth_user_id_text, v_email, v_auth_user_id, 'free')
    on conflict (id) do update
    set
      email = case
        when public.users.email is null or btrim(public.users.email) = '' then excluded.email
        else public.users.email
      end,
      auth_user_id = coalesce(public.users.auth_user_id, excluded.auth_user_id);
  exception
    when unique_violation then
      update public.users u
      set
        email = coalesce(u.email, v_email),
        auth_user_id = coalesce(u.auth_user_id, v_auth_user_id)
      where lower(u.email) = lower(v_email);
  end;

  return query
  select u.id, u.email
  from public.users u
  where u.id = v_auth_user_id_text
     or u.auth_user_id = v_auth_user_id
  order by case when u.id = v_auth_user_id_text then 0 else 1 end
  limit 1;
end;
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_internal_user_id() from public';
  execute 'revoke all on function public.daveri_internal_user_id() from anon';
  execute 'grant execute on function public.daveri_internal_user_id() to authenticated, service_role';

  execute 'revoke all on function public.daveri_ensure_user_row() from public';
  execute 'revoke all on function public.daveri_ensure_user_row() from anon';
  execute 'grant execute on function public.daveri_ensure_user_row() to authenticated, service_role';
end;
$do$;

