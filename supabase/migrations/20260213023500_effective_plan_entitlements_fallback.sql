-- Harden effective plan/entitlements views:
-- - user always has fallback plan 'free'
-- - if chosen plan has no entitlements, fallback to free entitlements

create or replace view public.v_effective_plan as
with latest_sub as (
  select
    s.user_id,
    s.plan_id,
    row_number() over (
      partition by s.user_id
      order by s.created_at desc nulls last
    ) as rn
  from public.subscriptions as s
  where s.status = any (array['active'::text, 'trialing'::text])
)
select
  u.id as user_id,
  coalesce(
    upo.plan_id,
    ls.plan_id,
    nullif(u.plan_id, ''),
    'free'
  ) as plan_id
from public.users as u
left join public.user_plan_overrides as upo
  on upo.user_id = u.id
left join latest_sub as ls
  on ls.user_id = u.id
 and ls.rn = 1;

create or replace view public.v_effective_entitlements as
with ep as (
  select
    vep.user_id,
    vep.plan_id
  from public.v_effective_plan as vep
),
resolved as (
  select
    ep.user_id,
    case
      when exists (
        select 1
        from public.plan_entitlements as pe
        where pe.plan_id = ep.plan_id
      ) then ep.plan_id
      else 'free'
    end as plan_id
  from ep
)
select
  r.user_id,
  r.plan_id,
  pe.feature_key,
  pe.enabled,
  pe.limit_value,
  pe.meta
from resolved as r
join public.plan_entitlements as pe
  on pe.plan_id = r.plan_id;
