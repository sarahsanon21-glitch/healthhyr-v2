# HealthHyr v2 build plan (approved)

Approved by the owner on 2026-10-16 after three review rounds. This file is the source of truth if a session resets. Project rules are in `CLAUDE.md`; the palette is in `docs/COLORS.md`. If this file and a later owner instruction disagree, the later instruction wins and this file gets updated in the same commit.

Working rules (from CLAUDE.md): one step at a time, plan first, stop for approval before new code; whole-file rewrites only; run tests before every commit; no fake data; no "verified" claims; Stripe test keys only while building.

---

## 1. Product decisions

- **Pay Per Post $2.50:** one job, 30 days, free edits while live, republishing needs a new payment.
- **Hiring Pro $39.99/month:** shown as "Coming soon" at launch. No checkout button, no subscribe route.
- **Seeker visibility:** opt-in, default OFF. The switch is shown in wave 1 with the approved copy (section 8). There is no directory in wave 1. Only employers with an active Hiring Pro subscription will ever see opted-in seekers.
- **Contact details:** phone, zip and resume live in `seeker_private`. They are visible only to the owner and to employers holding a non-withdrawn application from that seeker. Never in any directory result.
- **Easy Apply** is in v1. Company reviews are not.
- **One role per account** (seeker, employer or admin). Admin can only be set with the service role.
- **Employer page** is not public until the company name is changed from the default `My company`.
- **Withdrawal** is final in wave 1. It clears `resume_url` and `cover_note`, and employers see only the status.
- **Reopen rules:**
  - A `closed` job whose `expires_at` is still in the future goes back to `published`: no payment, same `expires_at`.
  - An `expired` job (or a `closed` job past its `expires_at`) goes back to `draft` and needs a new payment.
- **Hiring Pro planned features** (shown on /pricing, labeled "planned for launch"): opt-in candidate directory search; filters by role, certifications, availability, preferred shifts and city/state; up to 30 new job postings per billing period, each active 30 days; invite candidates to apply. No distance, team or analytics claims.

## 2. Stack and hosting

React 19 + Next.js (App Router) for `apps/web`, Tailwind, Express for `apps/api`, Supabase (Postgres, Auth, Storage), Stripe test mode (hosted Checkout), Zoho SMTP for alert emails, mobile app possible later (it would use the Express API). Express is the only backend and the only place plan limits and Stripe logic live. Next.js is the rendering layer: public pages fetch from public Express endpoints on the server with revalidation; signed-in areas are client components that call Express with the Supabase session token.

### Hosting cost (estimates, verify current prices before choosing providers)

| Service | Role | Development | Launch estimate |
|---|---|---|---|
| Next.js web | Pages, SEO | Free (localhost) | About $7-20/month. Vercel free tier is non-commercial. A small Node host is cheaper. |
| Express API | Plan limits, Stripe webhooks, expiry and reconcile jobs, email alerts | Free (localhost) | About $7-10/month. Must be always-on (free tiers that sleep miss webhooks and jobs). |
| Supabase | Database, auth, storage | Free or local via Docker | About $25/month (Pro). Free projects pause when idle and have no backups. |
| Stripe | Payments | Test mode, free | No monthly fee. 2.9% + $0.30 per card payment: about $0.37 on a $2.50 post (about 15%), net about $2.13. |
| Zoho SMTP | Alert emails | Existing account | Existing |
| Domain | | | About $12-20/year |

Fixed infrastructure is about $40-55/month, roughly 19-26 paid posts per month to cover at $2.13 net each.

## 3. Folder structure

```
healthhyr-v2/
├─ CLAUDE.md, .gitignore, .gitattributes, .env.example files only
├─ docs/                 COLORS.md, PLAN.md
├─ package.json          npm workspaces, shared scripts (test, lint, typecheck)
├─ tests/                repo hygiene tests (no committed secrets, .env ignored)
├─ packages/shared/src/
│  ├─ tokens.ts          the only place colors, fonts, spacing live
│  ├─ constants.ts       prices, 30 days, limits, default company name, contact email
│  ├─ copy.ts            approved user-facing copy that must not drift (visibility switch, pricing disclaimers)
│  ├─ legal/             terms.md, privacy.md (frontmatter status: draft|final)
│  └─ schemas/           zod: job, application, profile, message, contact
├─ apps/web/             Next.js (App Router) + Tailwind
│  └─ src/
│     ├─ app/(public)/   page.tsx (Home), jobs/page.tsx, jobs/[slug]/page.tsx,
│     │                  companies/[slug]/page.tsx, pricing, for-employers, about, contact, terms, privacy
│     ├─ app/(app)/      dashboard, messages, profile, applications (client-side, noindex)
│     ├─ app/sitemap.ts, robots.ts, layout.tsx
│     ├─ components/ui/  base components; components/ feature components
│     └─ lib/            api client, supabase client (anon key only), seo/jobPostingJsonLd.ts, seo/canonical.ts
├─ apps/api/src/
│  ├─ routes/            jobs, applications, payments, webhooks, messages, contact, admin
│  ├─ middleware/        auth (Supabase JWT), validate, rateLimit, requireRole
│  ├─ services/          stripe, checkout, publish, mailer (Zoho SMTP), notifications, jobs (expire, reconcile, retry alerts)
│  └─ lib/               supabaseAdmin (service role), env validation, live-key gate
└─ supabase/
   ├─ migrations/        0001_schema.sql (the SQL in section 5)
   └─ tests/             RLS tests
```

Secrets rule: `.env` files are never committed; only `.env.example` files are. The Supabase service-role key and the Stripe secret key exist only in the API's environment. The web app gets only the public Supabase URL and anon key, plus the API base URL. It holds no Stripe keys (hosted Checkout).

## 4. Design tokens, base components, contrast

`packages/shared/src/tokens.ts` is the only file allowed to contain hex values. Tailwind's default palette is replaced by the tokens, so a class like `bg-red-500` does not exist.

| Token | Hex | Use |
|---|---|---|
| ink | #123E38 | Headings, body text |
| primary | #145B4E | Buttons, links, logo mark, success states |
| lime | #D6ED9B | Fill only, always with ink text |
| paper | #F7F8F3 | Page background |
| surface | #FFFFFF | Cards, inputs, modals |
| line | #DFE6DE | Borders, dividers |
| olive | #749047 | "Hyr" in the logo, headings of 24px or larger only |
| muted | #566A63 | Secondary text |
| danger | #B42318 | Errors and destructive actions (never color alone) |

Fonts: Manrope for headings, DM Sans for body. Minimum text size 12px. Computed contrast ratios live in `docs/COLORS.md`, and a test recomputes them from the tokens (4.5:1 minimum for normal text, 3:1 for olive large headings).

A style guard test scans `apps/web/src` for raw hex values, `text-[Npx]` with N under 12, `text-lime`, and `text-olive` outside large heading components.

Base components (`components/ui/`): Button (primary, secondary, ghost, destructive), IconButton, Input, Textarea, Select, Checkbox, Switch, Field (label, hint, error), Badge (lime fill, ink text), Card, Modal, Tabs, Toast, Spinner, Skeleton, EmptyState, Pagination, Avatar, Logo ("Hyr" in olive), Container, PageHeader, SplitPane (list left, detail right).

## 5. Database schema (`supabase/migrations/0001_schema.sql`)

Design notes:

- `employer_profiles.id` and `seeker_profiles.id` equal `profiles.id`, which equals `auth.users.id`.
- Tables are created first, then functions, then triggers, then RLS and grants. SQL-language functions are validated at creation, so their tables must already exist.
- Two layers protect columns: column-level privileges limit which columns a signed-in user can write at all, and triggers enforce which values and transitions are allowed. Both are bypassed by the service role, which only the API holds.
- Server-only tables (`payments`, `subscriptions`, `webhook_events`, `contact_messages` writes, `notifications` inserts) have no client write path.
- Applications are created and withdrawn through the API, so it can copy the resume, enforce limits and send notifications. The guard trigger still locks direct writes.
- Storage: the `resumes` bucket is private with no client policies. Only the API reads and writes it and hands out signed links that last about 60 seconds.

```sql
-- HealthHyr v2 schema. Supabase (Postgres 15+).
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
create function is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create function employer_holds_application_from(p_seeker uuid, p_employer uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications a join jobs j on j.id = a.job_id
                  where a.seeker_id = p_seeker and j.employer_id = p_employer
                    and a.status <> 'withdrawn') $$;

create function has_active_hiring_pro(p_employer uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s
                  where s.employer_id = p_employer and s.plan = 'hiring_pro'
                    and s.status = 'active' and s.current_period_end > now()) $$;

create function employer_can_view_seeker(p_seeker uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select employer_holds_application_from(p_seeker, auth.uid())
      or (has_active_hiring_pro(auth.uid())
          and exists (select 1 from seeker_profiles s where s.id = p_seeker and s.is_visible)) $$;

create function can_message(p_sender uuid, p_recipient uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select case (select role from profiles where id = p_sender)
    when 'employer' then
      employer_holds_application_from(p_recipient, p_sender)
      or (has_active_hiring_pro(p_sender)
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

create function publish_job(p_job uuid, p_payment uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare n int; v_reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'server only'; end if;
  perform 1 from jobs where id = p_job for update;
  with spent as (
    update payments set consumed_at = now()
     where id = p_payment and job_id = p_job and status = 'succeeded' and consumed_at is null
     returning employer_id)
  update jobs j set status = 'published', payment_id = p_payment,
         published_at = now(), expires_at = now() + interval '30 days'
    from spent
   where j.id = p_job and j.employer_id = spent.employer_id
     and j.status = 'pending_payment'
     and exists (select 1 from employer_profiles e where e.id = j.employer_id and e.is_listed)
     and cardinality(job_missing_fields(j.id)) = 0;
  get diagnostics n = row_count;
  if n = 1 then return; end if;
  v_reason := case
    when not exists (select 1 from jobs where id = p_job)                                  then 'job_missing'
    when not exists (select 1 from payments where id = p_payment and job_id = p_job)       then 'payment_not_for_job'
    when exists (select 1 from payments where id = p_payment and consumed_at is not null)  then 'payment_already_consumed'
    when not exists (select 1 from payments where id = p_payment and status = 'succeeded') then 'payment_not_succeeded'
    when not exists (select 1 from jobs where id = p_job and status = 'pending_payment')   then 'job_not_pending_payment'
    when not exists (select 1 from jobs j join employer_profiles e on e.id = j.employer_id
                      where j.id = p_job and e.is_listed)                                  then 'employer_not_listed'
    else 'job_incomplete' end;
  raise exception 'publish_refused:%', v_reason using errcode = 'HY001';   -- rolls back: payment stays unconsumed
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

create policy profiles_select on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy employer_select on employer_profiles for select
  using (is_listed or id = auth.uid() or is_admin());
create policy employer_update on employer_profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy seeker_self on seeker_profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy seeker_employer_read on seeker_profiles for select
  using (employer_can_view_seeker(id) or is_admin());

create policy private_self on seeker_private for all using (id = auth.uid()) with check (id = auth.uid());
create policy private_applicant_employer on seeker_private for select
  using (employer_holds_application_from(id, auth.uid()));       -- no admin policy, no visibility branch

do $$ declare t text; begin
  foreach t in array array['seeker_experience','seeker_certifications','seeker_languages'] loop
    execute format('create policy %I on %I for all using (seeker_id = auth.uid()) with check (seeker_id = auth.uid())', t||'_self', t);
    execute format('create policy %I on %I for select using (employer_can_view_seeker(seeker_id) or is_admin())', t||'_employer', t);
  end loop; end $$;

create policy jobs_public_read on jobs for select
  using (status = 'published' and expires_at > now()
         and exists (select 1 from employer_profiles e where e.id = employer_id and e.is_listed));
create policy jobs_owner_read   on jobs for select using (employer_id = auth.uid() or is_admin());
create policy jobs_owner_insert on jobs for insert with check (employer_id = auth.uid());
create policy jobs_owner_update on jobs for update using (employer_id = auth.uid()) with check (employer_id = auth.uid());
create policy jobs_owner_delete on jobs for delete
  using (employer_id = auth.uid() and status = 'draft'
         and not exists (select 1 from payments p where p.job_id = jobs.id));

create policy app_seeker_read on applications for select using (seeker_id = auth.uid());
create policy app_employer_read on applications for select
  using (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()) or is_admin());
create policy app_seeker_update on applications for update
  using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());
create policy app_employer_update on applications for update
  using (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()))
  with check (exists (select 1 from jobs j where j.id = job_id and j.employer_id = auth.uid()));
-- inserts: API only (service role)

create policy saved_self on saved_jobs for all using (seeker_id = auth.uid()) with check (seeker_id = auth.uid());

create policy msg_read on messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid() or is_admin());
create policy msg_send on messages for insert
  with check (sender_id = auth.uid() and can_message(sender_id, recipient_id));
create policy msg_mark_read on messages for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_mark_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pay_read on payments for select using (employer_id = auth.uid() or is_admin());
create policy sub_read on subscriptions for select using (employer_id = auth.uid() or is_admin());
create policy audit_read on admin_audit_log for select using (is_admin());
create policy contact_admin_read on contact_messages for select using (is_admin());

-- ───────── privileges (column-level; defense in depth with the guards above) ─────────
revoke insert, update, delete on profiles, employer_profiles, seeker_profiles, seeker_private, jobs, applications,
  messages, notifications, payments, subscriptions, webhook_events, admin_audit_log, contact_messages
  from anon, authenticated;
revoke select on webhook_events from anon, authenticated;
revoke update, delete, truncate on admin_audit_log from service_role;      -- append-only

grant update (full_name) on profiles to authenticated;
grant update (company_name, description, website, logo_url, industry, company_size, city, state)
  on employer_profiles to authenticated;
grant update (display_name, headline, summary, care_role, city, state, available_from,
              shift_preferences, avatar_url, is_visible) on seeker_profiles to authenticated;
grant insert, update (phone, zip, resume_url) on seeker_private to authenticated;
grant insert (employer_id, title, description, care_role, employment_type, city, state, zip,
              pay_min, pay_max, pay_period, easy_apply) on jobs to authenticated;
grant update (title, description, care_role, employment_type, city, state, zip,
              pay_min, pay_max, pay_period, easy_apply) on jobs to authenticated;
grant delete on jobs to authenticated;
grant update (status) on applications to authenticated;
grant insert (sender_id, recipient_id, application_id, body) on messages to authenticated;
grant update (read_at) on messages to authenticated;
grant update (read_at) on notifications to authenticated;
```

The RLS test harness creates the `anon`, `authenticated` and `service_role` roles and a small `auth` schema shim (`auth.uid()`, `auth.role()` reading JWT claim settings) when it runs on a plain Postgres.

### Deferred schema (Hiring Pro build, not in wave 1)

`subscriptions.current_period_start`; `jobs.subscription_id` for counting the 30-posts-per-period allowance, enforced in a server-only SQL function; an `invitations` table (invite candidates to apply); directory query endpoint with an explicit column allowlist (no contact fields); filters by role, certifications, availability, preferred shifts and city/state (no distance).

## 6. Server flows (Express)

### Checkout: `POST /api/jobs/:id/checkout`
1. Caller must own the job. If the job already has a `succeeded`, unconsumed payment, publish it instead of charging again.
2. Call `start_checkout` (server-side price from `constants.ts`, never from the client). It refuses with `HY002` and a reason: job not found, wrong status (only `draft` or `pending_payment`), employer not listed ("Set your company name first"), or incomplete fields (the response lists them).
3. Reuse the open Checkout session for the payment if one exists, otherwise create one (about 30 minutes to expiry). Store its id on the payment. If Stripe fails, call `cancel_checkout` so the job returns to `draft`.

### Edits and cancel checkout
- While a job is `pending_payment`, the database blocks edits to its content (`jobs_guard`). The employer must cancel checkout first.
- `POST /api/jobs/:id/cancel-checkout`: expire the Stripe session. If Stripe says the session is already complete, refuse (409, "payment is being processed"). Otherwise call `cancel_checkout`: the payment becomes `canceled` and the job returns to `draft`.
- On `checkout.session.expired`, the same transition runs, so an abandoned checkout never leaves a job locked. The reconcile job covers a missed event.
- `publish_job` re-validates required fields at publish time regardless.

### Close and reopen
- `POST /api/jobs/:id/close`: `published` -> `closed` (no refund).
- `POST /api/jobs/:id/reopen`: `reopen_job` applies the rules in section 1.

### Stripe webhook: `POST /api/webhooks/stripe`
1. Verify the signature against the raw body. Invalid: 400.
2. Insert the event (`on conflict do nothing`) and increment `attempts`. Already processed: 200, no work.
3. Run the handler:
   - `checkout.session.completed`: mark the payment `succeeded` (only from `pending`), then `publish_job`.
   - `checkout.session.expired`: cancel as above.
   - `charge.refunded`: mark the payment `refunded` and close its job if published.
   - Unhandled types: store with `processed_at` set and `error = 'ignored: unhandled type'`, return 200.
4. Success: set `processed_at`, clear `error`, return 200.
5. Transient failure (anything other than `HY001`): record the error and return 500 so Stripe retries. After 5 attempts, escalate to the permanent path.
6. Permanent failure (`HY001`, or the payment was already `canceled` when Stripe reports it paid):
   - Mark the payment `needs_review` with the reason.
   - Write an audit row (`system_actor = 'system:webhook'`).
   - Create an in-app notification for admins and for the employer ("We couldn't publish your job. Your $2.50 payment is being refunded.").
   - Send the support alert email (section 6, email).
   - Issue the Stripe refund with idempotency key `refund-{payment_id}`; when it completes the payment becomes `refunded`.
   - Return 200 only after `needs_review` and the alert records are durably written. If those writes fail, return 500. If the refund call fails transiently, return 500; the next attempt resumes at the refund. This is the one deliberate case where a handled failure ends in 200: it has reached a durable, alerted terminal state.
7. Reconcile job (periodic backstop): finds `succeeded`, unconsumed payments older than 15 minutes whose job is `pending_payment`, retries the publish or escalates to the permanent path. It also finds pending payments whose Checkout session has expired and cancels them.

### Email alerts (Zoho SMTP)
- `services/mailer.ts` uses nodemailer with `smtp.zoho.com` (port 465 SSL, or 587 STARTTLS). Environment: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_FROM=support@healthhyr.com`, `ALERT_TO=support@healthhyr.com`. If the Zoho account uses 2FA, an app-specific password is needed. Credentials live only in the API's `.env`.
- Two alerts: a payment moves to `needs_review` (payment id, job id, employer id, reason, amount; no card data), and a new contact message (name, topic, message, `Reply-To` set to the sender).
- Plain text only. Header values have CR/LF stripped. Subjects are truncated.
- The database record and admin inbox are the durable alert. Sending is best-effort and never changes what the user or Stripe receives. `contact_messages.emailed_at` and `payments.alert_emailed_at` stay null when sending fails, and a periodic job retries those rows. Failures are logged.
- Tests use a stub transport. A manual smoke script (not in CI) lets the owner test real credentials.

### Withdrawal
`POST /api/applications/:id/withdraw` sets the status to `withdrawn`. The guard trigger clears `resume_url` and `cover_note` for every caller, and the CHECK constraint enforces it. The API then deletes the private-bucket resume copy, and a cleanup job removes any stored copy whose application has no `resume_url`. Employers lose access to the applicant's profile and name and see "Applicant withdrew". A resume an employer already downloaded cannot be recalled, so copy must not promise that.

### Legal text and live-key gate
`shared/src/legal/terms.md` and `privacy.md` carry `status: draft` until the owner supplies the text. While a document is draft, its page shows a "Draft" banner and `noindex` and is left out of the sitemap. The API refuses to boot with a live Stripe key (`sk_live_`, `rk_live_`) if either document is draft or `NODE_ENV` is not production. No legal text is written by the assistant.

### Hiring Pro launch notification
Admin-only `announce-hiring-pro` refuses to run until `HIRING_PRO_ENABLED` is true and a Hiring Pro price exists. It inserts one in-app notification per seeker with `is_visible = true` (`on conflict do nothing`, so it is safe to run twice) and writes an audit row. In-app only; email to seekers would need a provider.

## 7. SEO

- JobPosting JSON-LD: `datePosted = published_at`, `validThrough = expires_at`, `hiringOrganization`, `jobLocation`, `baseSalary` when pay is set. No "verified" claims.
- Expired or closed jobs: 200 with `noindex`, a "no longer accepting applications" notice, no JSON-LD, and removal from the sitemap.
- Canonical URLs: `/jobs/{slug}-{id}` and `/companies/{slug}`, with a redirect from a wrong slug. Filtered search URLs canonicalize to `/jobs`.
- Sitemap: published, non-expired jobs, listed companies, indexable static pages (Terms and Privacy only once final).
- robots: disallow `/dashboard`, `/messages`, `/api`. Seeker profiles have no public pages.
- Revalidate affected pages when a job is published, expires, closes or reopens.

## 8. Approved copy and page content

Seeker visibility switch (default OFF), exact text:

> Hiring Pro is not live yet. If you turn this on, employers with Hiring Pro will be able to find your profile once it launches. Your phone, resume and home address are never shown. You can turn this off at any time.

/pricing page:
- **Pay Per Post, live:** $2.50, one job posting, 30 days, free edits while live, republishing needs a new payment. Price rendered from `constants.ts`.
- **Hiring Pro, "Coming soon":** $39.99/month with a "Coming soon" badge. No button or link to checkout. Benefit list, labeled "planned for launch":
  - Opt-in candidate directory search
  - Filters by role, certifications, availability, preferred shifts and city/state
  - Up to 30 new job postings per billing period, each active 30 days
  - Invite candidates to apply
- No "16 posts = $40" line until Pro is buyable. No distance, team or analytics claims.
- Note: "Features do not guarantee applications or hires."

Contact page: shows `support@healthhyr.com` and a form. Submissions are stored in `contact_messages`, shown in the admin inbox, and emailed to support through Zoho SMTP.

Terms and Privacy: ship as pages marked Draft with `noindex` until the owner supplies the text.

## 9. Build steps (one commit each, tests passing first)

| # | Commit | Tests |
|---|---|---|
| 0 | Save this plan to docs/PLAN.md | none (docs only) |
| 1 | Monorepo scaffold: workspaces, TypeScript, ESLint, Vitest, `.gitignore` with `.env` verified ignored | Smoke test; repo hygiene (only `.env.example` tracked, no secret-looking strings) |
| 2 | `shared`: tokens (with danger and surface), constants, enums, zod schemas, `copy.ts`, legal stubs with `status: draft`, COLORS.md update | Token and contrast tests, constants tests, exact visibility copy |
| 3 | Next.js app, Tailwind from tokens, `next/font` (Manrope, DM Sans), style guard | Guard fails on raw hex, text under 12px, lime text, olive below large size; build succeeds; secrets not referenced in web |
| 4 | Base components, part 1 | Component tests (focus, aria) |
| 5 | Base components, part 2 | Component tests |
| 6 | Migration `0001_schema.sql` and RLS test setup (Docker check first, alternative if unavailable) | RLS suite (section 10) |
| 7 | API skeleton: env validation, JWT auth, `requireRole`, errors, rate limit | 401 and 403 |
| 8 | Auth in web | Role comes from the profile, never the client |
| 9 | Seeker profile CRUD, `seeker_private`, visibility switch with the approved copy, preferred shifts | Default off, opt-in stamp, contact details owner-only |
| 10 | Employer company profile and public company page | 404 until renamed, stable slug |
| 11 | Jobs: draft CRUD, dashboard, close and reopen | Reopen rules, employers cannot set status or dates |
| 12 | Public job search and detail | Expired, unpublished and unlisted jobs never returned |
| 13 | SEO: JSON-LD, canonical, sitemap, robots | JSON-LD fields, expired noindex |
| 14 | Checkout endpoint with `start_checkout` precheck | Unlisted employer refused, missing fields listed, wrong status refused, one open payment per job, server price |
| 15 | Cancel checkout, edit lock while `pending_payment`, session expiry handling | Cancel returns the job to draft, edits blocked while pending and allowed after cancel, cancel refused when paid |
| 16 | Stripe webhook, `publish_job`, expiry job, page revalidation | Webhook tests (section 10) |
| 17 | Email service (Zoho SMTP) and alert retry job | Stub transport, header sanitizing, retry of unsent alerts |
| 18 | Permanent-failure path, reconcile job, live-key gate | `needs_review` and refund path, retry cap, gate tests |
| 19 | Saved jobs, applications, Easy Apply, withdrawal | One application per job, withdrawal clears data and deletes the stored resume |
| 20 | Employer applicant review (five statuses) | Status rules, withdrawn shows status only |
| 21 | Messages and notifications | `can_message` rules, read-once |
| 22 | Pages: Home, For Employers, About | No sample listings, empty states |
| 23 | Contact page, API route, `contact_messages`, support email | Rate limit, honeypot, validation, email sent, anon cannot insert directly |
| 24 | Terms and Privacy pages (Draft, noindex) | Banner, noindex, not in sitemap while draft |
| 25 | /pricing page | Prices from constants, no checkout control on Pro, no "16 posts" text, planned-for-launch list, disclaimer |
| 26 | Hiring Pro guard and launch notification tool | No subscribe route, announce idempotent and opted-in only |
| 27 | Admin: moderation, contact inbox, `needs_review` payments with retry and refund | Every action writes an audit row, non-admins blocked |
| 28 | Hardening: accessibility, banned-phrase scan | Full suite |

Docker check for step 6: if Docker is available, use the Supabase CLI local stack. If not, propose an alternative (for example an in-process Postgres such as PGlite, or an embedded Postgres) before installing anything, and ask first.

## 10. Test matrix (highlights)

RLS (step 6):
- `seeker_private`: readable by the owner, and by an employer only with a non-withdrawn application; not by an employer with only opt-in, not with opt-in plus Pro, not by anon.
- Opted-in seekers are not visible to a non-Pro employer. A Pro fixture row makes them visible, with no contact fields.
- Applications: employers change only `status`, only to the five allowed values, and not on a withdrawn application. Seekers can only withdraw. `job_id` cannot change.
- Withdrawal clears `resume_url` and `cover_note` for every caller. The CHECK constraint rejects a withdrawn row with either set. An employer cannot read the seeker's details after withdrawal.
- Messages: recipients change only `read_at`, once. Senders cannot edit the body.
- `publish_job`: a consumed payment, another job's payment, an unlisted employer, a job not in `pending_payment`, an incomplete job and a non-service caller are all refused. A refused publish leaves the payment unconsumed.
- A job in `pending_payment` rejects content edits from the employer; after `cancel_checkout` edits are allowed again.
- `reopen_job`: a closed job with a future `expires_at` returns to `published` with the same `expires_at` and no payment; an expired job returns to `draft`; both need the right status.
- A default-named employer is not public. Renaming makes it public, and the slug stays stable.
- The visibility stamp is set when the switch turns on and cleared when it turns off.
- A second pending payment for the same job is rejected.
- `webhook_events` and `contact_messages` are unreachable for anon and authenticated users, except admin read on contacts.
- `admin_audit_log` rejects update and delete.

Webhook (step 16 and 18):
- Bad signature returns 400. Success returns 200 and sets `processed_at`.
- A handler that throws returns 500, stores the error and leaves `processed_at` null. The retry returns 200.
- A duplicate of a finished event returns 200 with no second publish. An unhandled type returns 200 and is recorded as ignored.
- A permanent publish failure leads to `needs_review`, an admin notification, an audit row, an employer notification, an alert email attempt and a refund call. The response is 200 only after those writes. If the `needs_review` write fails, the response is 500. If the refund call fails transiently, the response is 500 and the retry resumes at the refund.
- The fifth transient failure escalates to the permanent path. The reconcile job picks up a stuck payment.
- A live key is refused while a legal document is draft, and outside production.

Checkout (step 14 and 15):
- An unlisted employer cannot start Checkout. Checkout is refused when fields are missing (the response lists them) or the job is not `draft` or `pending_payment`.
- Cancel checkout returns the job to `draft` and the payment to `canceled`; it is refused when the payment has succeeded.

## 11. Environment and secrets

- `.gitignore` ignores `.env`, `.env.*` (except `.env.example`), `node_modules`, build output and coverage. Verified before any code is written.
- Only `.env.example` files are committed, with placeholder values.
- API only: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test keys while building), `STRIPE_WEBHOOK_SECRET`, `SMTP_*`, `ALERT_FROM`, `ALERT_TO`, `HIRING_PRO_ENABLED`.
- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, API base URL. No Stripe keys, no service-role key.
- A hygiene test fails if a `.env` file is tracked, if a secret-looking string is committed, or if web code references the service-role or Stripe secret key names.

## 12. Assumptions the owner approved

1. A permanent publish failure ends in 200 only after `needs_review` and the alert are durably written.
2. Reopen follows the rules in section 1.
3. Job thresholds (title at least 5 characters, description at least 50) are placeholders in `constants.ts`.
4. Hiring Pro benefit list as in section 8.
5. The Hiring Pro launch notification is in-app only.
