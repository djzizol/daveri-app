-- Fix: get_credit_status() ambiguous reference "plan_id"
-- The RETURNS TABLE output parameter "plan_id" is visible as a PL/pgSQL variable.
-- We must fully qualify source columns (e.g. vep.plan_id).

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
  v_plan text;
  v_monthly_limit integer;
  v_daily_cap integer;
begin
  perform public.assert_self(p_user_id);

  select vep.plan_id
  into v_plan
  from public.v_effective_plan as vep
  where vep.user_id = p_user_id
  limit 1;

  select
    (
      select ve.limit_value
      from public.v_effective_entitlements as ve
      where ve.user_id = p_user_id
        and ve.feature_key = 'monthly_credits'
      limit 1
    ),
    (
      select ve.limit_value
      from public.v_effective_entitlements as ve
      where ve.user_id = p_user_id
        and ve.feature_key = 'daily_credits_cap'
      limit 1
    )
  into v_monthly_limit, v_daily_cap;

  insert into public.user_credit_state as ucs (user_id)
  values (p_user_id)
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
  where ucs.user_id = p_user_id;
end;
$$;

do $$
begin
  execute 'revoke all on function public.get_credit_status(text) from public';
  execute 'revoke all on function public.get_credit_status(text) from anon';
  execute 'grant execute on function public.get_credit_status(text) to authenticated, service_role';
end
$$;
