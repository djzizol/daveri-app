create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "vector" with schema "public";


  create table "public"."bot_files" (
    "id" uuid not null default gen_random_uuid(),
    "bot_id" uuid not null,
    "name" text not null,
    "mime_type" text,
    "size_bytes" bigint,
    "url" text,
    "status" text default 'processing'::text,
    "created_at" timestamp with time zone not null default now(),
    "owner_id" text
      );


alter table "public"."bot_files" enable row level security;


  create table "public"."bots" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "system_prompt" text,
    "model" text,
    "status" text default 'draft'::text,
    "created_at" timestamp with time zone default now(),
    "bubble_user_id" text,
    "avatar" text,
    "appearance" jsonb,
    "updated_at" timestamp with time zone default now(),
    "public_id" text,
    "user_id" text,
    "config" jsonb not null default '{}'::jsonb,
    "owner_id" text,
    "installed" boolean not null default false,
    "temperature" real,
    "prompt_mode" text not null default 'simple'::text
      );


alter table "public"."bots" enable row level security;


  create table "public"."chat_sessions" (
    "session_id" uuid not null,
    "bot_id" uuid not null,
    "history" jsonb not null default '[]'::jsonb,
    "context" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."conversations" (
    "id" uuid not null default gen_random_uuid(),
    "bot_id" uuid not null,
    "visitor_id" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "last_message_preview" text,
    "last_message_at" timestamp with time zone,
    "messages_count" integer not null default 0
      );



  create table "public"."embeddings" (
    "id" uuid not null default gen_random_uuid(),
    "bot_id" uuid not null,
    "file_id" uuid not null,
    "content" text not null,
    "embedding" public.vector(1536),
    "created_at" timestamp with time zone default now()
      );



  create table "public"."features" (
    "key" text not null,
    "type" text not null,
    "description" text
      );



  create table "public"."files" (
    "id" uuid not null default gen_random_uuid(),
    "bot_id" uuid not null,
    "file_name" text not null,
    "storage_path" text not null,
    "processed" boolean default false,
    "created_at" timestamp with time zone default now(),
    "mime_type" text,
    "size_bytes" bigint,
    "url" text,
    "status" text default 'processing'::text,
    "name" text
      );



  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid not null,
    "sender" text not null,
    "role" text not null,
    "content" text not null,
    "created_at" timestamp with time zone not null default now(),
    "metadata" jsonb default '{}'::jsonb
      );



  create table "public"."plan_entitlements" (
    "plan_id" text not null,
    "feature_key" text not null,
    "enabled" boolean,
    "limit_value" integer,
    "meta" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."plans" (
    "id" text not null,
    "name" text,
    "price_monthly" numeric,
    "is_active" boolean not null default true,
    "is_custom" boolean not null default false,
    "sort_order" integer not null default 0
      );


alter table "public"."plans" enable row level security;


  create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" text not null,
    "provider" text not null default 'manual'::text,
    "provider_subscription_id" text,
    "plan_id" text not null,
    "status" text not null,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."subscriptions" enable row level security;


  create table "public"."usage_counters" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" text not null,
    "feature_key" text not null,
    "period" text not null,
    "period_start" date not null,
    "count" integer not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."usage_counters" enable row level security;


  create table "public"."user_credit_state" (
    "user_id" text not null,
    "monthly_balance" integer not null default 0,
    "daily_balance" integer not null default 0,
    "next_monthly_reset" timestamp with time zone not null default ((now() AT TIME ZONE 'utc'::text) + '1 mon'::interval),
    "next_daily_reset" timestamp with time zone not null default (date_trunc('day'::text, (now() AT TIME ZONE 'utc'::text)) + '1 day'::interval),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_credit_state" enable row level security;


  create table "public"."user_plan_overrides" (
    "user_id" text not null,
    "plan_id" text not null,
    "reason" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_plan_overrides" enable row level security;


  create table "public"."users" (
    "id" text not null,
    "email" text not null,
    "plan_id" text not null default 'free'::text,
    "plan_status" text default 'trial'::text,
    "trial_ends_at" timestamp without time zone,
    "messages_used" integer default 0,
    "created_at" timestamp without time zone not null default now()
      );


alter table "public"."users" enable row level security;

CREATE UNIQUE INDEX bot_files_pkey ON public.bot_files USING btree (id);

CREATE INDEX bots_bubble_user_id_idx ON public.bots USING btree (bubble_user_id);

CREATE UNIQUE INDEX bots_pkey ON public.bots USING btree (id);

CREATE UNIQUE INDEX bots_public_id_key ON public.bots USING btree (public_id);

CREATE UNIQUE INDEX chat_sessions_pkey ON public.chat_sessions USING btree (session_id);

CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);

CREATE INDEX embeddings_embedding_idx ON public.embeddings USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');

CREATE UNIQUE INDEX embeddings_pkey ON public.embeddings USING btree (id);

CREATE UNIQUE INDEX features_pkey ON public.features USING btree (key);

CREATE UNIQUE INDEX files_pkey ON public.files USING btree (id);

CREATE INDEX idx_bot_files_bot_id ON public.bot_files USING btree (bot_id);

CREATE INDEX idx_bots_owner_id ON public.bots USING btree (owner_id);

CREATE INDEX idx_conversations_bot_date ON public.conversations USING btree (bot_id, created_at DESC);

CREATE INDEX idx_conversations_visitor ON public.conversations USING btree (visitor_id);

CREATE INDEX idx_messages_conversation_date ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX idx_users_plan ON public.users USING btree (plan_id);

CREATE INDEX idx_users_trial ON public.users USING btree (plan_status, trial_ends_at);

CREATE INDEX idx_users_trial_status_end ON public.users USING btree (plan_status, trial_ends_at);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX plan_entitlements_pkey ON public.plan_entitlements USING btree (plan_id, feature_key);

CREATE UNIQUE INDEX plans_pkey ON public.plans USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE INDEX subscriptions_user_status ON public.subscriptions USING btree (user_id, status);

CREATE INDEX usage_counters_lookup ON public.usage_counters USING btree (user_id, feature_key, period, period_start);

CREATE UNIQUE INDEX usage_counters_pkey ON public.usage_counters USING btree (id);

CREATE UNIQUE INDEX usage_counters_user_id_feature_key_period_period_start_key ON public.usage_counters USING btree (user_id, feature_key, period, period_start);

CREATE UNIQUE INDEX user_credit_state_pkey ON public.user_credit_state USING btree (user_id);

CREATE UNIQUE INDEX user_plan_overrides_pkey ON public.user_plan_overrides USING btree (user_id);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table "public"."bot_files" add constraint "bot_files_pkey" PRIMARY KEY using index "bot_files_pkey";

alter table "public"."bots" add constraint "bots_pkey" PRIMARY KEY using index "bots_pkey";

alter table "public"."chat_sessions" add constraint "chat_sessions_pkey" PRIMARY KEY using index "chat_sessions_pkey";

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY using index "conversations_pkey";

alter table "public"."embeddings" add constraint "embeddings_pkey" PRIMARY KEY using index "embeddings_pkey";

alter table "public"."features" add constraint "features_pkey" PRIMARY KEY using index "features_pkey";

alter table "public"."files" add constraint "files_pkey" PRIMARY KEY using index "files_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."plan_entitlements" add constraint "plan_entitlements_pkey" PRIMARY KEY using index "plan_entitlements_pkey";

alter table "public"."plans" add constraint "plans_pkey" PRIMARY KEY using index "plans_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."usage_counters" add constraint "usage_counters_pkey" PRIMARY KEY using index "usage_counters_pkey";

alter table "public"."user_credit_state" add constraint "user_credit_state_pkey" PRIMARY KEY using index "user_credit_state_pkey";

alter table "public"."user_plan_overrides" add constraint "user_plan_overrides_pkey" PRIMARY KEY using index "user_plan_overrides_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."bot_files" add constraint "bot_files_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE not valid;

alter table "public"."bot_files" validate constraint "bot_files_bot_id_fkey";

alter table "public"."bots" add constraint "bots_public_id_key" UNIQUE using index "bots_public_id_key";

alter table "public"."conversations" add constraint "conversations_bot_fk" FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE not valid;

alter table "public"."conversations" validate constraint "conversations_bot_fk";

alter table "public"."conversations" add constraint "conversations_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE not valid;

alter table "public"."conversations" validate constraint "conversations_bot_id_fkey";

alter table "public"."embeddings" add constraint "fk_bot" FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE not valid;

alter table "public"."embeddings" validate constraint "fk_bot";

alter table "public"."embeddings" add constraint "fk_file" FOREIGN KEY (file_id) REFERENCES public.bot_files(id) ON DELETE CASCADE not valid;

alter table "public"."embeddings" validate constraint "fk_file";

alter table "public"."features" add constraint "features_type_check" CHECK ((type = ANY (ARRAY['boolean'::text, 'quota'::text, 'enum'::text]))) not valid;

alter table "public"."features" validate constraint "features_type_check";

alter table "public"."files" add constraint "fk_bot" FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE not valid;

alter table "public"."files" validate constraint "fk_bot";

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_conversation_id_fkey";

alter table "public"."plan_entitlements" add constraint "plan_entitlements_feature_key_fkey" FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE CASCADE not valid;

alter table "public"."plan_entitlements" validate constraint "plan_entitlements_feature_key_fkey";

alter table "public"."plan_entitlements" add constraint "plan_entitlements_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE not valid;

alter table "public"."plan_entitlements" validate constraint "plan_entitlements_plan_id_fkey";

alter table "public"."plans" add constraint "plans_allowed_ids" CHECK ((id = ANY (ARRAY['free'::text, 'basic'::text, 'premium'::text, 'pro'::text, 'individual'::text]))) not valid;

alter table "public"."plans" validate constraint "plans_allowed_ids";

alter table "public"."plans" add constraint "plans_id_lowercase" CHECK ((id = lower(id))) not valid;

alter table "public"."plans" validate constraint "plans_id_lowercase";

alter table "public"."subscriptions" add constraint "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_plan_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'canceled'::text, 'inactive'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."usage_counters" add constraint "usage_counters_period_check" CHECK ((period = ANY (ARRAY['daily'::text, 'monthly'::text]))) not valid;

alter table "public"."usage_counters" validate constraint "usage_counters_period_check";

alter table "public"."usage_counters" add constraint "usage_counters_user_id_feature_key_period_period_start_key" UNIQUE using index "usage_counters_user_id_feature_key_period_period_start_key";

alter table "public"."usage_counters" add constraint "usage_counters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."usage_counters" validate constraint "usage_counters_user_id_fkey";

alter table "public"."user_credit_state" add constraint "user_credit_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_credit_state" validate constraint "user_credit_state_user_id_fkey";

alter table "public"."user_plan_overrides" add constraint "user_plan_overrides_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) not valid;

alter table "public"."user_plan_overrides" validate constraint "user_plan_overrides_plan_id_fkey";

alter table "public"."user_plan_overrides" add constraint "user_plan_overrides_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_plan_overrides" validate constraint "user_plan_overrides_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.after_user_insert_init_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  perform public.init_user_credits(new.id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_plan_change(p_user_id text, p_new_plan_id text, p_mode text DEFAULT 'upgrade'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_monthly_limit integer;
  v_daily_cap integer;
  v_now timestamptz := (now() at time zone 'utc');
begin
  -- bezpieczeństwo
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- zmień plan od razu (upgrade)
  update public.users
  set plan_id = p_new_plan_id
  where id = p_user_id;

  -- pobierz nowe limity
  select
    (select ve.limit_value
     from public.v_effective_entitlements ve
     where ve.user_id = p_user_id
       and ve.feature_key = 'monthly_credits'
     limit 1),
    (select ve.limit_value
     from public.v_effective_entitlements ve
     where ve.user_id = p_user_id
       and ve.feature_key = 'daily_credits_cap'
     limit 1)
  into v_monthly_limit, v_daily_cap;

  -- ensure credit state exists
  insert into public.user_credit_state(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if p_mode = 'upgrade' then
    -- TWARDY RESET CYKLU (jak nowy zakup)
    update public.user_credit_state
    set
      monthly_balance = coalesce(v_monthly_limit, monthly_balance),
      daily_balance   = coalesce(v_daily_cap, daily_balance),
      next_monthly_reset = v_now + interval '1 month',
      next_daily_reset   = date_trunc('day', v_now) + interval '1 day',
      updated_at = v_now
    where user_id = p_user_id;
  end if;

  -- downgrade: nic nie robimy tutaj (obsłużysz go schedulerem / cronem)
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_self(p_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_user_id <> auth.uid()::text then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_bots_limit(u_id text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  limit_val int;
  used_val int;
  plan_name text;
  plan_status text;
  trial_end timestamp;
begin
  select
    p.bots_limit,
    u.plan_id,
    u.plan_status,
    u.trial_ends_at
  into
    limit_val,
    plan_name,
    plan_status,
    trial_end
  from public.users u
  join public.plans p on p.id = u.plan_id
  where u.id = u_id;

  -- trial skończony
  if plan_status = 'trial' and trial_end is not null and trial_end < now() then
    return false;
  end if;

  -- starter nie może mieć botów
  if plan_name = 'starter' then
    return false;
  end if;

  -- liczymy boty po owner_id
  select count(*) into used_val
  from public.bots
  where owner_id = u_id;

  if limit_val is null then
    return true;
  end if;

  return used_val < limit_val;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_files_limit(u_id text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  limit_val int;
  used_val int;
  plan_name text;
  plan_status text;
  trial_end timestamp;
begin
  select
    p.files_limit,
    u.plan_id,
    u.plan_status,
    u.trial_ends_at
  into
    limit_val,
    plan_name,
    plan_status,
    trial_end
  from public.users u
  join public.plans p on p.id = u.plan_id
  where u.id = u_id;

  -- jeśli trial jest, ale już się skończył → blokujemy
  if plan_status = 'trial' and trial_end is not null and trial_end < now() then
    return false;
  end if;

  -- starter NIGDY nie może wgrywać plików
  if plan_name = 'starter' then
    return false;
  end if;

  -- liczymy ile plików user już ma (po wszystkich jego botach)
  select count(*) into used_val
  from public.bot_files bf
  join public.bots b on b.id = bf.bot_id
  where b.owner_id = u_id;

  -- brak limitu (np. PRO: files_limit = null)
  if limit_val is null then
    return true;
  end if;

  return used_val < limit_val;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_messages_limit(u_id text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  limit_val int;
  used_val int;
  plan_name text;
  plan_status text;
  trial_end timestamp;
begin
  select
    p.messages_limit,
    u.messages_used,
    u.plan_id,
    u.plan_status,
    u.trial_ends_at
  into
    limit_val,
    used_val,
    plan_name,
    plan_status,
    trial_end
  from public.users u
  join public.plans p on p.id = u.plan_id
  where u.id = u_id;

  -- trial skończony → blok
  if plan_status = 'trial' and trial_end is not null and trial_end < now() then
    return false;
  end if;

  -- starter z definicji nic nie może
  if plan_name = 'starter' then
    return false;
  end if;

  -- brak limitu (PRO)
  if limit_val is null then
    return true;
  end if;

  return used_val < limit_val;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_credits_for_user(in_user_id text, in_amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  rec        public.user_plans;
  plan_limit integer;
begin
  if in_amount <= 0 then
    return true;
  end if;

  -- zablokuj rekord usera
  select *
  into rec
  from public.user_plans
  where user_id = in_user_id
  for update;

  if not found then
    return false; -- brak wpisu dla usera
  end if;

  -- reset okresu gdy minął
  if now() > rec.period_end then
    rec.used_in_period := 0;
    rec.period_start   := date_trunc('month', now());
    rec.period_end     := (date_trunc('month', now()) + interval '1 month - 1 second');
  end if;

  -- limit z planu
  select monthly_credits
  into plan_limit
  from public.billing_plans
  where id = rec.plan_id;

  if plan_limit is null then
    return false;
  end if;

  -- czy starczy kredytów
  if rec.used_in_period + in_amount > plan_limit then
    return false;
  end if;

  -- update
  update public.user_plans
  set used_in_period = rec.used_in_period + in_amount,
      period_start   = rec.period_start,
      period_end     = rec.period_end,
      updated_at     = now()
  where user_id = in_user_id;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_message_credit(p_user_id text, p_amount integer DEFAULT 1)
 RETURNS TABLE(allowed boolean, monthly_limit integer, monthly_balance integer, daily_cap integer, daily_balance integer, remaining integer, capacity integer, next_daily_reset timestamp with time zone, next_monthly_reset timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_monthly_limit integer;
  v_daily_cap integer;
  v_now timestamptz := (now() at time zone 'utc');
  v_new_daily_reset timestamptz := (date_trunc('day', v_now) + interval '1 day');
  v_new_monthly_reset timestamptz;
  v_use_daily integer;
  v_left integer := p_amount;
begin
  perform public.assert_self(p_user_id);

  -- ensure state exists
  insert into public.user_credit_state(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- lock state row
  perform 1 from public.user_credit_state where user_id=p_user_id for update;

  -- fetch limits from entitlements
  select
    (select ve.limit_value from public.v_effective_entitlements ve
      where ve.user_id=p_user_id and ve.feature_key='monthly_credits' limit 1),
    (select ve.limit_value from public.v_effective_entitlements ve
      where ve.user_id=p_user_id and ve.feature_key='daily_credits_cap' limit 1)
  into v_monthly_limit, v_daily_cap;

  -- unlimited plan (individual): monthly_limit NULL => allowed always
  if v_monthly_limit is null then
    update public.user_credit_state set updated_at=now() where user_id=p_user_id;

    return query
    select
      true, v_monthly_limit, ucs.monthly_balance, v_daily_cap, ucs.daily_balance,
      (ucs.monthly_balance + ucs.daily_balance) as remaining,
      null as capacity,
      ucs.next_daily_reset, ucs.next_monthly_reset
    from public.user_credit_state ucs
    where ucs.user_id=p_user_id;
    return;
  end if;

  -- DAILY REFILL (set to cap if reset time passed)
  update public.user_credit_state
  set
    daily_balance = case
      when v_daily_cap is null then daily_balance
      when next_daily_reset <= v_now then v_daily_cap
      else daily_balance
    end,
    next_daily_reset = case
      when next_daily_reset <= v_now then v_new_daily_reset
      else next_daily_reset
    end
  where user_id=p_user_id;

  -- MONTHLY REFILL (reset to monthly_limit if passed)
  -- move next_monthly_reset forward by +1 month from previous next_monthly_reset (keeps cadence)
  update public.user_credit_state
  set
    monthly_balance = case
      when next_monthly_reset <= v_now then v_monthly_limit
      else monthly_balance
    end,
    next_monthly_reset = case
      when next_monthly_reset <= v_now then (next_monthly_reset + interval '1 month')
      else next_monthly_reset
    end
  where user_id=p_user_id;

  -- read fresh balances
  select monthly_balance, daily_balance, next_daily_reset, next_monthly_reset
  into monthly_balance, daily_balance, next_daily_reset, next_monthly_reset
  from public.user_credit_state
  where user_id=p_user_id;

  -- total available?
  if (monthly_balance + daily_balance) < p_amount then
    return query
    select
      false, v_monthly_limit, monthly_balance, v_daily_cap, daily_balance,
      (monthly_balance + daily_balance) as remaining,
      (v_monthly_limit + coalesce(v_daily_cap,0)) as capacity,
      next_daily_reset, next_monthly_reset;
    return;
  end if;

  -- consume daily first
  v_use_daily := least(daily_balance, v_left);
  v_left := v_left - v_use_daily;

  update public.user_credit_state
  set
    daily_balance = daily_balance - v_use_daily,
    monthly_balance = monthly_balance - v_left,
    updated_at = now()
  where user_id=p_user_id;

  -- return new state
  return query
  select
    true, v_monthly_limit, ucs.monthly_balance, v_daily_cap, ucs.daily_balance,
    (ucs.monthly_balance + ucs.daily_balance) as remaining,
    (v_monthly_limit + coalesce(v_daily_cap,0)) as capacity,
    ucs.next_daily_reset, ucs.next_monthly_reset
  from public.user_credit_state ucs
  where ucs.user_id=p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_quota_daily(p_user_id text, p_quota_key text, p_amount integer DEFAULT 1)
 RETURNS TABLE(allowed boolean, new_count integer, limit_value integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_limit integer;
  v_enabled boolean;
  v_today date := (now() at time zone 'utc')::date;
  v_current integer;
begin
  perform public.assert_self(p_user_id);

  select ve.enabled, ve.limit_value
    into v_enabled, v_limit
  from public.v_effective_entitlements ve
  where ve.user_id = p_user_id
    and ve.feature_key = p_quota_key
  limit 1;

  if (v_enabled is distinct from true) and (v_limit is null) then
    raise exception 'QUOTA_NOT_ALLOWED:%', p_quota_key using errcode = 'P0001';
  end if;

  insert into public.usage_counters(user_id, feature_key, period, period_start, count)
  values (p_user_id, p_quota_key, 'daily', v_today, 0)
  on conflict (user_id, feature_key, period, period_start)
  do nothing;

  select count into v_current
  from public.usage_counters
  where user_id = p_user_id
    and feature_key = p_quota_key
    and period = 'daily'
    and period_start = v_today
  for update;

  if v_limit is null then
    update public.usage_counters
    set count = count + p_amount,
        updated_at = now()
    where user_id = p_user_id
      and feature_key = p_quota_key
      and period = 'daily'
      and period_start = v_today;

    return query select true, v_current + p_amount, null;
    return;
  end if;

  if (v_current + p_amount) > v_limit then
    return query select false, v_current, v_limit;
    return;
  end if;

  update public.usage_counters
  set count = count + p_amount,
      updated_at = now()
  where user_id = p_user_id
    and feature_key = p_quota_key
    and period = 'daily'
    and period_start = v_today;

  return query select true, v_current + p_amount, v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_bot(p_name text, p_config jsonb, p_bubble_user_id text)
 RETURNS public.bots
 LANGUAGE plpgsql
AS $function$
declare
  new_bot bots;
begin
  insert into public.bots (name, config, owner_id)
  values (p_name, p_config, p_bubble_user_id)
  returning * into new_bot;

  return new_bot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.users
  set
    plan_id = 'starter',
    plan_status = 'expired',
    messages_used = 0 -- możesz wywalić tę linię, jeśli chcesz zachować licznik
  where plan_status = 'trial'
    and trial_ends_at is not null
    and trial_ends_at < now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_bots_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  can_create boolean;
begin
  can_create := public.check_bots_limit(NEW.owner_id);

  if not can_create then
    raise exception 'Bots limit exceeded or plan not allowed';
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_files_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  owner text;
  can_upload boolean;
begin
  select owner_id into owner
  from public.bots
  where id = NEW.bot_id;

  if owner is null then
    raise exception 'Bot has no owner';
  end if;

  can_upload := public.check_files_limit(owner);

  if not can_upload then
    raise exception 'Files limit exceeded or plan not allowed';
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_bot(p_bot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.bots
  set status = 'active',
      updated_at = now()
  where id = p_bot_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_bot_by_id(p_bot_id uuid)
 RETURNS SETOF public.bots
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select *
  from bots
  where id = p_bot_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_credit_status(p_user_id text)
 RETURNS TABLE(plan_id text, monthly_limit integer, monthly_balance integer, daily_cap integer, daily_balance integer, remaining integer, capacity integer, next_daily_reset timestamp with time zone, next_monthly_reset timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_plan text;
  v_monthly_limit integer;
  v_daily_cap integer;
begin
  perform public.assert_self(p_user_id);

  select plan_id into v_plan
  from public.v_effective_plan
  where user_id = p_user_id;

  select
    (select ve.limit_value from public.v_effective_entitlements ve
      where ve.user_id=p_user_id and ve.feature_key='monthly_credits' limit 1),
    (select ve.limit_value from public.v_effective_entitlements ve
      where ve.user_id=p_user_id and ve.feature_key='daily_credits_cap' limit 1)
  into v_monthly_limit, v_daily_cap;

  insert into public.user_credit_state(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  return query
  select
    v_plan,
    v_monthly_limit,
    ucs.monthly_balance,
    v_daily_cap,
    ucs.daily_balance,
    (ucs.monthly_balance + ucs.daily_balance) as remaining,
    case
      when v_monthly_limit is null or v_daily_cap is null then null
      else (v_monthly_limit + v_daily_cap)
    end as capacity,
    ucs.next_daily_reset,
    ucs.next_monthly_reset
  from public.user_credit_state ucs
  where ucs.user_id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daverei_ai_mode(p_user_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v text;
begin
  perform public.assert_self(p_user_id);

  select coalesce(ve.meta->>'mode', 'none') into v
  from public.v_effective_entitlements ve
  where ve.user_id = p_user_id
    and ve.feature_key = 'daverei_ai_mode'
  limit 1;

  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_entitlements_map(p_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v jsonb;
begin
  perform public.assert_self(p_user_id);

  select jsonb_object_agg(
    feature_key,
    jsonb_build_object(
      'enabled', coalesce(enabled,false),
      'limit', limit_value,
      'meta', meta
    )
  )
  into v
  from public.v_effective_entitlements
  where user_id = p_user_id;

  return coalesce(v, '{}'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_quota_limit(p_user_id text, p_quota_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select (
    select ve.limit_value
    from public.v_effective_entitlements ve
    where ve.user_id = p_user_id
      and ve.feature_key = p_quota_key
    limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_quota_status_daily(p_user_id text, p_quota_key text)
 RETURNS TABLE(limit_value integer, used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_limit integer;
  v_today date := (now() at time zone 'utc')::date;
  v_used integer := 0;
begin
  perform public.assert_self(p_user_id);

  select ve.limit_value into v_limit
  from public.v_effective_entitlements ve
  where ve.user_id = p_user_id
    and ve.feature_key = p_quota_key
  limit 1;

  select coalesce(uc.count, 0) into v_used
  from public.usage_counters uc
  where uc.user_id = p_user_id
    and uc.feature_key = p_quota_key
    and uc.period = 'daily'
    and uc.period_start = v_today
  limit 1;

  if v_limit is null then
    return query select null, v_used, null;
  else
    return query select v_limit, v_used, greatest(v_limit - v_used, 0);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_bot_file_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_url  text := 'https://inayqymryrriobowyysw.supabase.co/functions/v1/process-file';
  v_body jsonb;
begin
  -- ciało requestu do Edge Function
  v_body := jsonb_build_object('38613148-109d-4743-bce1-46b41a549ec2', NEW.id::text);

  perform
    net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey',        'sb_publishable_r3Lvhhf751_SNXg_rmCLQA_LJXv381f',
        'Authorization', 'Bearer ' || 'sb_publishable_r3Lvhhf751_SNXg_rmCLQA_LJXv381f'
      ),
      body := v_body
    );

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_feature(p_user_id text, p_feature_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v boolean;
begin
  perform public.assert_self(p_user_id);

  select coalesce(ve.enabled, false) into v
  from public.v_effective_entitlements ve
  where ve.user_id = p_user_id
    and ve.feature_key = p_feature_key
  limit 1;

  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_messages_used(u_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.users
  set messages_used = coalesce(messages_used, 0) + 1
  where id = u_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.init_user_credits(p_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_monthly_limit integer;
  v_daily_cap integer;
  v_now timestamptz := (now() at time zone 'utc');
begin
  -- pobierz limity z planu (effective plan = free na start)
  select
    (select ve.limit_value
     from public.v_effective_entitlements ve
     where ve.user_id = p_user_id
       and ve.feature_key = 'monthly_credits'
     limit 1),
    (select ve.limit_value
     from public.v_effective_entitlements ve
     where ve.user_id = p_user_id
       and ve.feature_key = 'daily_credits_cap'
     limit 1)
  into v_monthly_limit, v_daily_cap;

  -- jeśli coś poszło nie tak, nie inicjalizujemy
  if v_monthly_limit is null and v_daily_cap is null then
    return;
  end if;

  insert into public.user_credit_state (
    user_id,
    monthly_balance,
    daily_balance,
    next_monthly_reset,
    next_daily_reset,
    updated_at
  )
  values (
    p_user_id,
    coalesce(v_monthly_limit, 0),           -- pełny monthly bank
    coalesce(v_daily_cap, 0),                -- pełny daily bucket
    v_now + interval '1 month',              -- miesiąc od rejestracji
    date_trunc('day', v_now) + interval '1 day',
    v_now
  )
  on conflict (user_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings(p_bot_id uuid, p_query_embedding public.vector, p_match_count integer DEFAULT 5)
 RETURNS TABLE(file_id uuid, content text, similarity double precision)
 LANGUAGE sql
AS $function$
  select
    embeddings.file_id,
    embeddings.content,
    1 - (embeddings.embedding <=> p_query_embedding) as similarity
  from embeddings
  where embeddings.bot_id = p_bot_id
  order by embeddings.embedding <=> p_query_embedding
  limit p_match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.set_timestamp_user_plans()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.start_standard_trial(u_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.users
  set
    plan_id = 'standard',
    plan_status = 'trial',
    trial_ends_at = now() + interval '7 days'
  where id = u_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_bot_appearance(p_bot_id uuid, p_appearance jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.bots
  set appearance = p_appearance,
      updated_at = now()
  where id = p_bot_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.use_credits(p_user_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row user_plans;
  v_left integer;
begin
  -- Bez sensu odejmować 0 albo mniej
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true
    );
  end if;

  -- Bierzemy plan użytkownika i blokujemy wiersz na czas transakcji
  select *
  into v_row
  from user_plans
  where user_id = p_user_id
  for update;

  if not found then
    -- brak planu
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_plan'
    );
  end if;

  v_left := coalesce(v_row.credits_left, 0);

  if v_left < p_amount then
    -- za mało kredytów
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_credits',
      'credits_left', v_left,
      'credits_limit', v_row.credits_limit
    );
  end if;

  -- odejmujemy
  update user_plans
  set credits_left = v_left - p_amount,
      updated_at  = now()
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'reason', null,
    'credits_left', v_left - p_amount,
    'credits_limit', v_row.credits_limit
  );
end;
$function$
;

create or replace view "public"."v_effective_plan" as  SELECT u.id AS user_id,
    COALESCE(upo.plan_id, ( SELECT s.plan_id
           FROM public.subscriptions s
          WHERE ((s.user_id = u.id) AND (s.status = ANY (ARRAY['active'::text, 'trialing'::text])))
          ORDER BY s.created_at DESC
         LIMIT 1), u.plan_id) AS plan_id
   FROM (public.users u
     LEFT JOIN public.user_plan_overrides upo ON ((upo.user_id = u.id)));


create or replace view "public"."v_effective_entitlements" as  SELECT ep.user_id,
    ep.plan_id,
    pe.feature_key,
    pe.enabled,
    pe.limit_value,
    pe.meta
   FROM (public.v_effective_plan ep
     JOIN public.plan_entitlements pe ON ((pe.plan_id = ep.plan_id)));


grant delete on table "public"."bot_files" to "anon";

grant insert on table "public"."bot_files" to "anon";

grant references on table "public"."bot_files" to "anon";

grant select on table "public"."bot_files" to "anon";

grant trigger on table "public"."bot_files" to "anon";

grant truncate on table "public"."bot_files" to "anon";

grant update on table "public"."bot_files" to "anon";

grant delete on table "public"."bot_files" to "authenticated";

grant insert on table "public"."bot_files" to "authenticated";

grant references on table "public"."bot_files" to "authenticated";

grant select on table "public"."bot_files" to "authenticated";

grant trigger on table "public"."bot_files" to "authenticated";

grant truncate on table "public"."bot_files" to "authenticated";

grant update on table "public"."bot_files" to "authenticated";

grant delete on table "public"."bot_files" to "service_role";

grant insert on table "public"."bot_files" to "service_role";

grant references on table "public"."bot_files" to "service_role";

grant select on table "public"."bot_files" to "service_role";

grant trigger on table "public"."bot_files" to "service_role";

grant truncate on table "public"."bot_files" to "service_role";

grant update on table "public"."bot_files" to "service_role";

grant delete on table "public"."bots" to "anon";

grant insert on table "public"."bots" to "anon";

grant references on table "public"."bots" to "anon";

grant select on table "public"."bots" to "anon";

grant trigger on table "public"."bots" to "anon";

grant truncate on table "public"."bots" to "anon";

grant update on table "public"."bots" to "anon";

grant delete on table "public"."bots" to "authenticated";

grant insert on table "public"."bots" to "authenticated";

grant references on table "public"."bots" to "authenticated";

grant select on table "public"."bots" to "authenticated";

grant trigger on table "public"."bots" to "authenticated";

grant truncate on table "public"."bots" to "authenticated";

grant update on table "public"."bots" to "authenticated";

grant delete on table "public"."bots" to "service_role";

grant insert on table "public"."bots" to "service_role";

grant references on table "public"."bots" to "service_role";

grant select on table "public"."bots" to "service_role";

grant trigger on table "public"."bots" to "service_role";

grant truncate on table "public"."bots" to "service_role";

grant update on table "public"."bots" to "service_role";

grant delete on table "public"."chat_sessions" to "anon";

grant insert on table "public"."chat_sessions" to "anon";

grant references on table "public"."chat_sessions" to "anon";

grant select on table "public"."chat_sessions" to "anon";

grant trigger on table "public"."chat_sessions" to "anon";

grant truncate on table "public"."chat_sessions" to "anon";

grant update on table "public"."chat_sessions" to "anon";

grant delete on table "public"."chat_sessions" to "authenticated";

grant insert on table "public"."chat_sessions" to "authenticated";

grant references on table "public"."chat_sessions" to "authenticated";

grant select on table "public"."chat_sessions" to "authenticated";

grant trigger on table "public"."chat_sessions" to "authenticated";

grant truncate on table "public"."chat_sessions" to "authenticated";

grant update on table "public"."chat_sessions" to "authenticated";

grant delete on table "public"."chat_sessions" to "service_role";

grant insert on table "public"."chat_sessions" to "service_role";

grant references on table "public"."chat_sessions" to "service_role";

grant select on table "public"."chat_sessions" to "service_role";

grant trigger on table "public"."chat_sessions" to "service_role";

grant truncate on table "public"."chat_sessions" to "service_role";

grant update on table "public"."chat_sessions" to "service_role";

grant delete on table "public"."conversations" to "anon";

grant insert on table "public"."conversations" to "anon";

grant references on table "public"."conversations" to "anon";

grant select on table "public"."conversations" to "anon";

grant trigger on table "public"."conversations" to "anon";

grant truncate on table "public"."conversations" to "anon";

grant update on table "public"."conversations" to "anon";

grant delete on table "public"."conversations" to "authenticated";

grant insert on table "public"."conversations" to "authenticated";

grant references on table "public"."conversations" to "authenticated";

grant select on table "public"."conversations" to "authenticated";

grant trigger on table "public"."conversations" to "authenticated";

grant truncate on table "public"."conversations" to "authenticated";

grant update on table "public"."conversations" to "authenticated";

grant delete on table "public"."conversations" to "service_role";

grant insert on table "public"."conversations" to "service_role";

grant references on table "public"."conversations" to "service_role";

grant select on table "public"."conversations" to "service_role";

grant trigger on table "public"."conversations" to "service_role";

grant truncate on table "public"."conversations" to "service_role";

grant update on table "public"."conversations" to "service_role";

grant delete on table "public"."embeddings" to "anon";

grant insert on table "public"."embeddings" to "anon";

grant references on table "public"."embeddings" to "anon";

grant select on table "public"."embeddings" to "anon";

grant trigger on table "public"."embeddings" to "anon";

grant truncate on table "public"."embeddings" to "anon";

grant update on table "public"."embeddings" to "anon";

grant delete on table "public"."embeddings" to "authenticated";

grant insert on table "public"."embeddings" to "authenticated";

grant references on table "public"."embeddings" to "authenticated";

grant select on table "public"."embeddings" to "authenticated";

grant trigger on table "public"."embeddings" to "authenticated";

grant truncate on table "public"."embeddings" to "authenticated";

grant update on table "public"."embeddings" to "authenticated";

grant delete on table "public"."embeddings" to "service_role";

grant insert on table "public"."embeddings" to "service_role";

grant references on table "public"."embeddings" to "service_role";

grant select on table "public"."embeddings" to "service_role";

grant trigger on table "public"."embeddings" to "service_role";

grant truncate on table "public"."embeddings" to "service_role";

grant update on table "public"."embeddings" to "service_role";

grant delete on table "public"."features" to "anon";

grant insert on table "public"."features" to "anon";

grant references on table "public"."features" to "anon";

grant select on table "public"."features" to "anon";

grant trigger on table "public"."features" to "anon";

grant truncate on table "public"."features" to "anon";

grant update on table "public"."features" to "anon";

grant delete on table "public"."features" to "authenticated";

grant insert on table "public"."features" to "authenticated";

grant references on table "public"."features" to "authenticated";

grant select on table "public"."features" to "authenticated";

grant trigger on table "public"."features" to "authenticated";

grant truncate on table "public"."features" to "authenticated";

grant update on table "public"."features" to "authenticated";

grant delete on table "public"."features" to "service_role";

grant insert on table "public"."features" to "service_role";

grant references on table "public"."features" to "service_role";

grant select on table "public"."features" to "service_role";

grant trigger on table "public"."features" to "service_role";

grant truncate on table "public"."features" to "service_role";

grant update on table "public"."features" to "service_role";

grant delete on table "public"."files" to "anon";

grant insert on table "public"."files" to "anon";

grant references on table "public"."files" to "anon";

grant select on table "public"."files" to "anon";

grant trigger on table "public"."files" to "anon";

grant truncate on table "public"."files" to "anon";

grant update on table "public"."files" to "anon";

grant delete on table "public"."files" to "authenticated";

grant insert on table "public"."files" to "authenticated";

grant references on table "public"."files" to "authenticated";

grant select on table "public"."files" to "authenticated";

grant trigger on table "public"."files" to "authenticated";

grant truncate on table "public"."files" to "authenticated";

grant update on table "public"."files" to "authenticated";

grant delete on table "public"."files" to "service_role";

grant insert on table "public"."files" to "service_role";

grant references on table "public"."files" to "service_role";

grant select on table "public"."files" to "service_role";

grant trigger on table "public"."files" to "service_role";

grant truncate on table "public"."files" to "service_role";

grant update on table "public"."files" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."plan_entitlements" to "anon";

grant insert on table "public"."plan_entitlements" to "anon";

grant references on table "public"."plan_entitlements" to "anon";

grant select on table "public"."plan_entitlements" to "anon";

grant trigger on table "public"."plan_entitlements" to "anon";

grant truncate on table "public"."plan_entitlements" to "anon";

grant update on table "public"."plan_entitlements" to "anon";

grant delete on table "public"."plan_entitlements" to "authenticated";

grant insert on table "public"."plan_entitlements" to "authenticated";

grant references on table "public"."plan_entitlements" to "authenticated";

grant select on table "public"."plan_entitlements" to "authenticated";

grant trigger on table "public"."plan_entitlements" to "authenticated";

grant truncate on table "public"."plan_entitlements" to "authenticated";

grant update on table "public"."plan_entitlements" to "authenticated";

grant delete on table "public"."plan_entitlements" to "service_role";

grant insert on table "public"."plan_entitlements" to "service_role";

grant references on table "public"."plan_entitlements" to "service_role";

grant select on table "public"."plan_entitlements" to "service_role";

grant trigger on table "public"."plan_entitlements" to "service_role";

grant truncate on table "public"."plan_entitlements" to "service_role";

grant update on table "public"."plan_entitlements" to "service_role";

grant delete on table "public"."plans" to "anon";

grant insert on table "public"."plans" to "anon";

grant references on table "public"."plans" to "anon";

grant select on table "public"."plans" to "anon";

grant trigger on table "public"."plans" to "anon";

grant truncate on table "public"."plans" to "anon";

grant update on table "public"."plans" to "anon";

grant delete on table "public"."plans" to "authenticated";

grant insert on table "public"."plans" to "authenticated";

grant references on table "public"."plans" to "authenticated";

grant select on table "public"."plans" to "authenticated";

grant trigger on table "public"."plans" to "authenticated";

grant truncate on table "public"."plans" to "authenticated";

grant update on table "public"."plans" to "authenticated";

grant delete on table "public"."plans" to "service_role";

grant insert on table "public"."plans" to "service_role";

grant references on table "public"."plans" to "service_role";

grant select on table "public"."plans" to "service_role";

grant trigger on table "public"."plans" to "service_role";

grant truncate on table "public"."plans" to "service_role";

grant update on table "public"."plans" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."usage_counters" to "anon";

grant insert on table "public"."usage_counters" to "anon";

grant references on table "public"."usage_counters" to "anon";

grant select on table "public"."usage_counters" to "anon";

grant trigger on table "public"."usage_counters" to "anon";

grant truncate on table "public"."usage_counters" to "anon";

grant update on table "public"."usage_counters" to "anon";

grant delete on table "public"."usage_counters" to "authenticated";

grant insert on table "public"."usage_counters" to "authenticated";

grant references on table "public"."usage_counters" to "authenticated";

grant select on table "public"."usage_counters" to "authenticated";

grant trigger on table "public"."usage_counters" to "authenticated";

grant truncate on table "public"."usage_counters" to "authenticated";

grant update on table "public"."usage_counters" to "authenticated";

grant delete on table "public"."usage_counters" to "service_role";

grant insert on table "public"."usage_counters" to "service_role";

grant references on table "public"."usage_counters" to "service_role";

grant select on table "public"."usage_counters" to "service_role";

grant trigger on table "public"."usage_counters" to "service_role";

grant truncate on table "public"."usage_counters" to "service_role";

grant update on table "public"."usage_counters" to "service_role";

grant delete on table "public"."user_credit_state" to "anon";

grant insert on table "public"."user_credit_state" to "anon";

grant references on table "public"."user_credit_state" to "anon";

grant select on table "public"."user_credit_state" to "anon";

grant trigger on table "public"."user_credit_state" to "anon";

grant truncate on table "public"."user_credit_state" to "anon";

grant update on table "public"."user_credit_state" to "anon";

grant delete on table "public"."user_credit_state" to "authenticated";

grant insert on table "public"."user_credit_state" to "authenticated";

grant references on table "public"."user_credit_state" to "authenticated";

grant select on table "public"."user_credit_state" to "authenticated";

grant trigger on table "public"."user_credit_state" to "authenticated";

grant truncate on table "public"."user_credit_state" to "authenticated";

grant update on table "public"."user_credit_state" to "authenticated";

grant delete on table "public"."user_credit_state" to "service_role";

grant insert on table "public"."user_credit_state" to "service_role";

grant references on table "public"."user_credit_state" to "service_role";

grant select on table "public"."user_credit_state" to "service_role";

grant trigger on table "public"."user_credit_state" to "service_role";

grant truncate on table "public"."user_credit_state" to "service_role";

grant update on table "public"."user_credit_state" to "service_role";

grant delete on table "public"."user_plan_overrides" to "anon";

grant insert on table "public"."user_plan_overrides" to "anon";

grant references on table "public"."user_plan_overrides" to "anon";

grant select on table "public"."user_plan_overrides" to "anon";

grant trigger on table "public"."user_plan_overrides" to "anon";

grant truncate on table "public"."user_plan_overrides" to "anon";

grant update on table "public"."user_plan_overrides" to "anon";

grant delete on table "public"."user_plan_overrides" to "authenticated";

grant insert on table "public"."user_plan_overrides" to "authenticated";

grant references on table "public"."user_plan_overrides" to "authenticated";

grant select on table "public"."user_plan_overrides" to "authenticated";

grant trigger on table "public"."user_plan_overrides" to "authenticated";

grant truncate on table "public"."user_plan_overrides" to "authenticated";

grant update on table "public"."user_plan_overrides" to "authenticated";

grant delete on table "public"."user_plan_overrides" to "service_role";

grant insert on table "public"."user_plan_overrides" to "service_role";

grant references on table "public"."user_plan_overrides" to "service_role";

grant select on table "public"."user_plan_overrides" to "service_role";

grant trigger on table "public"."user_plan_overrides" to "service_role";

grant truncate on table "public"."user_plan_overrides" to "service_role";

grant update on table "public"."user_plan_overrides" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "public bot_files access"
  on "public"."bot_files"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "bots_public_insert"
  on "public"."bots"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "bots_public_select"
  on "public"."bots"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "bots_public_update"
  on "public"."bots"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "user_can_access_own_bots"
  on "public"."bots"
  as permissive
  for all
  to public
using ((owner_id = (auth.uid())::text));



  create policy "dashboard read plans"
  on "public"."plans"
  as permissive
  for select
  to public
using (true);



  create policy "subs_read_own"
  on "public"."subscriptions"
  as permissive
  for select
  to public
using ((user_id = (auth.uid())::text));



  create policy "usage_read_own"
  on "public"."usage_counters"
  as permissive
  for select
  to public
using ((user_id = (auth.uid())::text));



  create policy "credit_state_read_own"
  on "public"."user_credit_state"
  as permissive
  for select
  to public
using ((user_id = (auth.uid())::text));



  create policy "overrides_read_own"
  on "public"."user_plan_overrides"
  as permissive
  for select
  to public
using ((user_id = (auth.uid())::text));



  create policy "dashboard read users"
  on "public"."users"
  as permissive
  for select
  to public
using (true);



  create policy "user_can_see_self"
  on "public"."users"
  as permissive
  for select
  to public
using ((id = (auth.uid())::text));


CREATE TRIGGER trg_bot_file_insert AFTER INSERT ON public.bot_files FOR EACH ROW WHEN ((new.status = 'pending'::text)) EXECUTE FUNCTION public.handle_bot_file_insert();

CREATE TRIGGER trg_enforce_files_limit BEFORE INSERT ON public.bot_files FOR EACH ROW EXECUTE FUNCTION public.enforce_files_limit();

CREATE TRIGGER trg_bots_updated_at BEFORE UPDATE ON public.bots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_enforce_bots_limit BEFORE INSERT ON public.bots FOR EACH ROW EXECUTE FUNCTION public.enforce_bots_limit();

CREATE TRIGGER trg_init_user_credits AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.after_user_insert_init_credits();


  create policy "pliki 6l97g1_0"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'bot-files'::text));



  create policy "pliki 6l97g1_1"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'bot-files'::text));



  create policy "pliki 6l97g1_2"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'bot-files'::text));



  create policy "usuwanie 6l97g1_0"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'bot-files'::text));



  create policy "usuwanie 6l97g1_1"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'bot-files'::text));



