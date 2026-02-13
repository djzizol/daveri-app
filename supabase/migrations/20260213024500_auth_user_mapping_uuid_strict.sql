-- ============================================================
-- Auth mapping hardening (Supabase Auth as single source)
-- - users.auth_user_id (uuid) is matched ONLY against auth.uid() (uuid)
-- - users.id (text) remains internal_user_id for legacy plan/usage domain
-- ============================================================

create or replace function public.daveri_internal_user_id()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid;
  v_internal_user_id text;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    return null;
  end if;

  select u.id
  into v_internal_user_id
  from public.users as u
  where u.auth_user_id = v_auth_uid
  order by u.created_at desc nulls last, u.id desc
  limit 1;

  if v_internal_user_id is not null then
    return v_internal_user_id;
  end if;

  -- Fallback only when mapping row is still missing.
  return v_auth_uid::text;
end;
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
  v_auth_uid uuid;
  v_email text;
  v_internal_user_id text;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  v_email := nullif(auth.jwt() ->> 'email', '');
  if v_email is null then
    select au.email
    into v_email
    from auth.users as au
    where au.id = v_auth_uid
    limit 1;
  end if;

  if v_email is null or btrim(v_email) = '' then
    raise exception 'Missing user email in auth context';
  end if;

  -- 1) Preferred mapping path: by auth_user_id (uuid = uuid)
  select u.id
  into v_internal_user_id
  from public.users as u
  where u.auth_user_id = v_auth_uid
  order by u.created_at desc nulls last, u.id desc
  limit 1;

  if v_internal_user_id is not null then
    update public.users as u
    set email = v_email
    where u.id = v_internal_user_id
      and (u.email is null or u.email is distinct from v_email);

    return query
    select u.id, u.email
    from public.users as u
    where u.id = v_internal_user_id
    limit 1;
    return;
  end if;

  -- 2) Legacy reconciliation path: bind existing row by email
  select u.id
  into v_internal_user_id
  from public.users as u
  where lower(u.email) = lower(v_email)
  order by u.created_at desc nulls last, u.id desc
  limit 1;

  if v_internal_user_id is not null then
    update public.users as u
    set
      auth_user_id = v_auth_uid,
      email = v_email
    where u.id = v_internal_user_id;

    return query
    select u.id, u.email
    from public.users as u
    where u.id = v_internal_user_id
    limit 1;
    return;
  end if;

  -- 3) New row path: id is internal_user_id (text), seeded from auth uid
  v_internal_user_id := v_auth_uid::text;

  begin
    insert into public.users as u (id, email, auth_user_id, plan_id)
    values (v_internal_user_id, v_email, v_auth_uid, 'free')
    on conflict (id) do update
    set
      auth_user_id = coalesce(u.auth_user_id, excluded.auth_user_id),
      email = excluded.email;
  exception
    when unique_violation then
      -- Email uniqueness collision: attach auth_user_id to existing email row.
      update public.users as u
      set
        auth_user_id = coalesce(u.auth_user_id, v_auth_uid),
        email = v_email
      where lower(u.email) = lower(v_email)
      returning u.id into v_internal_user_id;
  end;

  if v_internal_user_id is null then
    select u.id
    into v_internal_user_id
    from public.users as u
    where u.auth_user_id = v_auth_uid
    order by u.created_at desc nulls last, u.id desc
    limit 1;
  end if;

  if v_internal_user_id is null then
    raise exception 'Unable to ensure users row for auth uid %', v_auth_uid;
  end if;

  return query
  select u.id, u.email
  from public.users as u
  where u.id = v_internal_user_id
  limit 1;
end;
$$;

do $do$
begin
  execute 'revoke all on function public.daveri_ensure_user_row() from public';
  execute 'revoke all on function public.daveri_ensure_user_row() from anon';
  execute 'grant execute on function public.daveri_ensure_user_row() to authenticated, service_role';
end;
$do$;

-- ============================================================
-- Manual SQL checks
-- ============================================================
-- select auth.uid(), public.daveri_internal_user_id();
-- select * from public.users where auth_user_id = auth.uid();
