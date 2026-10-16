-- HealthHyr v2 schema. Supabase (Postgres 15+).
-- Design notes live in docs/PLAN.md. This file is the executable source of truth.
create extension if not exists pgcrypto;

-- ───────── enums ─────────
create type user_role           as enum ('seeker','employer','admin');
create type care_role           as enum ('pca','hha','cna','rn','lpn','caregiver','other');
create type employment_type     as enum ('full_time','part_time','per_diem','contract','live_in');
create type pay_period          as enum ('hour','day','week','month','year');
create type shift_pref          as enum ('day','evening','overnight','weekend');
create type job_status          as enum ('draft','pending_payment','published','expired','closed');
create type application_status  as enum ('submitted','viewed','shortlisted','interview','hired','rejected','withdrawn');
create type payment_status      as enum ('pending','succeeded','failed','canceled','needs_review','refunded');
create type subscription_status as enum ('incomplete','active','past_due','canceled');
create type language_level      as enum ('basic','conversational','fluent','native');
create type contact_status      as enum ('new','handled');

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Helper functions that take arbitrary ids live in a schema the Data API does not expose.
-- In `public` they would be callable by any signed-in user through RPC, which would let someone
-- probe who opted in, who applied where, and who has Hiring Pro.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ───────── tables ─────────
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  role               user_role not null,
  email              text not null,
  full_name          text,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table employer_profiles (
  id           uuid primary key references profiles(id) on delete cascade,
  company_name text not null default 'My company',
  is_listed    boolean not null default false,          -- trigger-managed
  slug         text unique,                             -- trigger-managed, stable once set
  description  text,
  website      text,
  logo_url     text,
  industry     text,
  company_size text,
  city         text,
  state        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table seeker_profiles (
  id                     uuid primary key references profiles(id) on delete cascade,
  display_name           text not null,
  headline               text,
  summary                text,
  care_role              care_role,
  city                   text,
  state                  text,
  available_from         date,
  shift_preferences      shift_pref[] not null default '{}',
  avatar_url             text,
  is_visible             boolean not null default false,
  visibility_opted_in_at timestamptz,                    -- trigger-managed consent record
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table seeker_private (                            -- contact details, never in directory results
  id         uuid primary key references seeker_profiles(id) on delete cascade,
  phone      text,
  zip        text,
  resume_url text,
  updated_at timestamptz not null default now()
);

create table seeker_experience (
  id          uuid primary key default gen_random_uuid(),
  seeker_id   uuid not null references seeker_profiles(id) on delete cascade,
  title       text not null,
  employer    text not null,
  city        text,
  state       text,
  start_date  date not null,
  end_date    date,
  description text,
  check (end_date is null or end_date >= start_date)
);
create table seeker_certifications (
  id         uuid primary key default gen_random_uuid(),
  seeker_id  uuid not null references seeker_profiles(id) on delete cascade,
  name       text not null,
  issuer     text,
  issued_on  date,
  expires_on date
);
create table seeker_languages (
  id        uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  language  text not null,
  level     language_level not null default 'conversational',
  unique (seeker_id, language)
);
create index on seeker_experience(seeker_id);
create index on seeker_certifications(seeker_id);
create index on seeker_languages(seeker_id);

create table jobs (
  id              uuid primary key default gen_random_uuid(),
  employer_id     uuid not null references employer_profiles(id) on delete cascade,
  title           text not null,
  description     text not null,
  care_role       care_role not null,
  employment_type employment_type not null,
  city            text not null,
  state           text not null,
  zip             text,
  pay_min         numeric(10,2),
  pay_max         numeric(10,2),
  pay_period      pay_period,
  easy_apply      boolean not null default true,
  status          job_status not null default 'draft',
  payment_id      uuid,                                  -- FK added after payments
  published_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (pay_max is null or pay_min is null or pay_max >= pay_min),
  check (status <> 'published' or (published_at is not null and expires_at is not null))
);
create index jobs_public_idx   on jobs (status, expires_at desc);
create index jobs_employer_idx on jobs (employer_id);

create table payments (
  id                         uuid primary key default gen_random_uuid(),
  employer_id                uuid not null references employer_profiles(id),
  job_id                     uuid not null references jobs(id),   -- restrict: payment history is never deleted
  product                    text not null default 'pay_per_post',
  amount_cents               integer not null check (amount_cents > 0),
  currency                   text not null default 'usd',
  status                     payment_status not null default 'pending',
  consumed_at                timestamptz,                -- set by publish_job; a payment publishes once
  failure_reason             text,
  needs_review_at            timestamptz,
  stripe_refund_id           text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  alert_emailed_at           timestamptz,                -- set when the needs_review alert email was sent
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index on payments(employer_id);
create index on payments(job_id);
create unique index payments_one_open_per_job on payments(job_id) where status = 'pending';
alter table jobs add constraint jobs_payment_fk foreign key (payment_id) references payments(id);
create unique index jobs_payment_unique on jobs(payment_id) where payment_id is not null;

create table subscriptions (                              -- Hiring Pro; unused at launch
  id                     uuid primary key default gen_random_uuid(),
  employer_id            uuid not null references employer_profiles(id),
  plan                   text not null default 'hiring_pro',
  status                 subscription_status not null default 'incomplete',
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table applications (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  seeker_id     uuid not null references seeker_profiles(id) on delete cascade,
  status        application_status not null default 'submitted',
  is_easy_apply boolean not null default false,
  cover_note    text,
  resume_url    text,                                    -- private-bucket copy made at apply time
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (job_id, seeker_id),
  constraint applications_withdrawn_clean
    check (status <> 'withdrawn' or (resume_url is null and cover_note is null))
);
create index on applications(seeker_id);

create table saved_jobs (
  seeker_id  uuid not null references seeker_profiles(id) on delete cascade,
  job_id     uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seeker_id, job_id)
);

create table messages (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid not null references profiles(id) on delete cascade,
  recipient_id   uuid not null references profiles(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  body           text not null check (length(body) between 1 and 4000),
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index on messages (recipient_id, created_at desc);
create index on messages (sender_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
create unique index notifications_launch_once on notifications (user_id, type)
  where type = 'hiring_pro_launched';

create table webhook_events (
  stripe_event_id text primary key,
  type            text not null,
  payload         jsonb not null,
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  processed_at    timestamptz,
  error           text,
  received_at     timestamptz not null default now()
);

create table admin_audit_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid references profiles(id),
  system_actor text,                                      -- e.g. 'system:webhook'
  action       text not null,
  target_type  text not null,
  target_id    text,
  details      jsonb,
  created_at   timestamptz not null default now(),
  check ((admin_id is not null) <> (system_actor is not null))
);

create table contact_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  name       text not null check (length(name) between 1 and 120),
  email      text not null check (position('@' in email) > 1 and length(email) <= 254),
  topic      text not null check (topic in ('general','employer_support','seeker_support','billing')),
  message    text not null check (length(message) between 10 and 4000),
  status     contact_status not null default 'new',
  handled_by uuid references profiles(id),
  handled_at timestamptz,
  emailed_at timestamptz,                                 -- set when the support alert email was sent
  created_at timestamptz not null default now()
);

-- ───────── updated_at triggers ─────────
do $$ declare t text; begin
  foreach t in array array['profiles','employer_profiles','seeker_profiles','seeker_private',
                           'jobs','payments','subscriptions','applications'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t||'_updated', t);
  end loop; end $$;

-- ───────── helper functions (tables above must exist) ─────────
create function private.is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create function private.employer_holds_application_from(p_seeker uuid, p_employer uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications a join jobs j on j.id = a.job_id
                  where a.seeker_id = p_seeker and j.employer_id = p_employer
                    and a.status <> 'withdrawn') $$;

create function private.has_active_hiring_pro(p_employer uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s
                  where s.employer_id = p_employer and s.plan = 'hiring_pro'
                    and s.status = 'active' and s.current_period_end > now()) $$;

create function private.employer_can_view_seeker(p_seeker uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select private.employer_holds_application_from(p_seeker, auth.uid())
      or (private.has_active_hiring_pro(auth.uid())
          and exists (select 1 from seeker_profiles s where s.id = p_seeker and s.is_visible)) $$;

create function private.can_message(p_sender uuid, p_recipient uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select case (select role from profiles where id = p_sender)
    when 'employer' then
      private.employer_holds_application_from(p_recipient, p_sender)
      or (private.has_active_hiring_pro(p_sender)
          and exists (select 1 from seeker_profiles s where s.id = p_recipient and s.is_visible))
    when 'seeker' then
      exists (select 1 from messages m where m.sender_id = p_recipient and m.recipient_id = p_sender)
      or exists (select 1 from applications a join jobs j on j.id = a.job_id
                  where a.seeker_id = p_sender and j.employer_id = p_recipient and a.status <> 'withdrawn')
    else false end $$;

-- single source of truth for "can this job be paid for and published"
create function job_missing_fields(p_job uuid) returns text[]
  language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when length(trim(coalesce(j.title,'')))       < 5  then 'title' end,
    case when length(trim(coalesce(j.description,''))) < 50 then 'description' end,
    case when j.care_role is null                           then 'care_role' end,
    case when j.employment_type is null                     then 'employment_type' end,
    case when length(trim(coalesce(j.city,''))) = 0         then 'city' end,
    case when length(trim(coalesce(j.state,''))) = 0        then 'state' end,
    case when (j.pay_min is not null or j.pay_max is not null)
              and j.pay_period is null                      then 'pay_period' end
  ], null) from jobs j where j.id = p_job $$;
revoke all on function job_missing_fields(uuid) from public, anon, authenticated;

-- ───────── signup ─────────
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  r := case new.raw_user_meta_data->>'role'
         when 'employer' then 'employer'::user_role
         else 'seeker'::user_role end;                  -- never 'admin' from client input
  insert into profiles (id, role, email, full_name)
  values (new.id, r, new.email, new.raw_user_meta_data->>'full_name');
  if r = 'employer' then
    insert into employer_profiles (id) values (new.id);  -- company_name stays the default until edited
  else
    insert into seeker_profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New seeker'));
    insert into seeker_private (id) values (new.id);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────── column and transition guards ─────────
create function profiles_lock_columns() returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' and
     (new.role is distinct from old.role or
      new.stripe_customer_id is distinct from old.stripe_customer_id) then
    raise exception 'role and billing fields are server-managed';
  end if;
  return new;
end $$;
create trigger profiles_lock before update on profiles
  for each row execute function profiles_lock_columns();

create function employer_profiles_listing() returns trigger language plpgsql as $$
begin
  new.is_listed := length(trim(coalesce(new.company_name,''))) > 0
                   and new.company_name is distinct from 'My company';
  if new.is_listed and new.slug is null then
    new.slug := trim(both '-' from lower(regexp_replace(new.company_name, '[^a-zA-Z0-9]+', '-', 'g')))
                || '-' || left(new.id::text, 6);
  end if;
  return new;
end $$;
create trigger employer_profiles_listing_t before insert or update on employer_profiles
  for each row execute function employer_profiles_listing();

create function seeker_visibility_stamp() returns trigger language plpgsql as $$
begin
  new.visibility_opted_in_at := case
    when not new.is_visible then null
    when tg_op = 'UPDATE' and old.is_visible then old.visibility_opted_in_at
    else now() end;
  return new;
end $$;
create trigger seeker_visibility_t before insert or update on seeker_profiles
  for each row execute function seeker_visibility_stamp();

create function jobs_guard() returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.payment_id is not null
       or new.published_at is not null or new.expires_at is not null then
      raise exception 'new jobs must be drafts'; end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.payment_id is distinct from old.payment_id
     or new.published_at is distinct from old.published_at or new.expires_at is distinct from old.expires_at
     or new.employer_id is distinct from old.employer_id then
    raise exception 'status, payment and dates are server-managed'; end if;
  if old.status = 'pending_payment'
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'cancel checkout before editing this job'; end if;
  return new;
end $$;
create trigger jobs_guard_t before insert or update on jobs
  for each row execute function jobs_guard();

create function applications_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'only status can change'; end if;
    if old.seeker_id = auth.uid() then
      if new.status <> 'withdrawn' or old.status = 'withdrawn' then
        raise exception 'seekers may only withdraw'; end if;
    elsif exists (select 1 from jobs j where j.id = old.job_id and j.employer_id = auth.uid()) then
      if old.status = 'withdrawn'
         or new.status not in ('viewed','shortlisted','interview','hired','rejected') then
        raise exception 'invalid status for employer'; end if;
    else raise exception 'not allowed'; end if;
  end if;
  if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then   -- every caller
    new.resume_url := null; new.cover_note := null;
  end if;
  return new;
end $$;
create trigger applications_guard_t before update on applications
  for each row execute function applications_guard();

create function messages_guard() returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at')
     or old.read_at is not null or new.read_at is null then
    raise exception 'recipients may only mark an unread message as read'; end if;
  return new;
end $$;
create trigger messages_guard_t before update on messages
  for each row execute function messages_guard();

-- ───────── server-only state transitions (service role only) ─────────
-- errcodes: HY001 publish refused (permanent), HY002 checkout refused, HY003 cancel refused, HY004 close/reopen refused

create function start_checkout(p_job uuid, p_employer uuid, p_amount integer) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_status job_status; v_missing text[]; v_pay uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  select status into v_status from jobs where id = p_job and employer_id = p_employer for update;
  if not found then raise exception 'checkout_refused:job_not_found' using errcode = 'HY002'; end if;
  if v_status not in ('draft','pending_payment') then
    raise exception 'checkout_refused:job_wrong_status' using errcode = 'HY002'; end if;
  if not exists (select 1 from employer_profiles where id = p_employer and is_listed) then
    raise exception 'checkout_refused:employer_not_listed' using errcode = 'HY002'; end if;
  v_missing := job_missing_fields(p_job);
  if cardinality(v_missing) > 0 then
    raise exception 'checkout_refused:job_incomplete:%', array_to_string(v_missing, ',') using errcode = 'HY002'; end if;
  select id into v_pay from payments where job_id = p_job and status = 'pending';
  if v_pay is null then
    insert into payments (employer_id, job_id, amount_cents) values (p_employer, p_job, p_amount)
    returning id into v_pay;
  end if;
  update jobs set status = 'pending_payment' where id = p_job;
  return v_pay;
end $$;

create function cancel_checkout(p_job uuid, p_employer uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  perform 1 from jobs where id = p_job and employer_id = p_employer for update;
  if exists (select 1 from payments where job_id = p_job and status = 'succeeded' and consumed_at is null) then
    raise exception 'cancel_refused:payment_succeeded' using errcode = 'HY003'; end if;
  update payments set status = 'canceled' where job_id = p_job and status = 'pending';
  update jobs set status = 'draft' where id = p_job and employer_id = p_employer and status = 'pending_payment';
  if not found then raise exception 'cancel_refused:job_not_pending_payment' using errcode = 'HY003'; end if;
end $$;

-- The reason is worked out BEFORE any change is made: a data-modifying CTE runs even when the job
-- update matches nothing, so diagnosing afterwards would see the payment as already consumed.
create function publish_job(p_job uuid, p_payment uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare n int; v_reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  perform 1 from jobs where id = p_job for update;
  perform 1 from payments where id = p_payment for update;

  v_reason := case
    when not exists (select 1 from jobs where id = p_job)                                  then 'job_missing'
    when not exists (select 1 from payments where id = p_payment and job_id = p_job)       then 'payment_not_for_job'
    when exists (select 1 from payments where id = p_payment and consumed_at is not null)  then 'payment_already_consumed'
    when not exists (select 1 from payments where id = p_payment and status = 'succeeded') then 'payment_not_succeeded'
    when not exists (select 1 from jobs where id = p_job and status = 'pending_payment')   then 'job_not_pending_payment'
    when not exists (select 1 from jobs j join employer_profiles e on e.id = j.employer_id
                      where j.id = p_job and e.is_listed)                                  then 'employer_not_listed'
    when cardinality(job_missing_fields(p_job)) > 0                                        then 'job_incomplete'
    else null end;
  if v_reason is not null then
    raise exception 'publish_refused:%', v_reason using errcode = 'HY001';
  end if;

  -- One statement: mark the payment consumed and publish the job together.
  with spent as (
    update payments set consumed_at = now()
     where id = p_payment and job_id = p_job and status = 'succeeded' and consumed_at is null
     returning employer_id)
  update jobs j set status = 'published', payment_id = p_payment,
         published_at = now(), expires_at = now() + interval '30 days'
    from spent
   where j.id = p_job and j.employer_id = spent.employer_id and j.status = 'pending_payment';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'publish_refused:unexpected_state' using errcode = 'HY001';   -- rolls back: payment stays unconsumed
  end if;
end $$;

create function close_job(p_job uuid, p_employer uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  update jobs set status = 'closed' where id = p_job and employer_id = p_employer and status = 'published';
  if not found then raise exception 'close_refused:job_wrong_status' using errcode = 'HY004'; end if;
end $$;

-- closed + expires_at in the future -> published (no payment, same expires_at)
-- expired, or closed past expires_at -> draft (needs a new payment)
create function reopen_job(p_job uuid, p_employer uuid) returns job_status
  language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  select * into j from jobs where id = p_job and employer_id = p_employer for update;
  if not found then raise exception 'reopen_refused:job_not_found' using errcode = 'HY004'; end if;
  if j.status = 'closed' and j.expires_at > now() then
    update jobs set status = 'published' where id = p_job;
    return 'published';
  elsif j.status in ('expired','closed') then
    update jobs set status = 'draft', payment_id = null, published_at = null, expires_at = null where id = p_job;
    return 'draft';
  end if;
  raise exception 'reopen_refused:job_wrong_status' using errcode = 'HY004';
end $$;

create function expire_jobs() returns integer
  language sql security definer set search_path = public as
$$ with u as (update jobs set status = 'expired'
              where status = 'published' and expires_at <= now() returning 1)
   select count(*)::int from u $$;

revoke all on function start_checkout(uuid,uuid,integer), cancel_checkout(uuid,uuid), publish_job(uuid,uuid),
  close_job(uuid,uuid), reopen_job(uuid,uuid), expire_jobs() from public, anon, authenticated;

-- ───────── row-level security ─────────
alter table profiles          enable row level security;
alter table employer_profiles enable row level security;
alter table seeker_profiles   enable row level security;
alter table seeker_private    enable row level security;
alter table seeker_experience enable row level security;
alter table seeker_certifications enable row level security;
alter table seeker_languages  enable row level security;
alter table jobs              enable row level security;
alter table payments          enable row level security;
alter table subscriptions     enable row level security;
alter table applications      enable row level security;
alter table saved_jobs        enable row level security;
alter table messages          enable row level security;
alter table notifications     enable row level security;
alter table webhook_events    enable row level security;   -- no policies: service role only
alter table admin_audit_log   enable row level security;
alter table contact_messages  enable row level security;

create policy profiles_select on profiles for select using (id = auth.uid() or private.is_admin());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy employer_select on employer_profiles for select
  using (is_listed or id = auth.uid() or private.is_admin());
create policy employer_update on employer_profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy seeker_self on seeker_profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy seeker_employer_read on seeker_profiles for select
  using (private.employer_can_view_seeker(id) or private.is_admin());

create policy private_self on seeker_private for all using (id = auth.uid()) with check (id = auth.uid());
create policy private_applicant_employer on seeker_private for select
  using (private.employer_holds_application_from(id, auth.uid()));       -- no admin policy, no visibility branch

do $$ declare t text; begin
  foreach t in array array['seeker_experience','seeker_certifications','seeker_languages'] loop
    execute format('create policy %I on %I for all using (seeker_id = auth.uid()) with check (seeker_id = auth.uid())', t||'_self', t);
    execute format('create policy %I on %I for select using (private.employer_can_view_seeker(seeker_id) or private.is_admin())', t||'_employer', t);
  end loop; end $$;

create policy jobs_public_read on jobs for select
  using (status = 'published' and expires_at > now()
         and exists (select 1 from employer_profiles e where e.id = employer_id and e.is_listed));
create policy jobs_owner_read   on jobs for select using (employer_id = auth.uid() or private.is_admin());
create policy jobs_owner_insert on jobs for insert with check (employer_id = auth.uid());
create policy jobs_owner_update on jobs for update using (employer_id = auth.uid()) with check (employer_id = auth.uid());
create policy jobs_owner_delete on jobs for delete
  using (employer_id = auth.uid() and status = 'draft'
         and not exists (select 1 from payments p where p.job_id = jobs.id));

create policy app_seeker_read on applications for select using (seeker_id = auth.uid());
create policy app_employer_read on applications for select
  using (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()) or private.is_admin());
create policy app_seeker_update on applications for update
  using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());
create policy app_employer_update on applications for update
  using (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()))
  with check (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()));
-- inserts: API only (service role)

create policy saved_self on saved_jobs for all using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());

create policy msg_read on messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid() or private.is_admin());
create policy msg_send on messages for insert
  with check (sender_id = auth.uid() and private.can_message(sender_id, recipient_id));
create policy msg_mark_read on messages for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_mark_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pay_read on payments for select using (employer_id = auth.uid() or private.is_admin());
create policy sub_read on subscriptions for select using (employer_id = auth.uid() or private.is_admin());
create policy audit_read on admin_audit_log for select using (private.is_admin());
create policy contact_admin_read on contact_messages for select using (private.is_admin());

-- ───────── privileges ─────────
-- Supabase grants every Data API role ALL on new tables by default, including TRUNCATE, which
-- row-level security does not cover. Start from nothing and grant exactly what each role needs;
-- row-level security then narrows the rows. Tests fail if a later migration leaves a gap.
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- anon: the public job board only.
grant select on jobs, employer_profiles to anon;

-- authenticated: reads (rows narrowed by the policies above). webhook_events is not readable.
grant select on profiles, employer_profiles, seeker_profiles, seeker_private, seeker_experience,
  seeker_certifications, seeker_languages, jobs, payments, subscriptions, applications, saved_jobs,
  messages, notifications, admin_audit_log, contact_messages to authenticated;

-- authenticated: writes, column by column where a column must stay server-managed.
grant insert, update, delete on saved_jobs, seeker_experience, seeker_certifications, seeker_languages to authenticated;
grant update (full_name) on profiles to authenticated;
grant update (company_name, description, website, logo_url, industry, company_size, city, state)
  on employer_profiles to authenticated;
grant update (display_name, headline, summary, care_role, city, state, available_from,
              shift_preferences, avatar_url, is_visible) on seeker_profiles to authenticated;
grant update (phone, zip, resume_url) on seeker_private to authenticated;
grant insert (employer_id, title, description, care_role, employment_type, city, state, zip,
              pay_min, pay_max, pay_period, easy_apply) on jobs to authenticated;
grant update (title, description, care_role, employment_type, city, state, zip,
              pay_min, pay_max, pay_period, easy_apply) on jobs to authenticated;
grant delete on jobs to authenticated;
grant update (status) on applications to authenticated;
grant insert (sender_id, recipient_id, application_id, body) on messages to authenticated;
grant update (read_at) on messages to authenticated;
grant update (read_at) on notifications to authenticated;

revoke update, delete, truncate on admin_audit_log from service_role;      -- append-only
