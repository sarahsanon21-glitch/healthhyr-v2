# Billing System — Architecture Review

**Written for: Sarah, before implementing `docs/BILLING_SPEC.md`.**
Answers section 13 of that spec, lists every conflict with the work already committed on `admin-control-center`, and proposes a build order.

Date: 2026-09-27. Schema facts come from the `000a` introspection output (`docs/A1`–`A4` CSVs), not from reading the code.

---

## Part A — Section 13: what already exists

### 1. Current job models

One table, `jobs`. `backend/models/Job.js` is a dead Mongoose leftover and describes nothing real.

| Present | Absent, and needed by the spec |
|---|---|
| `id`, `employer_id`, `title`, `description`, `specialty`, `location`, `job_type`, `salary_min`, `salary_max`, `salary_type`, `is_active`, `applications_count`, `city`, `county`, `zip_code`, `country`, `created_at`, `updated_at` | `status` (the 6-state model), `published_at`, `expires_at`, `closed_at`, anything Featured |

**There is no status column.** Draft-versus-published is the boolean `is_active`, written once at creation from `isDraft`. Spec §4 needs `DRAFT / PENDING_PAYMENT / ACTIVE / PAUSED / CLOSED / EXPIRED`.

CHECK constraints: `job_type` (4 values; migration 004 widens to 7) and `salary_type` (`hourly|annual`, never written — always NULL).

**`jobs` has only its primary key — no index on `employer_id`, `is_active`, or anything else.** Every expiry sweep and every employer job list is a sequential scan today. That was noted as a deferred performance item; billing makes it load-bearing.

`job_questions` exists and is written. `application_answers` exists and **is never read or written** — screening questions are collected from employers and never asked of applicants.

### 2. Existing employer models

`employer_profiles`: `id`, `user_id`, `company_name`, `company_description`, `website`, `phone`, `address`, `logo_url`, `country`, timestamps. Employers are `users.role = 'employer'`.

- **No `status`** — migration 005 would add it and is now on hold.
- **No `city` / `state` / `zip_code` / `organization_type` / `email`** — also 005. The route probes for them and skips them until the migration runs.
- **No `UNIQUE(user_id)`** — migration 003, pending. Profile save is a racy check-then-insert until then.
- **No recruiter/team table.** Spec §1 promises "up to 3 recruiter/team accounts" on Monthly Unlimited. `employer/Settings.jsx` has a team-roles UI with an Admin/Recruiter picker — it is a pure mockup with no backend.

### 3. Existing Stripe integration

`backend/routes/stripeRoutes.js` (208 lines) plus the webhook at `server.js:118-280`.

| Endpoint | State |
|---|---|
| `POST /api/stripe/create-checkout-session` | **Currently 500s.** Diagnosis below. |
| `GET /api/stripe/subscription-status` | Works |
| `POST /api/stripe/cancel-subscription` | Cannot work — see 4 |
| `POST /api/stripe/billing-portal` | Cannot work — see 4 |

Prices come from four env vars (`STRIPE_STANDARD_MONTHLY/YEARLY`, `STRIPE_PREMIUM_MONTHLY/YEARLY`), all recurring.

**Reusable, and genuinely good:** signature verification with `constructEvent`, and idempotency via the `webhook_events` table keyed on the Stripe event id. Spec §8 requires idempotent webhooks; that mechanism already exists and should be kept. Note commit `bb12f23` changed its failure behaviour — the handler now releases the idempotency row and returns 500 so Stripe retries, instead of logging and returning 200.

Handled events: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`, and `invoice.payment_failed` — the last is a `console.warn` and nothing else.

### 4. Existing subscription/payment logic

One table, `subscriptions`, one row per user: `user_id`, `plan`, `status`, `trial_ends_at`, `current_period_start/end`, `stripe_customer_id`, `stripe_subscription_id`, `job_posts_used`, timestamps. `plan` and `status` are `NOT NULL` with **no CHECK constraint**.

Entitlement lives in `requireSubscription` (`authMiddleware.js:82`) with `JOB_LIMITS = { trial: 5, standard: 200, premium: Infinity }`.

**Two things are broken here and both matter for the rebuild:**

- **`subscriptions` has no `UNIQUE(user_id)`**, so the webhook's `upsert(..., { onConflict: 'user_id' })` fails with Postgres 42P10 and writes nothing. `stripe_subscription_id` has therefore **never been persisted**, which is why cancel-subscription and billing-portal both report "not found". Migration 003 fixes this and is ready to run.
- **`job_posts_used` is selected once and never written or read.** A dead column that was reaching for the credit model the spec now defines properly.

**There is no `transactions`, `payments`, or `invoices` table.** Stripe is the sole record of money. Spec §10 needs an admin transactions view and §11 needs `BillingTransaction`.

### 5. Current job-posting API

| Route | Guards |
|---|---|
| `POST /api/employer/jobs` | `requireActiveProfile` → `requireSubscription` |
| `PUT /api/employer/jobs/:id` | `requireSubscription` |
| `GET /api/employer/jobs` | `requireActiveProfile` |
| `DELETE /api/employer/jobs/:id` | **none beyond employer auth** |
| `GET/POST /api/employer/jobs/:id/questions` | none |

**There is no publish transition.** A draft becomes live by an edit that flips `is_active`. The spec's entire billing model hinges on a publish event, so this endpoint has to be created — and it is the single chokepoint where credit consumption, entitlement, and double-click protection all belong.

### 6. Current applicant/application system

`applications`: `id`, `job_id`, `worker_id`, `status`, `cover_letter`, `applied_at`, `updated_at`.

- **Two redundant unique constraints** on the same pair: `applications_job_id_worker_id_key` and `applications_unique_worker_job`. Two indexes maintained on every write; one is droppable.
- CHECK allows `applied, under_review, interview, offer, hired, rejected`; migration 006 adds `withdrawn`.
- **Spec §6 uses a different vocabulary** — `New, Reviewed, Shortlisted, Interview, Offer, Hired, Rejected`. `New`≈`applied` and `Reviewed`≈`under_review`, but **`Shortlisted` has no equivalent** and the dashboard already displays a "Shortlisted" count computed from something else.

Supporting tables: `interviews` (append-only, no status), `application_status_notifications` (written, never read), `conversations` + `chat_messages`.

**No saved/favourite candidates table.** Spec §1 promises it on the 7-Day and Monthly plans; `saved_jobs` is the seeker saving a job, which is the opposite direction.

Matching: `calculateMatchScore(profile, job)` in `seekerRoutes.js:45` scores **jobs for a seeker**. Spec §7 wants **candidates for an employer** — the same signals, inverted. The scoring function is reusable; the query direction is not.

### 7. Authentication and authorization

Solid and reusable as-is. JWT in an httpOnly `hh_token` cookie; CSRF is `HMAC-SHA256(JWT_SECRET, token)` compared against `X-CSRF-Token` on every non-GET `/api` request. `protect` loads and sanitises the user; `authorize(...roles)` gates by role. `users.role` CHECK is `worker | employer | admin`.

Two caveats: **`requireAdmin` still authenticates by Bearer token** and is unreachable from the browser (fixed in Phase 1), and **there is no permissions system yet** — migration 007.

Rate limiting exists globally (100 req / 15 min across all `/api`) and per-route. Spec §12's duplicate-request protection needs something stronger than a rate limiter at the publish endpoint.

### 8. Admin billing functionality

**None.** The 10 existing `/api/admin/*` endpoints are all account lifecycle (deactivate, reactivate, delete, export, list users). There is no admin UI at all. Spec §10 needs three new sections — Employer Billing, Jobs, Transactions — none of which has any backend.

---

## Part B — Conflicts with the committed batch

### Blocking — must be resolved before billing ships

| # | Conflict | Resolution |
|---|---|---|
| B1 | **Migration 005 + the employer gate.** Encodes "pending until Stripe checkout"; marks every employer without a card-backed subscription `pending` and blocks job posting. The spec is the inverse — profiles and drafts are free. | **Already held** (`8a3781b`). Do not run. The column is still wanted, but as a *verification* state (Phase 2), not a billing gate. Split 005: keep the address columns, drop the status backfill. |
| B2 | **`requireActiveProfile` on `POST/GET /api/employer/jobs`.** Gates job *access*; the spec gates the *publish action*. Under the spec, creating a draft must be free. | Remove from `POST`/`GET /jobs`. Move the entitlement check to the new publish endpoint. The middleware stays for Phase 2 verification/suspension. |
| B3 | **`requireSubscription` + `JOB_LIMITS`.** Account-level tiers with post caps (trial 5 / standard 200 / premium ∞). The spec has no account tiers — it has credits and one unlimited subscription. | Replace with an entitlement resolver: active subscription → unlimited; else credit pack with `credits_remaining > 0`; else payment required. `JOB_LIMITS` is deleted. |
| B4 | **Registration inserts `plan:'none', status:'inactive'`** (`a946abf`), written so the webhook could activate an account-level subscription. | Keep as-is — it is still correct. "No subscription" is exactly right under the new model; the row just stops being the entitlement source. Revisit only if `subscriptions` is restructured. |
| B5 | **The four `STRIPE_*_MONTHLY/YEARLY` price vars.** Two tiers × two cycles, all recurring. | Replaced by five: four one-time (`$3.50`, `$14.00`, `$5.99`, `$9.99`) and one recurring (`$79.99/mo`). New env var names needed — I will list them, you add them. |
| B6 | **The webhook.** Only handles subscription lifecycle, and keys everything on `user_id`. | Extend for one-time `checkout.session.completed` carrying a purchase type, and for `invoice.paid` on renewal (which must reset Featured credits). Keep the `webhook_events` idempotency. |

### Structural — shapes the design

| # | Conflict | Resolution |
|---|---|---|
| S1 | **`jobs.is_active` is a boolean**; the spec needs 6 states. Migration 010 planned a `jobs.status` with a different vocabulary (`active/filled/closed/expired/pending/rejected`). | Supersede 010. One `jobs.status` with the spec's six values plus the admin ones, `is_active` kept in sync by trigger so seeker search is untouched. |
| S2 | **No `transactions` table**; migration 013 planned one for the admin phase. | Pull it forward — billing needs `BillingTransaction` now, and the admin Transactions view (§10) reads it. |
| S3 | **Application status vocabulary differs.** Spec §6 adds `Shortlisted`, which does not exist. | Extend the CHECK in migration 006 to add `shortlisted` alongside `withdrawn`, rather than renaming the existing six — renaming would break every existing row and the validator. |
| S4 | **No atomic increment/decrement is possible through supabase-js.** Credits must not be double-spent on a double-click. | Needs a Postgres function. **A5 found zero functions in the database** — and `increment_applications_count` was called for months without existing, failing silently. The first real RPC must actually be created, and its existence verified. |
| S5 | **Expiry needs a scheduler.** 24-hour and 7-day windows. | Store `expires_at` and **filter on it at read time** so a missed cron can never surface an expired job. A cron endpoint then flips `status` for reporting accuracy. `.github/workflows/keep-alive.yml` is an existing cron precedent; `POST /api/admin/run-scheduled-deletions` is the existing pattern for a cron-triggered endpoint. |
| S6 | **`jobs` has no indexes beyond the PK.** Expiry sweeps and employer job lists are sequential scans. | Add `employer_id`, `status`, `expires_at` indexes as part of the billing migration rather than deferring. |

### Non-blocking, but touched by this work

- The **`applications_count` column** is now unused (`484bdc5` counts live). Leave it; do not resurrect it for billing.
- **`application_answers`** is still never written — screening questions collect nothing. Unchanged by billing, still outstanding.
- **The checkout 500** is in code being replaced. Diagnosis below; no fix warranted.
- **Timestamp columns are `timestamp without time zone`** (38 of them) and display a day off for evening records. **Billing makes this materially worse**: `expires_at` on a 24-hour post is a contractual boundary. Any new billing column should be `timestamptz` from the start, and the existing-column migration should be scheduled.

### Checkout 500 — diagnosis only

The `if (!plan || !PRICE_IDS[plan])` guard returns **400**, so a missing env var is ruled out — the variables are set. Only three lines can reach the 500:

1. **`stripe.checkout.sessions.create`** — most likely. A product id (`prod_…`) stored where a price id (`price_…`) belongs, a price from another Stripe account, or a test/live key mismatch. All pass the truthiness guard and fail at Stripe.
2. **`stripe.customers.create`** — an invalid or revoked `STRIPE_SECRET_KEY`. The error text names authentication rather than a price.
3. **The subscription write** — `bb12f23` made these throw instead of being swallowed, so a previously silent failure now surfaces. Unlikely (the column is unconstrained and a zero-row UPDATE is not an error) but it is the one candidate introduced by this batch.

The handler already logs `Stripe Checkout Error: <message>`, and that one line distinguishes all three. Not worth fixing — the route is being replaced.

---

## Part C — Implementation plan

**Sequencing (agreed):** billing lands **before Phase 2**. Phase 1 — admin shell, RBAC, audit logs, the account-requests queue — has no billing dependency and can proceed independently or in parallel.

The reason billing precedes Phase 2: Phase 2's employer table and verification workflow both display plan, subscription and billing state. Building them against the model being replaced means building them twice.

### Phase B0 — schema foundation
Migrations, none destructive. Run `003`, `004`, `006` first (already ready, unaffected by billing).

- Split held migration `005`: **keep** the address/classification columns, **drop** the status backfill. Re-issue as an address-only migration.
- `jobs`: `status` (6 states + admin states), `published_at`, `expires_at`, `closed_at`, `featured_until`; backfill from `is_active`; trigger keeps `is_active` in sync. Indexes on `employer_id`, `status`, `expires_at`.
- New tables: `billing_transactions`, `job_credit_packs`, `featured_promotions`, `saved_candidates`, `recruiter_members`.
- Extend `applications.status` with `shortlisted`.
- **All new timestamps as `timestamptz`.**

### Phase B1 — entitlement core, no payment yet
The part worth getting right before money touches it.

- `POST /api/employer/jobs/:id/publish` — the single chokepoint.
- A Postgres function for atomic credit consumption (`UPDATE … WHERE credits_remaining > 0 RETURNING`), plus verification that the function actually exists — the `increment_applications_count` lesson.
- An entitlement resolver replacing `requireSubscription`: subscription → credits → payment required.
- Remove `requireActiveProfile` from the job routes; delete `JOB_LIMITS`.
- Tests: double-click cannot double-spend, drafts are free, an exhausted pack blocks publishing.

### Phase B2 — Stripe
- New price env vars (names supplied; you add them).
- One-time checkout for Quick Post, Hiring Pack, and both Featured tiers; recurring for Monthly Unlimited.
- Webhook: grant credits/subscriptions **from the webhook only**, never the success page. Reuse `webhook_events` idempotency. Reset Featured credits on `invoice.paid`.
- Write every event to `billing_transactions`.
- Tests: duplicate webhook delivery grants nothing twice; a frontend-supplied price/plan is ignored.

### Phase B3 — expiry and lifecycle
- `expires_at` filtered at read time (authoritative), cron endpoint flips status for reporting.
- Renew / repost / pause / close.
- Featured placement in search that does **not** hide non-featured jobs (§2).

### Phase B4 — employer surfaces
Hiring Overview, plan/credit display, Billing & Plans, saved candidates, employer-side candidate matching (inverting `calculateMatchScore`).

### Phase B5 — admin billing
Admin → Employer Billing, Jobs, Transactions. Depends on Phase 1's admin shell and RBAC.

### Deferred, explicitly
Recruiter/team accounts (§1) — promised on Monthly Unlimited but currently a frontend mockup; a whole sub-feature with its own auth implications. Advanced analytics (§1). Priority support (§1) — not a software feature.

---

---

# Part D — V2 firm migration list and build order

*Added 2026-10-15, replacing Part C. Part C was written against the V1
model ($3.50 / $14 / $79.99) and is superseded; the spec is now
`docs/BILLING_SPEC.md`.*

**Migrations 003, 004, 006 and 007 have run.** 005 is on hold and split — its
address columns became 007, its `status` column is deferred to Phase 2
verification. `employer_profiles.status` does not exist, so
`requireActiveProfile` is dormant and nothing below activates it.

**Re-run `000a_schema_catalog.sql` into `docs/schema/<today>/` before 008 is
written.** The committed snapshot predates the four applied migrations.

## Migrations

| # | Contents | Gates |
|---|---|---|
| **008** | `worker_profiles`: `directory_opt_in` (**default false**), `available_now`, `preferred_shifts`, `weekly_availability`, `work_locations`, `max_travel_distance_miles` | Must be **live** before any directory surface. Default false means even an out-of-order deploy exposes nobody. |
| **009** | `jobs`: `status`, `published_at`, `expires_at`, `closed_at`, `featured_until`, `is_urgent`, `urgent_start_date`, `work_schedule`; backfill from `is_active`; trigger keeps `is_active` in sync; indexes on `employer_id`, `status`, `expires_at` | Touches live seeker search via the trigger. Needs the regression pass. |
| **010** | `billing_transactions`, `job_payments`, `employer_billing_periods` | Per-period rows, never UPDATE-reset. |
| **011** | `job_invitations` | Carries the 50/period count and response tracking. |
| **012** | `job_views` (append-only) | A counter column would be unauditable and wrong under concurrency. |
| **013** | `notifications`: add `title` and `link` | The bell already reads both; neither exists. Prerequisite for match alerts. |
| **014** | `employer_team_members` | **Deferred** — not in the first release. |
| **015** | Postgres function for atomic quota consumption | **There are still zero functions in this database.** `increment_applications_count` was called for months without existing, failing silently. This one must be created *and* its existence verified. |

All new timestamps are `timestamptz`. The 38 existing `timestamp without time
zone` columns already display a day late for evening records, and `expires_at`
is now a billing boundary rather than a cosmetic field.

## Build order

### Wave 1 — Pay Per Post (sellable at the end)

| | Commit | Migration |
|---|---|---|
| **A1** | Remove the untrue verification claims from `ForEmployers.jsx` | — |
| **A2** | Fix the dashboard "Shortlisted" tile (counts `under_review`) | — |
| **B1** | Seeker privacy and availability controls + Settings UI | 008 |
| **B2** | Job lifecycle: publish endpoint, read-time `expires_at` filtering, extract schedule out of `description` | 009 |
| **B3** | Entitlement resolver; delete `JOB_LIMITS`; drop `requireActiveProfile` from job routes | 010, 015 |
| **B4** | Stripe Pay Per Post one-time checkout + webhook grant | — |
| **B10a** | Pricing page: Pay Per Post live, Pro as "Coming soon", no checkout | — |

### Wave 2 — Hiring Pro (sellable only at the end)

| | Commit | Migration |
|---|---|---|
| **B5** | Candidate directory, opt-in only, server-side filtered | — |
| **B6** | Invitations and match alerts | 011, 013 |
| **B7** | Featured and Urgent — `featured_until = LEAST(now() + 7d, expires_at)` | — |
| **B4b** | Stripe recurring subscription + renewal/lapse/refund handling | — |
| **B10b** | Pricing page: enable Pro checkout, add the "16 posts = $40" comparison | — |

### Later
**B8** real view analytics (012) · **B9** teams (014) · **B11** admin billing

## Deploy-ordering risks

1. **B1 must be live before B5.** Not merged — live. `directory_opt_in` defaulting to false is the backstop, but the ordering stands.
2. **B1 should ship early in Wave 1, not immediately before B5.** Opt-in defaults to off, so if the control and the directory launch together the directory is empty on day one. Shipping it with Wave 1 gives seekers weeks to opt in.
3. **A1 before B5.** Charging for candidate access while claiming those candidates are verified is the worst possible ordering.
4. **Live Stripe keys.** Nothing in B4 is exercisable against production keys. Test-mode keys locally; price IDs are environment-specific.
5. **009's `is_active` trigger** touches live seeker search.
6. **B10a must not list listing views** — no view tracking until B8 — **or team members**, deferred to B9.
7. **005 stays held.** Nothing here creates `employer_profiles.status`.

---

## What I need from you

1. **The `Stripe Checkout Error:` log line**, if you want the 500 closed rather than left to the rewrite.
2. **Confirmation that Featured placement ordering** is acceptable as "featured first within the same relevance band", not "featured above everything".
3. **Whether recruiter/team accounts are in scope** for the first billing release or deferred.
4. Still outstanding from the previous batch: the `photos` and `logos` Supabase Storage buckets, and whether the A1–A4 CSVs should be committed as a schema snapshot.
