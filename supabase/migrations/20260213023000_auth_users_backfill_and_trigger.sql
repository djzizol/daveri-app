-- Keep public.users synchronized with auth.users
-- 1) Backfill existing auth users
-- 2) Trigger for future auth user inserts

alter table public.users
add column if not exists auth_user_id uuid;

create index if not exists idx_users_auth_user_id
on public.users (auth_user_id);

-- Link existing rows by email first (safe for legacy ids).
with src as (
  select
    au.id as auth_user_id,
    coalesce(nullif(au.email, ''), au.id::text || '@auth.local') as email
  from auth.users as au
)
update public.users as u
set
  auth_user_id = coalesce(u.auth_user_id, src.auth_user_id),
  email = case
    when u.email is null or btrim(u.email) = '' then src.email
    else u.email
  end
from src
where lower(u.email) = lower(src.email);

-- Insert rows missing in public.users.
insert into public.users as u (id, email, created_at, auth_user_id, plan_id)
select
  au.id::text as id,
  coalesce(nullif(au.email, ''), au.id::text || '@auth.local') as email,
  timezone('utc', coalesce(au.created_at, now())) as created_at,
  au.id as auth_user_id,
  'free' as plan_id
from auth.users as au
left join public.users as by_id
  on by_id.id = au.id::text
left join public.users as by_email
  on lower(by_email.email) = lower(coalesce(nullif(au.email, ''), au.id::text || '@auth.local'))
where by_id.id is null
  and by_email.id is null
on conflict (id) do update
set
  email = case
    when u.email is null or btrim(u.email) = '' then excluded.email
    else u.email
  end,
  auth_user_id = coalesce(u.auth_user_id, excluded.auth_user_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := coalesce(nullif(new.email, ''), new.id::text || '@auth.local');

  begin
    insert into public.users as u (id, email, created_at, auth_user_id, plan_id)
    values (
      new.id::text,
      v_email,
      timezone('utc', coalesce(new.created_at, now())),
      new.id,
      'free'
    )
    on conflict (id) do update
    set
      email = case
        when u.email is null or btrim(u.email) = '' then excluded.email
        else u.email
      end,
      auth_user_id = coalesce(u.auth_user_id, excluded.auth_user_id);
  exception
    when unique_violation then
      update public.users as u
      set
        email = case
          when u.email is null or btrim(u.email) = '' then v_email
          else u.email
        end,
        auth_user_id = coalesce(u.auth_user_id, new.id)
      where lower(u.email) = lower(v_email);
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();
