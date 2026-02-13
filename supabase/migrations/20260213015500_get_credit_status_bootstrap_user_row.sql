-- Fix: get_credit_status should not fail when auth user exists but public.users row is missing.
-- This can happen right after Supabase Auth login before users bootstrap is complete.

create or replace function public.get_credit_status(p_user_id text)
returns table(
  plan_id text,
  monthly_limit integer,
  monthly_balance integer,
  daily_cap integer,
  daily_balance integer,
  remaining integer,
  capacity integer,
  next_daily_reset timestamptz,
  next_monthly_reset timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_user_id text;
  v_auth_user_id text;
  v_auth_user_uuid uuid;
  v_email text;
  v_plan text;
  v_monthly_limit integer;
  v_daily_cap integer;
begin
  perform public.assert_self(p_user_id);

  v_auth_user_id := coalesce(
    nullif(public.daveri_request_user_id(), ''),
    nullif(auth.uid()::text, '')
  );

  if v_auth_user_id is not null then
    begin
      v_auth_user_uuid := v_auth_user_id::uuid;
    exception
      when invalid_text_representation then
        v_auth_user_uuid := null;
    end;
  end if;

  -- 1) Prefer explicit requested id if it already exists.
  select u.id
  into v_effective_user_id
  from public.users as u
  where u.id = p_user_id
  limit 1;

  -- 2) Otherwise resolve by auth id mapping.
  if v_effective_user_id is null and v_auth_user_id is not null then
    select u.id
    into v_effective_user_id
    from public.users as u
    where u.id = v_auth_user_id
       or u.auth_user_id::text = v_auth_user_id
    order by case when u.id = v_auth_user_id then 0 else 1 end
    limit 1;
  end if;

  -- 3) Otherwise resolve by email from JWT.
  if v_effective_user_id is null then
    v_email := nullif(auth.jwt() ->> 'email', '');

    if v_email is not null then
      select u.id
      into v_effective_user_id
      from public.users as u
      where lower(u.email) = lower(v_email)
      limit 1;
    end if;
  end if;

  -- 4) If still missing, bootstrap users row.
  if v_effective_user_id is null then
    if v_auth_user_id is null or btrim(v_auth_user_id) = '' then
      v_auth_user_id := p_user_id;
    end if;

    if v_email is null then
      v_email := nullif(auth.jwt() ->> 'email', '');
    end if;

    if v_email is null and v_auth_user_uuid is not null then
      select au.email
      into v_email
      from auth.users as au
      where au.id = v_auth_user_uuid
      limit 1;
    end if;

    if v_email is null then
      v_email := format('%s@daveri.local', replace(v_auth_user_id, ' ', ''));
    end if;

    begin
      insert into public.users as u (id, email, plan_id, auth_user_id)
      values (v_auth_user_id, v_email, 'free', v_auth_user_uuid)
      on conflict (id) do update
      set
        email = case
          when u.email is null or btrim(u.email) = '' then excluded.email
          else u.email
        end,
        auth_user_id = coalesce(u.auth_user_id, excluded.auth_user_id)
      returning u.id into v_effective_user_id;
    exception
      when unique_violation then
        update public.users as u
        set auth_user_id = coalesce(u.auth_user_id, v_auth_user_uuid)
        where lower(u.email) = lower(v_email);

        select u.id
        into v_effective_user_id
        from public.users as u
        where lower(u.email) = lower(v_email)
        limit 1;
    end;
  end if;

  if v_effective_user_id is null then
    raise exception 'Unable to resolve user row for get_credit_status';
  end if;

  -- Keep mapping sticky when available.
  if v_auth_user_uuid is not null then
    update public.users as u
    set auth_user_id = coalesce(u.auth_user_id, v_auth_user_uuid)
    where u.id = v_effective_user_id;
  end if;

  select vep.plan_id
  into v_plan
  from public.v_effective_plan as vep
  where vep.user_id = v_effective_user_id
  limit 1;

  select
    (
      select ve.limit_value
      from public.v_effective_entitlements as ve
      where ve.user_id = v_effective_user_id
        and ve.feature_key = 'monthly_credits'
      limit 1
    ),
    (
      select ve.limit_value
      from public.v_effective_entitlements as ve
      where ve.user_id = v_effective_user_id
        and ve.feature_key = 'daily_credits_cap'
      limit 1
    )
  into v_monthly_limit, v_daily_cap;

  insert into public.user_credit_state as ucs (user_id)
  values (v_effective_user_id)
  on conflict (user_id) do nothing;

  return query
  select
    v_plan as plan_id,
    v_monthly_limit as monthly_limit,
    ucs.monthly_balance,
    v_daily_cap as daily_cap,
    ucs.daily_balance,
    (ucs.monthly_balance + ucs.daily_balance) as remaining,
    case
      when v_monthly_limit is null or v_daily_cap is null then null
      else (v_monthly_limit + v_daily_cap)
    end as capacity,
    ucs.next_daily_reset,
    ucs.next_monthly_reset
  from public.user_credit_state as ucs
  where ucs.user_id = v_effective_user_id;
end;
$$;

do $$
begin
  execute 'revoke all on function public.get_credit_status(text) from public';
  execute 'revoke all on function public.get_credit_status(text) from anon';
  execute 'grant execute on function public.get_credit_status(text) to authenticated, service_role';
end
$$;
