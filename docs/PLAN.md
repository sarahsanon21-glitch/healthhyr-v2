# HealthHyr v2 build plan (approved)

Approved by the owner on 2026-10-16 after three review rounds. This file is the source of truth if a session resets. Project rules are in `CLAUDE.md`; the palette is in `docs/COLORS.md`. If this file and a later owner instruction disagree, the later instruction wins and this file gets updated in the same commit.

**The database SQL lives in `supabase/migrations/0001_schema.sql`** (moved out of this file in commit 6). It is the executable source of truth, and tests keep TypeScript enums and constants in sync with it. Section 5 keeps the design notes.

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

React 19 + Next.js (App Router) for `apps/web`, Tailwind, Express 5 for `apps/api`, Supabase (Postgres, Auth, Storage), Stripe test mode (hosted Checkout), Zoho SMTP for alert emails, mobile app possible later (it would use the Express API). Express is the only backend and the only place plan limits and Stripe logic live. Next.js is the rendering layer: public pages fetch from public Express endpoints on the server with revalidation; signed-in areas are client components that call Express with the Supabase session token.

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
├─ package.json          npm workspaces, shared scripts (test, lint, typecheck, db:*)
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
├─ apps/api/
│  ├─ src/
│  │  ├─ env.ts          the ONLY place process.env and server-only secrets are read (zod, fails fast)
│  │  ├─ app.ts          createApp(): middleware order, no secrets passed in
│  │  ├─ server.ts       entry point: load config, wire, listen
│  │  ├─ auth/           verifyToken.ts (JWKS, asymmetric algorithms only)
│  │  ├─ middleware/     requestId, auth (token, then role from the database), requireRole, errorHandler, security (CORS, rate limit)
│  │  ├─ lib/            userClient.ts (per-request, RLS applies), serviceClient.ts (bypasses RLS, server-only)
│  │  ├─ routes/         health, me, stripeWebhook (reserved); later jobs, applications, payments, messages, contact, admin
│  │  └─ services/       server-only operations, the only code allowed to use the service client: stripe, checkout, publish, mailer, notifications, jobs (expire, reconcile)
│  └─ tests/             supertest suites, boot test, service-role scanner, integration/ (real Supabase)
└─ supabase/
   ├─ config.toml        local stack: database and auth only (storage and the rest are off until needed)
   ├─ migrations/        0001_schema.sql (executable source of truth for the schema)
   └─ tests/
      ├─ rls/            RLS tests against the real local database (helpers, fixtures, 7 suites)
      └─ mutation.mjs    proves the tests fail when a policy, guard or grant is weakened
```

Secrets rule: `.env` files are never committed; only `.env.example` files are. The Supabase service-role key and the Stripe secret key exist only in the API's environment, and in the API only `env.ts` reads them. The web app gets only the public Supabase URL and anon key, plus the API base URL. It holds no Stripe keys (hosted Checkout).

## 4. Design tokens, base components, contrast

`packages/shared/src/tokens.ts` is the only file allowed to contain hex values. Tailwind's default palette is replaced by the tokens, so a class like `bg-red-500` does not exist.

| Token | Hex | Use |
|---|---|---|
| ink | #123E38 | Headings, body text |
| primary | #145B4E | Buttons, links, logo mark, success states |
| lime | #D6ED9B | Fill only, always with ink text |
| paper | #F7F8F3 | Page background |
| surface | #FFFFFF | Cards, inputs, modals |
| line | #DFE6DE | Decorative borders and dividers only (not form controls) |
| olive | #749047 | "Hyr" in the logo, headings of 24px or larger only |
| muted | #566A63 | Secondary text, form control borders |
| danger | #B42318 | Errors and destructive actions (never color alone) |

Fonts: Manrope for headings, DM Sans for body. Minimum text size 12px. Computed contrast ratios live in `docs/COLORS.md`, and a test recomputes them from the tokens (4.5:1 minimum for normal text, 3:1 for olive large headings and for UI boundaries).

A style guard test scans `apps/web/src` for raw hex values, `text-[Npx]` with N under 12, `text-lime`, `text-olive` outside large heading components, the default Tailwind palette, and removed focus outlines.

Base components (`components/ui/`, built in commits 4 and 5): Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Field, Badge, Card, Logo, Modal, Tabs, Toast, SplitPane, Pagination, Spinner, Skeleton, EmptyState, Avatar.

## 5. Database design

The SQL is `supabase/migrations/0001_schema.sql`. It was written from the first version of this plan, then corrected by testing against a real local Supabase (section 5.3).

### 5.1 Tables (17)

`profiles`, `employer_profiles`, `seeker_profiles`, `seeker_private`, `seeker_experience`, `seeker_certifications`, `seeker_languages`, `jobs`, `payments`, `subscriptions`, `applications`, `saved_jobs`, `messages`, `notifications`, `webhook_events`, `admin_audit_log`, `contact_messages`.

- `employer_profiles.id` and `seeker_profiles.id` equal `profiles.id`, which equals `auth.users.id`.
- Triggers manage `employer_profiles.is_listed` and `slug`, and `seeker_profiles.visibility_opted_in_at`. Clients cannot write them.
- `payments.job_id` is `restrict`: payment history is never deleted. One open (`pending`) payment per job, and one job per payment, are enforced by unique indexes.
- Applications are created and withdrawn through the API, so it can copy the resume, enforce limits and send notifications. The guard trigger still locks direct writes.
- Storage: the `resumes` bucket is private with no client policies. Only the API reads and writes it and hands out signed links that last about 60 seconds.

### 5.2 Layers of protection

1. **Privileges.** Each role starts with nothing and gets exactly what it needs, column by column where a column must stay server-managed (for example employers may update a job's content columns but never `status`, `payment_id`, `published_at`, `expires_at` or `employer_id`).
2. **Row-level security** narrows which rows a role sees and changes.
3. **Guard triggers** enforce which values and transitions are allowed (applications, messages, jobs, profiles). They are skipped for the service role, which only the API holds.
4. **Server-only functions** (`start_checkout`, `cancel_checkout`, `publish_job`, `close_job`, `reopen_job`, `expire_jobs`, `job_missing_fields`) are executable by the service role only. Their errors use codes `HY001` to `HY004` so the API can tell permanent failures from transient ones.

Where two layers cover the same thing (a column privilege and a trigger), weakening one must not be noticed and weakening both must be. The mutation runner checks both cases.

Helper functions that take arbitrary ids (`is_admin`, `employer_holds_application_from`, `has_active_hiring_pro`, `employer_can_view_seeker`, `can_message`) live in a `private` schema that the Data API does not expose. They are still executable by the roles, so policies can call them.

### 5.3 What testing against real Supabase found (2026-10-16)

Fixed in `0001_schema.sql` before the first commit of the migration:

- **Over-broad default privileges.** Supabase grants every API role `ALL` on new tables, including `TRUNCATE`, `REFERENCES` and `TRIGGER`. Row-level security does not apply to `TRUNCATE`. The migration now revokes everything from `anon` and `authenticated` and grants back only what is needed, and changes default privileges so later tables start closed. Tests fail if a future migration leaves a gap.
- **Helper functions callable through the API.** In `public`, any signed-in user could call `can_message(...)` or `has_active_hiring_pro(...)` with arbitrary ids to learn who opted in, who applied where, or who has Hiring Pro. They moved to the `private` schema.
- **Wrong refusal reason from `publish_job`.** The function reported `payment_already_consumed` for every refusal, because its diagnostic ran after its own first step. The transaction still rolled back, so no money logic broke, but the admin alert would have carried the wrong reason. It now works out the reason before changing anything.

### 5.4 Deferred schema (Hiring Pro build, not in wave 1)

`subscriptions.current_period_start`; `jobs.subscription_id` for counting the 30-posts-per-period allowance, enforced in a server-only SQL function; an `invitations` table (invite candidates to apply); directory query endpoint with an explicit column allowlist (no contact fields); filters by role, certifications, availability, preferred shifts and city/state (no distance).

## 6. API design and server flows (Express)

### 6.0 API rules (commit 7)

**Which Supabase client (the central rule).**

- **User-initiated reads and writes use `req.auth.db`**: a per-request Supabase client built with the anon key and the caller's own JWT (`src/lib/userClient.ts`). Postgres runs the query as that user, so row-level security and the column privileges apply. This is the default for every route that serves a signed-in person.
- **The service-role client (`src/lib/serviceClient.ts`) bypasses RLS** and is for server-only operations that no user performs directly: Stripe webhooks, `publish_job` and the other server-only SQL functions, expiry and reconcile jobs, and audited admin actions. That code lives in `src/services/`.
- **Any endpoint that needs the service client checks ownership in code**, because the database will not.
- **A test enforces it.** `apps/api/tests/service-role-scan.test.ts` scans the API source and fails if a route, middleware or `app.ts` imports the service-role client without a `// service-role-allowed: <reason>` comment (the reason is required). It also fails if the service-role key is named outside `env.ts`, `server.ts` and `lib/serviceClient.ts`, if `process.env` is read outside `env.ts` and `server.ts`, or if the Stripe secret key is named outside them.
- **User actions that must use the service role by design.** The schema makes some writes API-only, so these routes carry an allow comment, check the caller's role and ownership in code, and have a test that a stranger is refused:
  - apply to a job (application inserts are API-only, so the API can copy the resume and enforce limits)
  - withdraw an application (also deletes the stored resume)
  - start checkout, cancel checkout, close and reopen a job (server-only SQL functions)
  - submit the contact form (inserts are API-only so the API can rate-limit and audit)
  - audited admin reads and actions

**Authentication** (`middleware/auth.ts`, `auth/verifyToken.ts`):

1. The token must be `Authorization: Bearer <jwt>`.
2. It is verified against the project's published public keys (JWKS): signature, expiry (5 seconds of clock tolerance), not-before, issuer, audience, and the presence of `exp`, `iat` and `sub`. Only asymmetric algorithms (ES256, RS256) are accepted, so `alg: none` and HMAC tricks are refused. Supabase's own anon and service-role keys are not user tokens and are refused. Anonymous sign-ins are not used.
3. The role is then read from the `profiles` table through the per-request client. It is **never** taken from the token or from anything the client sends, and it is read again on every request, so a role change in the database applies to existing tokens at once.
4. A valid token with no profile row gets `403 no_profile`. An expired token gets `401 token_expired`; any other bad token gets `401 invalid_token`.
5. `requireRole(...)` allows only the listed roles. If authentication did not run, it answers 401, so a mistake in route order fails closed.

Projects still using a shared-secret (HS256) JWT would need to move to Supabase's signing keys, which is the default for new projects and for the local stack.

**Errors** (`middleware/errorHandler.ts`): one handler. A response never contains a stack trace, file path, SQL, database error text, or anything the caller sent. Known errors (`HttpError`, validation, bad JSON, body too large) get fixed friendly messages. Everything else is a generic 500 with a request id. The full error, including Supabase's plain-object errors, goes to the server log with the same request id. Every response carries `X-Request-Id`.

**Security middleware** (`app.ts` order): request id, helmet, the Stripe webhook route, health, CORS allowlist, per-IP rate limit (draft-7 headers, 429 JSON), JSON parser (100 KB), the `/api` router (authenticate, then routes), JSON 404, error handler.

- **CORS allowlist:** a browser request from an unlisted origin gets 403, not just missing headers. Requests with no `Origin` (Stripe, curl, servers) pass. Credentials are off (bearer tokens, no cookies). Production requires an explicit list.
- **Rate limiting** counts failed and successful requests alike, so token guessing is throttled. `strictLimiter` is there for expensive endpoints later.
- **Stripe webhook route** `POST /api/webhooks/stripe` is mounted before CORS, the rate limit and the JSON parser, with a raw 1 MB body parser, so signature verification (step 16) gets the exact bytes Stripe sent. It needs no sign-in and is not throttled. Until it is built it answers 501.

**Configuration** (`env.ts`): validated with zod at boot. The process exits with code 1 and names every problem, never printing a value. It refuses a live Stripe key outside production, and in production requires https, an explicit CORS list and an explicit port.

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

### Stripe webhook handler (step 16)
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
`shared/src/legal/terms.md` and `privacy.md` carry `status: draft` until the owner supplies the text. While a document is draft, its page shows a "Draft" banner and `noindex` and is left out of the sitemap. The API refuses to boot with a live Stripe key (`sk_live_`, `rk_live_`) if either document is draft or `NODE_ENV` is not production. The `NODE_ENV` half is built (commit 7); the draft-document half comes in step 18. No legal text is written by the assistant.

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

| # | Commit | Tests | Status |
|---|---|---|---|
| 0 | Save this plan to docs/PLAN.md | none (docs only) | done |
| 1 | Monorepo scaffold, `.gitignore` with `.env` verified ignored | Smoke test; repo hygiene | done |
| 2 | `shared`: tokens, constants, enums, zod schemas, `copy.ts`, legal stubs, COLORS.md | Token and contrast tests, constants, exact copy | done |
| 3 | Next.js app, Tailwind from tokens, `next/font`, style guard | Style guard, theme and font tests | done |
| 4 | Base components, part 1 | Component tests | done |
| 5 | Base components, part 2 | Component tests | done |
| 6 | Migration `0001_schema.sql`, local Supabase, RLS test suite, mutation runner | 158 RLS tests against real Supabase; 16 mutations proven caught | done |
| 7 | API skeleton: env validation, JWT auth, `requireRole`, errors, rate limit, helmet, CORS, reserved webhook route, client design rule | 113 API tests (supertest, boot, scanner) and 9 against real Supabase tokens | done |
| 8 | Auth in web | Role comes from the profile, never the client | |
| 9 | Seeker profile CRUD, `seeker_private`, visibility switch with the approved copy, preferred shifts. Turns on the Supabase Data API (PostgREST) locally so the per-request client works end to end | Default off, opt-in stamp, contact details owner-only, RLS applies through the API | |
| 10 | Employer company profile and public company page | 404 until renamed, stable slug | |
| 11 | Jobs: draft CRUD, dashboard, close and reopen | Reopen rules, employers cannot set status or dates | |
| 12 | Public job search and detail | Expired, unpublished and unlisted jobs never returned | |
| 13 | SEO: JSON-LD, canonical, sitemap, robots | JSON-LD fields, expired noindex | |
| 14 | Checkout endpoint with `start_checkout` precheck | Unlisted employer refused, missing fields listed, wrong status refused, one open payment per job, server price | |
| 15 | Cancel checkout, edit lock while `pending_payment`, session expiry handling | Cancel returns the job to draft, edits blocked while pending and allowed after cancel, cancel refused when paid | |
| 16 | Stripe webhook handler, `publish_job`, expiry job, page revalidation | Webhook tests (section 10) | |
| 17 | Email service (Zoho SMTP) and alert retry job | Stub transport, header sanitizing, retry of unsent alerts | |
| 18 | Permanent-failure path, reconcile job, live-key gate (legal drafts) | `needs_review` and refund path, retry cap, gate tests | |
| 19 | Saved jobs, applications, Easy Apply, withdrawal | One application per job, withdrawal clears data and deletes the stored resume | |
| 20 | Employer applicant review (five statuses) | Status rules, withdrawn shows status only | |
| 21 | Messages and notifications | `can_message` rules, read-once | |
| 22 | Pages: Home, For Employers, About | No sample listings, empty states | |
| 23 | Contact page, API route, `contact_messages`, support email | Rate limit, honeypot, validation, email sent, anon cannot insert directly | |
| 24 | Terms and Privacy pages (Draft, noindex) | Banner, noindex, not in sitemap while draft | |
| 25 | /pricing page | Prices from constants, no checkout control on Pro, no "16 posts" text, planned-for-launch list, disclaimer | |
| 26 | Hiring Pro guard and launch notification tool | No subscribe route, announce idempotent and opted-in only | |
| 27 | Admin: moderation, contact inbox, `needs_review` payments with retry and refund | Every action writes an audit row, non-admins blocked | |
| 28 | Hardening: accessibility, banned-phrase scan | Full suite | |

Storage (resume uploads) is turned off in `supabase/config.toml` and gets turned on in step 19. The Data API (PostgREST) is turned off and gets turned on in step 9.

## 10. Tests

### RLS tests (step 6): 158 tests in 7 suites, against the real local database

| Suite | Tests | Covers |
|---|---|---|
| `schema-and-profiles` | 16 | RLS on every table, the 17 tables, server-only functions closed to app roles, no anon writes; signup trigger (never admin, default company name); profiles read and write limits, role escalation blocked |
| `employer-listing` | 9 | Default-named page hidden, rename lists it, slug stable, cannot set `is_listed` or slug, cannot edit others |
| `jobs` | 18 | Who reads what (anon, seeker, owner, other employer, admin, unlisted employer, expired); employer writes, locked columns, edit lock while `pending_payment`, delete rules, pay range |
| `checkout-publish` | 28 | `job_missing_fields`, `start_checkout`, `cancel_checkout`, `publish_job` (each refusal reason, one-time payments, atomic rollback), `close_job`, `reopen_job` rules, `expire_jobs` |
| `seeker-privacy` | 26 | `seeker_private` access (owner, applicant's employer, withdrawn, opt-in plus Pro still no); profile and children access; directory needs opt-in AND an active Hiring Pro (expired, past due, cancelled, wrong plan); visibility stamp |
| `applications-messages` | 40 | Application read and write limits, employer's five statuses, seeker may only withdraw, withdrawal clears resume and cover note for every caller; `can_message` rules both directions, message read-once, no edits, no deletes |
| `server-tables` | 21 | `saved_jobs`, `notifications` (one launch notice each), payments and subscriptions read-only, `webhook_events` service-only, `contact_messages`, `admin_audit_log` append-only; privileges: no truncate or trigger rights, anon reads only the job board, helper functions not exposed |

`npx vitest list --project rls` prints every test name.

### Mutation proof

`npm run test:rls:mutation` weakens one policy, guard, grant or function at a time (inside each test's own transaction, so nothing real changes) and checks that the right tests fail. 16 weakenings are caught. Two more confirm defense in depth: widening a column privilege alone is not noticed because a trigger still blocks the write, and removing both is.

### API tests (step 7): 113 unit and process tests, plus 9 against real Supabase

| Suite | Tests | Covers |
|---|---|---|
| `env` | 13 | Valid config and defaults; every missing or malformed variable named; live Stripe key refused outside production; production rules; no value is ever printed |
| `auth` | 32 | 401 for no token, malformed headers, garbage, expired, wrong key (with and without the right key id), unknown key id, altered payload, wrong audience or issuer, no expiry, not-yet-valid, `alg: none`, HMAC with the public key, anon and service-role tokens, anonymous users, bad subject; role from the database and never from the token, header, query or body; re-read on every request; no profile is 403; database errors; the per-request client gets the caller's token only after verification |
| `roles` | 8 | `requireRole`: allowed and refused roles, 401 without a token, fails closed if mounted without authentication |
| `errors` | 16 | Generic 500 with no message, stack, SQL or path (sync, async, non-Error, database-style fields); full error only in the server log with the request id and never the token; same in every `NODE_ENV`; validation, bad JSON, too large, 404 are friendly and do not echo input; request ids |
| `security` | 14 | helmet headers; CORS allowlist (allowed, refused, preflight, no wildcard, no Origin); rate limit 429 with Retry-After, counts failures, health not throttled |
| `webhook` | 12 | Raw body byte for byte (including non-ASCII), parsed everywhere else, no sign-in, not throttled, no origin check, POST only, 1 MB limit, reserved 501 handler |
| `service-role-scan` | 15 | The scanner catches each kind of violation, accepts only an allow comment with a reason, and the real source is clean |
| `boot` | 3 | The real server process exits with code 1 on missing or live-key config without printing a value, and starts and serves `/health` when valid |
| `integration` (real Supabase) | 9 | A token issued by real GoTrue is signed ES256 with the expected issuer and audience; our verifier accepts it, refuses altered signature and payload, the wrong issuer or audience, and the project's own anon key; signup with `role: admin` in its metadata still creates a `seeker`; `/api/me` returns the database role |

### Webhook handler tests (steps 16 and 18)
- Bad signature returns 400. Success returns 200 and sets `processed_at`.
- A handler that throws returns 500, stores the error and leaves `processed_at` null. The retry returns 200.
- A duplicate of a finished event returns 200 with no second publish. An unhandled type returns 200 and is recorded as ignored.
- A permanent publish failure leads to `needs_review`, an admin notification, an audit row, an employer notification, an alert email attempt and a refund call. The response is 200 only after those writes. If the `needs_review` write fails, the response is 500. If the refund call fails transiently, the response is 500 and the retry resumes at the refund.
- The fifth transient failure escalates to the permanent path. The reconcile job picks up a stuck payment.
- A live key is refused while a legal document is draft, and outside production.

### Checkout tests (steps 14 and 15)
- An unlisted employer cannot start Checkout. Checkout is refused when fields are missing (the response lists them) or the job is not `draft` or `pending_payment`.
- Cancel checkout returns the job to `draft` and the payment to `canceled`; it is refused when the payment has succeeded.

## 11. Environment, secrets and the local database

- `.gitignore` ignores `.env`, `.env.*` (except `.env.example`), `node_modules`, build output and coverage.
- Only `.env.example` files are committed, with placeholder values.
- Local Supabase keys (printed by `npm run db:status`) go only in git-ignored `.env` files. A hygiene test fails if a key-like string is committed.
- Root `.env` (tests only): `RLS_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- `apps/api/.env` (see `apps/api/.env.example`), server-only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `STRIPE_SECRET_KEY` (test keys while building), `STRIPE_WEBHOOK_SECRET`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_*`, `PORT`. Later: `SMTP_*`, `ALERT_FROM`, `ALERT_TO`, `HIRING_PRO_ENABLED`.
- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, API base URL. No Stripe keys, no service-role key.
- A hygiene test fails if a `.env` file is tracked, if a secret-looking string is committed, or if web code references the service-role or Stripe secret key names.

### Local Supabase

- Requires Docker. The Supabase CLI is a dev dependency (`npx supabase`), not a global install.
- `npm run db:start` starts the database and auth (about 2 GB of Docker images the first time). `npm run db:reset` re-applies migrations. `npm run db:stop` stops it. `npm run db:status` prints the URLs and keys.
- `npm test` runs everything, including the RLS and integration suites, and fails with instructions if the database is not running. `npm run test:fast` skips them.
- Ports 54321 to 54329, so it does not clash with other local Postgres, Redis or MinIO containers.

### Running the API

- `npm run dev -w @healthhyr/api` (watch mode) or `npm run start -w @healthhyr/api`, with `apps/api/.env` filled in.
- The server logs one JSON line per event. `PORT=0` picks a free port (not allowed in production).

## 12. Assumptions the owner approved

1. A permanent publish failure ends in 200 only after `needs_review` and the alert are durably written.
2. Reopen follows the rules in section 1.
3. Job thresholds (title at least 5 characters, description at least 50) are placeholders in `constants.ts`.
4. Hiring Pro benefit list as in section 8.
5. The Hiring Pro launch notification is in-app only.
