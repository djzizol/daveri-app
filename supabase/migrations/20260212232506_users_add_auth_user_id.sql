-- Add auth UID mapping to internal users table
alter table public.users
add column if not exists auth_user_id uuid;

create index if not exists idx_users_auth_user_id
on public.users (auth_user_id);

-- Backfill by matching email to auth.users (one-time)
update public.users u
set auth_user_id = a.id
from auth.users a
where u.auth_user_id is null
  and lower(u.email) = lower(a.email);
