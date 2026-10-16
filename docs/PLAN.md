# HealthHyr v2 build plan (approved)

Approved by the owner on 2026-10-16 after three review rounds. The product-shape adjustment (seekers on a mobile app and a minimal website, employers on the web) was approved the same day, together with the decisions in section 15. Sections marked "(adjusted)" carry that change. This file is the source of truth if a session resets. Project rules are in `CLAUDE.md`; the palette is in `docs/COLORS.md`; the threat model and pre-launch security checklist are in `docs/SECURITY.md`; the folder responsibilities, data flow and rules for adding code are in `docs/ARCHITECTURE.md`. If this file and a later owner instruction disagree, the later instruction wins and this file gets updated in the same commit.

**The database SQL lives in `supabase/migrations/0001_schema.sql`.** It is the executable source of truth, and tests keep TypeScript enums and constants in sync with it. Section 5 keeps the design notes.

Working rules (from CLAUDE.md): one step at a time, plan first, stop for approval before new code; whole-file rewrites only; run tests before every commit; no fake data; no "verified" claims; Stripe test keys only while building.

---

## 1. Product decisions

### Product shape (adjusted)

| Who | Where | What they do |
|---|---|---|
| **Job seekers** | **Mobile app** (Expo / React Native, Android first, then iPhone from the same code) | Search jobs, save, apply (Easy Apply), edit profile and resume, manage applications, messages, notifications. No payments and no employer features. |
| **Job seekers** | **Website, minimal** | Sign in or up, edit profile, apply with Easy Apply, see and withdraw applications. Saved jobs, messages, notifications and push stay app-only at first. |
| **Employers** | **Website only** | Dashboard, post a job, pay, manage applicants, messages, and the opt-in seeker directory search (Hiring Pro only; "Coming soon" at launch). |
| **Public** | **Website** | SEO pages: job search and detail, company pages, pricing, Home, For Employers, About, Contact, Terms, Privacy. |

- An employer who signs in on the mobile app sees a message telling them to use the website, and is signed out of the app.
- The mobile app talks only to the Express API (it uses `supabase-js` for sign-in and token refresh, nothing else). Every plan limit stays enforced on the server.
- Why seekers also get the website: public job pages bring visitors on phone browsers and laptops. Without web apply, nobody could apply until the app clears store review, and every visitor would have to install an app first.

### Pricing and rules (unchanged)

- **Pay Per Post $2.50:** one job, 30 days, free edits while live, republishing needs a new payment.
- **Hiring Pro $39.99/month:** shown as "Coming soon" at launch. No checkout button, no subscribe route.
- **Seeker visibility:** opt-in, default OFF. The switch is shown in wave 1 with the approved copy (section 9). There is no directory in wave 1. Only employers with an active Hiring Pro subscription will ever see opted-in seekers.
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

React 19 + Next.js (App Router) for `apps/web`, Tailwind, Express 5 for `apps/api`, Supabase (Postgres, Auth, Storage), Stripe test mode (hosted Checkout), Zoho SMTP for alert emails.

**Mobile (adjusted):** Expo with React Native for `apps/mobile` (npm currently lists Expo SDK 58 as latest; the exact version is pinned when step 24 starts, with `npx expo install` aligning every Expo package). The New Architecture is on by default in current SDKs. Navigation with `expo-router`. Builds and store submissions through EAS (Expo's cloud service), so iPhone builds need no Mac. Bundle id: `com.healthhyr.app` (to be confirmed before step 24).

Express is the only backend and the only place plan limits and Stripe logic live. Next.js is the rendering layer: public pages fetch from public Express endpoints on the server with revalidation; signed-in web areas are client components that call Express with the Supabase session token. The mobile app does the same with its own session.

### Hosting cost (estimates, verify current prices before choosing providers)

| Service | Role | Development | Launch estimate |
|---|---|---|---|
| Next.js web | Pages, SEO | Free (localhost) | About $7-20/month. Vercel free tier is non-commercial. A small Node host is cheaper. |
| Express API | Plan limits, Stripe webhooks, expiry and reconcile jobs, email alerts, push sending | Free (localhost) | About $7-10/month. Must be always-on (free tiers that sleep miss webhooks and jobs). |
| Supabase | Database, auth, storage | Free or local via Docker | About $25/month (Pro). Free projects pause when idle and have no backups. |
| Stripe | Payments | Test mode, free | No monthly fee. 2.9% + $0.30 per card payment: about $0.37 on a $2.50 post (about 15%), net about $2.13. |
| Zoho SMTP | Alert emails | Existing account | Existing |
| Expo EAS | Mobile builds and submissions | Free plan | Free plan lists 15 Android and 15 iOS builds per month in a low-priority queue (verify at signup). Paid plans exist if the queue becomes a problem. |
| Google Play | Android store | | $25 one-time (verify) |
| Apple Developer Program | iPhone store | | $99 per year (verify) |
| Domain | | | About $12-20/year |

Fixed infrastructure is about $40-55/month plus the store fees, roughly 19-26 paid posts per month to cover at $2.13 net each.

## 3. Folder structure

`docs/ARCHITECTURE.md` explains what each folder is responsible for, how data flows, naming conventions and the rules for adding code. This is the layout, including what is still planned.

```
healthhyr-v2/
├─ CLAUDE.md, .gitignore, .gitattributes, .env.example files only
├─ docs/                 COLORS.md, PLAN.md, SECURITY.md, ARCHITECTURE.md, DEVICE-CHECKLIST.md (new, step 24)
├─ package.json          npm workspaces, shared scripts (test, lint, typecheck, db:*)
├─ tests/                repo hygiene tests (no committed secrets, .env ignored); support/mailpit.ts (reads emailed codes from the local mail catcher)
├─ packages/shared/src/
│  ├─ tokens.ts          the only place colors, fonts, spacing live (web uses it directly)
│  ├─ native.ts          (adjusted) React Native values DERIVED from tokens.ts: numbers instead of "12px" strings
│  ├─ constants.ts       prices, 30 days, limits, default company name, contact email
│  ├─ copy.ts            approved user-facing copy that must not drift (visibility switch, pricing disclaimers)
│  ├─ legal/             terms.md, privacy.md (frontmatter status: draft|final), Node only
│  └─ schemas/           zod: auth (step 8), company (step 9), job, application, profile, message, contact (used by web, API and mobile)
├─ apps/web/             Next.js (App Router) + Tailwind
│  └─ src/
│     ├─ app/(public)/   page.tsx (Home), jobs/page.tsx, jobs/[slug]/page.tsx,
│     │                  companies/[slug]/page.tsx (step 9, noindex until step 12), pricing, for-employers, about, contact, terms, privacy, delete-account
│     ├─ app/(auth)/     (step 8) sign-in, sign-up, forgot-password (noindex)
│     ├─ app/(employer)/ dashboard, company (step 9), jobs, applicants, messages (client-side, noindex)
│     ├─ app/(seeker)/   (adjusted) profile, applications (minimal seeker site, noindex)
│     ├─ app/(admin)/    (step 8) admin (noindex)
│     ├─ app/sitemap.ts, robots.ts, layout.tsx
│     ├─ (step 10b) the request interceptor that sets the security headers and the per-request nonce
│     ├─ components/ui/  base components; components/auth/, components/account/ (step 8) and components/company/ (step 9); components/ feature components
│     └─ lib/            public-env.ts (the only place the site reads the environment), api/client.ts (the only place it calls fetch; also the public client),
│                        api/public.ts (server-side public calls), auth/ (Supabase adapter, state machine, guards, redirects), seo/jobPostingJsonLd.ts, seo/canonical.ts
├─ apps/mobile/          (adjusted) Expo app, seekers only
│  ├─ app/               expo-router screens: (auth), (tabs): jobs, saved, applications, messages, profile
│  ├─ src/
│  │  ├─ theme/          theme.ts from shared/native.ts, fonts
│  │  ├─ components/ui/  native base components (Button, Input, Switch, Badge, Card, Logo, Modal, Toast...)
│  │  ├─ auth/           supabase client, chunked secure storage, session, role gate
│  │  ├─ api/            typed API client (bearer token, 401 refresh and retry, error mapping)
│  │  └─ features/       jobs, profile, applications, messages, notifications
│  ├─ tests/             jest-expo + Testing Library, style guard, accessibility rules
│  └─ app.config.ts, eas.json
├─ apps/api/
│  ├─ src/
│  │  ├─ env.ts          the ONLY place process.env and server-only secrets are read (zod, fails fast)
│  │  ├─ app.ts          createApp(): middleware order, no secrets passed in
│  │  ├─ server.ts       entry point: load config, wire, listen
│  │  ├─ auth/           verifyToken.ts (JWKS, asymmetric algorithms only)
│  │  ├─ middleware/     requestId, auth (token, then role from the database), requireRole, errorHandler, security (CORS, per-IP and per-user rate limits)
│  │  ├─ lib/            userClient.ts (per-request, RLS applies), anonClient.ts (public reads, step 9), serviceClient.ts (bypasses RLS, server-only)
│  │  ├─ routes/         paths.ts (API_V1, webhook path), stripeWebhook.ts (reserved); v1/ (me, employer, public, then seeker/, admin/ per section 6.1)
│  │  └─ services/       server-only operations, the only code allowed to use the service client: stripe, checkout, publish, mailer, push, accountDeletion, notifications, jobs (expire, reconcile)
│  └─ tests/             supertest suites, boot test, service-role scanner, integration/ (real Supabase)
└─ supabase/
   ├─ config.toml        local stack: database, auth, the Data API (step 9) and the mail catcher (storage is turned on in step 18)
   ├─ templates/         confirmation.html and recovery.html: the emailed 6-digit code
   ├─ migrations/        0001_schema.sql (executable source of truth); later migrations listed in section 5.5
   └─ tests/
      ├─ rls/            RLS tests against the real local database (helpers, fixtures, 7 suites)
      └─ mutation.mjs    proves the tests fail when a policy, guard or grant is weakened
```

Secrets rule: `.env` files are never committed; only `.env.example` files are. The Supabase service-role key and the Stripe secret key exist only in the API's environment, and in the API only `env.ts` reads them. The web app and the mobile app get only public values: the Supabase URL and publishable key, and the API base URL. They hold no Stripe keys and no service-role key. A hygiene test covers both apps.

## 4. Design tokens, base components, contrast

`packages/shared/src/tokens.ts` is the only file allowed to contain hex values. Tailwind's default palette is replaced by the tokens on the web, so a class like `bg-red-500` does not exist.

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

Web base components (`components/ui/`, built in commits 4 and 5): Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Field, Badge, Card, Logo, Modal, Tabs, Toast, SplitPane, Pagination, Spinner, Skeleton, EmptyState, Avatar.

### 4.1 Tokens on React Native (adjusted)

**Decision: plain `StyleSheet` plus a theme object. No NativeWind.**

| | NativeWind | StyleSheet + theme (chosen) |
|---|---|---|
| Tailwind version | Stable NativeWind 4 needs Tailwind 3. The web app uses Tailwind 4, so the repo would carry two Tailwind majors that cannot share a config. NativeWind 5 supports Tailwind 4, but my search found it only as a preview that depends on a nightly build of `react-native-css`. | None |
| Token use | Indirect, through a generated Tailwind theme | Direct: components read `theme.colors.ink` |
| Rule enforcement | Scan class strings | Scan style objects and imports (simpler, stricter) |
| Code shared with web | Class names only. Components still differ (`View` versus `div`). | None, same as NativeWind in practice |
| Added dependencies | NativeWind, Tailwind 3, plugins | None |

Revisit NativeWind when version 5 is stable and the web app and the app can share one Tailwind major.

**How tokens map** (`packages/shared/src/native.ts`, derived from `tokens.ts`, so there is still one source of truth):

| Web token | React Native value |
|---|---|
| `colors.*` hex strings | The same strings, passed to style props. Only `tokens.ts` contains hex. |
| `fontSizes.xs` = `{ size: '12px', lineHeight: '16px' }` | `{ fontSize: 12, lineHeight: 16 }` (the `px` strings are parsed, never retyped) |
| `spacing`, `radii` | Numbers (React Native units are density-independent points) |
| `fonts.heading` weights 600, 700, 800 | One loaded font family per weight, because custom fonts do not honor `fontWeight` reliably on Android: `Manrope_600SemiBold`, `Manrope_700Bold`, `Manrope_800ExtraBold`. Body: `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_700Bold`. Only these weights are loaded. |
| `shadows.card` (CSS string) | `{ shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }` |
| `MIN_FONT_SIZE_PX` = 12 | Enforced on `fontSize` in the theme and by a source scan |
| `textPairs` allowed combinations | Same list, checked against component styles in tests |
| Dark mode | Not supported (the palette is light only). `userInterfaceStyle` is set to light. |

**Mobile rules (same as web, plus touch):** no raw hex or `rgb()` in components; no text under 12; lime is a fill only (never a text color); olive text only in the Logo at 24 or larger; never `allowFontScaling={false}`; text may grow with the phone's font setting (capped with `maxFontSizeMultiplier` where a layout would break, never below 1.5); every touch target is at least 48 by 48 points; every pressable has an accessibility role and label; errors carry an icon or text, never color alone.

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

Helper functions that take arbitrary ids (`is_admin`, `employer_holds_application_from`, `has_active_hiring_pro`, `employer_can_view_seeker`, `can_message`) live in a `private` schema that the Data API does not expose. They are still executable by the roles, so policies can call them. The Data API configuration exposes only the `public` schema, and a test confirms the private functions are not reachable through it.

### 5.3 What testing against real Supabase found (2026-10-16)

Fixed in `0001_schema.sql` before the first commit of the migration:

- **Over-broad default privileges.** Supabase grants every API role `ALL` on new tables, including `TRUNCATE`, `REFERENCES` and `TRIGGER`. Row-level security does not apply to `TRUNCATE`. The migration now revokes everything from `anon` and `authenticated` and grants back only what is needed, and changes default privileges so later tables start closed. Tests fail if a future migration leaves a gap.
- **Helper functions callable through the API.** In `public`, any signed-in user could call `can_message(...)` or `has_active_hiring_pro(...)` with arbitrary ids to learn who opted in, who applied where, or who has Hiring Pro. They moved to the `private` schema.
- **Wrong refusal reason from `publish_job`.** The function reported `payment_already_consumed` for every refusal, because its diagnostic ran after its own first step. The transaction still rolled back, so no money logic broke, but the admin alert would have carried the wrong reason. It now works out the reason before changing anything.

**Found in step 9, when the Data API went on:** a signed-in user holding their own token can write the columns they are allowed to update (for example `employer_profiles.website` and `description`) straight through the Data API, skipping the API's validation. Row-level security and column privileges still hold (they cannot touch anyone else's row, nor `is_listed` or `slug`). But format and length rules that only exist in the API (a website must be an http or https address, description at most 5,000 characters) can be bypassed. Today's answer: anything shown publicly is re-checked on the way out (the public company route drops a website that is not http or https, and the page does it again). Planned fix: database CHECK constraints for the same rules, in a numbered migration with RLS and mutation tests (section 15, open items).

### 5.4 Deferred schema (Hiring Pro build)

`subscriptions.current_period_start`; `jobs.subscription_id` for counting the 30-posts-per-period allowance, enforced in a server-only SQL function; an `invitations` table (invite candidates to apply); directory query endpoint with an explicit column allowlist (no contact fields); filters by role, certifications, availability, preferred shifts and city/state (no distance).

### 5.5 Schema additions the mobile app and public search need (adjusted)

The schema, RLS and API are unchanged except for the items below. None of them blocks the app from starting, and each ships in its own numbered migration with RLS tests.

| Migration | Needed for | Change | Step |
|---|---|---|---|
| `0002_job_search` | Public job search (web and app) | A generated full-text column on `jobs` and a GIN index; index on `(state, city)` | 11 |
| `0003_push_tokens` | Push notifications | `push_tokens` (user id, Expo push token unique, platform, device id, created and last-seen times). RLS: the owner reads, inserts and deletes only their own. The API prunes tokens that Expo reports as no longer registered. | 30 |
| `0004_report_and_block` | Store rules for user-generated content (messages between employers and seekers): a way to report a message and to block a user | `message_reports` and `user_blocks` with RLS; `private.can_message` also refuses when a block exists in either direction. This is a change to an existing function, so it gets its own tests and a mutation entry. To be confirmed against the current Apple and Google wording when step 29 starts. | 29 |
| later | Hiring Pro | `invitations`, subscription columns (section 5.4) | 34 to 35 |
| to schedule | Database CHECK constraints for the format and length rules that only the API enforces today (section 5.3) | Decide the step with the owner; the first step that adds a user-editable text column (step 10, jobs) is the natural place | 10 or later |

Account deletion needs no schema change. Deleting the auth user cascades through the seeker's profile, private row, experience, certifications, languages, applications, saved jobs, notifications and messages (both directions). `contact_messages.user_id` becomes null. Employer accounts cannot be deleted this way, because payment history is never deleted (`payments.employer_id` restricts), so employer deletion is a support request for now. Employer accounts are not created in the app.

## 6. API design and server flows (Express)

### 6.0 API rules (commit 7)

**Which Supabase client (the central rule).**

- **User-initiated reads and writes use `req.auth.db`**: a per-request Supabase client built with the anon key and the caller's own JWT (`src/lib/userClient.ts`). Postgres runs the query as that user, so row-level security and the column privileges apply. This is the default for every route that serves a signed-in person.
- **Public reads (no sign-in) use an anon-key client** (`src/lib/anonClient.ts`, built in step 9 with the public company route), so the anon role's row-level security decides what is visible (listed employers' pages now, published unexpired jobs from step 11).
- **The service-role client (`src/lib/serviceClient.ts`) bypasses RLS** and is for server-only operations that no user performs directly: Stripe webhooks, `publish_job` and the other server-only SQL functions, expiry and reconcile jobs, and audited admin actions. That code lives in `src/services/`.
- **Any endpoint that needs the service client checks ownership in code**, because the database will not.
- **A test enforces it.** `apps/api/tests/service-role-scan.test.ts` scans the API source and fails if a route, middleware or `app.ts` imports the service-role client without a `// service-role-allowed: <reason>` comment (the reason is required). It also fails if the service-role key is named outside `env.ts`, `server.ts` and `lib/serviceClient.ts`, if `process.env` is read outside `env.ts` and `server.ts`, or if the Stripe secret key is named outside them.
- **User actions that must use the service role by design.** The schema makes some writes API-only, or they touch storage, so these routes carry an allow comment, check the caller's role and ownership in code, and have a test that a stranger is refused:
  - apply to a job (application inserts are API-only, so the API can copy the resume and enforce limits)
  - withdraw an application (also deletes the stored resume)
  - resume upload (creating a signed upload link and checking the stored file)
  - employer download of an applicant's resume (signed link, only for a non-withdrawn applicant)
  - start checkout, cancel checkout, close and reopen a job (server-only SQL functions)
  - submit the contact form (inserts are API-only so the API can rate-limit and audit)
  - delete my account (needs the auth admin API and storage cleanup)
  - audited admin reads and actions

**Authentication** (`middleware/auth.ts`, `auth/verifyToken.ts`):

1. The token must be `Authorization: Bearer <jwt>`.
2. It is verified against the project's published public keys (JWKS): signature, expiry (5 seconds of clock tolerance), not-before, issuer, audience, and the presence of `exp`, `iat` and `sub`. Only asymmetric algorithms (ES256, RS256) are accepted, so `alg: none` and HMAC tricks are refused. Supabase's own anon and service-role keys are not user tokens and are refused. Anonymous sign-ins are not used.
3. The role is then read from the `profiles` table through the per-request client. It is **never** taken from the token or from anything the client sends, and it is read again on every request, so a role change in the database applies to existing tokens at once.
4. A valid token with no profile row gets `403 no_profile`. An expired token gets `401 token_expired`; any other bad token gets `401 invalid_token`.
5. `requireRole(...)` allows only the listed roles. If authentication did not run, it answers 401, so a mistake in route order fails closed.

Projects still using a shared-secret (HS256) JWT would need to move to Supabase's signing keys, which is the default for new projects and for the local stack. (Confirmed in step 9: the local Data API accepts the ES256 tokens Supabase Auth issues.)

**Errors** (`middleware/errorHandler.ts`): one handler. A response never contains a stack trace, file path, SQL, database error text, or anything the caller sent. Known errors (`HttpError`, validation, bad JSON, body too large) get fixed friendly messages. Everything else is a generic 500 with a request id. The full error, including Supabase's plain-object errors, goes to the server log with the same request id. Every response carries `X-Request-Id`.

**Security middleware** (`app.ts` order): request id, helmet, the Stripe webhook route, health, CORS allowlist, per-IP rate limit (draft-7 headers, 429 JSON), JSON parser (100 KB), then the public routes under `/api/v1/public` (no sign-in; an unknown public path is a 404), then the `/api/v1` router (authenticate, per-user rate limit, routes), JSON 404, error handler.

- **CORS allowlist:** a browser request from an unlisted origin gets 403, not just missing headers. Requests with no `Origin` (Stripe, curl, servers, **and the mobile app**) pass. Credentials are off (bearer tokens, no cookies). Production requires an explicit list.
- **Rate limiting** counts failed and successful requests alike, so token guessing is throttled. The per-IP limit runs first, including on public routes. After authentication, a per-user limit (keyed by user id, `USER_RATE_LIMIT_WINDOW_MS` and `USER_RATE_LIMIT_MAX`) runs too, so many phones behind one carrier IP do not punish each other. `strictLimiter` is there for expensive endpoints later.
- **Stripe webhook route** `POST /api/webhooks/stripe` is mounted before CORS, the rate limit and the JSON parser, with a raw 1 MB body parser, so signature verification (step 15) gets the exact bytes Stripe sent. It needs no sign-in and is not throttled. Until it is built it answers 501. **It keeps this path, which is not versioned, because Stripe is configured with the URL.**

**Configuration** (`env.ts`): validated with zod at boot. The process exits with code 1 and names every problem, never printing a value. It refuses a live Stripe key outside production, and in production requires https, an explicit CORS list and an explicit port.

### 6.1 API additions the website and the app need (adjusted)

Nothing existing changes except the version prefix. These are new routes. "Client" says which Supabase client the route uses (section 6.0). Routes marked **service** carry an allow comment, check ownership in code and have a "stranger is refused" test. All routes below live under `/api/v1`.

| Group | Route | Who | Client | Needed by | Step |
|---|---|---|---|---|---|
| Employer | `GET`, `PUT /api/v1/employer/company` (company profile; `is_listed`, `slug`, `id` and the logo are never accepted from the client) | employer | user | web | 9 (built) |
| Public | `GET /api/v1/public/companies/:slug` (404 until the name is changed from the default; returns only the allowlist in section 6.3) | anyone | anon | web, app | 9 (built) |
| Public | `GET /api/v1/public/jobs` (search, filters, cursor paging) | anyone | anon | web SEO pages, app | 11 |
| Public | `GET /api/v1/public/jobs/:id` | anyone | anon | web, app | 11 |
| Public | `GET /api/v1/public/app-config` (minimum supported app version, notice) | the app | none | app force-update | 24 |
| Seeker | `GET`, `PUT /api/v1/seeker/profile` (includes the visibility switch) | seeker | user | web, app | 18 |
| Seeker | `GET`, `PUT /api/v1/seeker/private` (phone, zip) | seeker | user | web, app | 18 |
| Seeker | `/api/v1/seeker/experience`, `/certifications`, `/languages` (create, update, delete) | seeker | user | web, app | 18 |
| Seeker | `POST /api/v1/seeker/resume/upload-url`, then `POST /api/v1/seeker/resume/confirm` (PDF, DOC or DOCX, up to 5 MB, one active resume; the API checks type and size server-side) | seeker | **service** | web, app | 18 |
| Seeker | `POST /api/v1/jobs/:id/apply` (Easy Apply: profile and a copy of the resume) | seeker | **service** | web, app | 19 |
| Seeker | `GET /api/v1/me/applications`, `POST /api/v1/applications/:id/withdraw` | seeker | user / **service** | web, app | 19 |
| Seeker | `GET`, `PUT`, `DELETE /api/v1/me/saved-jobs/:jobId` | seeker | user | app | 26 |
| Both | `GET /api/v1/messages/threads`, thread, send, mark read; `GET /api/v1/me/notifications`, mark read | seeker, employer | user | web (employer), app | 21 |
| Seeker | `POST`, `DELETE /api/v1/me/push-tokens` | seeker | user | app | 30 |
| Seeker | `POST /api/v1/messages/:id/report`, `PUT`, `DELETE /api/v1/me/blocks/:userId` | seeker | user | app (store rules) | 29 |
| Seeker | `DELETE /api/v1/me` (account deletion; needs the password again) | seeker | **service** | app (store rules), web page | 31 |
| Employer | jobs create, edit, close, reopen; checkout, cancel checkout | employer | user / **service** | web | 10 to 14 |
| Employer | applicants list, set status (five statuses), resume download link | employer | user / **service** | web | 19 |
| Admin | moderation, contact inbox, needs-review payments, audited reads | admin | **service** | web | 23 |

Other changes to the API, all small:

- **Per-user rate limit** after authentication (keyed by user id), alongside the per-IP limit. Many phones share one carrier IP, so a per-IP limit alone would punish innocent users. **Built in step 8.**
- **Version prefix (approved). Built in step 8.** Mobile apps cannot be updated instantly, so the API must stay compatible with old app versions. User and public routes moved from `/api` to `/api/v1` in step 8, before any client ships, and commit 7's tests moved with them. The Stripe webhook path stays `/api/webhooks/stripe`. `/api/me` answers 404, and `apps/api/tests/versioning.test.ts` says so.
- **`GET /api/v1/me`** returns `{ id, role }`. A signed-in account with no profile gets `403 no_profile` (unchanged from commit 7), which the website and the app both turn into a "your account is not set up" screen. It is not changed to return a "has profile" flag: the 403 already carries that and every client handles it.
- **Push sending** (`services/push.ts`) calls Expo's push service in batches, checks receipts, and prunes dead tokens. It runs on the server, never from the phone.

### Checkout: `POST /api/v1/jobs/:id/checkout`
1. Caller must own the job. If the job already has a `succeeded`, unconsumed payment, publish it instead of charging again.
2. Call `start_checkout` (server-side price from `constants.ts`, never from the client). It refuses with `HY002` and a reason: job not found, wrong status (only `draft` or `pending_payment`), employer not listed ("Set your company name first"), or incomplete fields (the response lists them).
3. Reuse the open Checkout session for the payment if one exists, otherwise create one (about 30 minutes to expiry). Store its id on the payment. If Stripe fails, call `cancel_checkout` so the job returns to `draft`.

### Edits and cancel checkout
- While a job is `pending_payment`, the database blocks edits to its content (`jobs_guard`). The employer must cancel checkout first.
- `POST /api/v1/jobs/:id/cancel-checkout`: expire the Stripe session. If Stripe says the session is already complete, refuse (409, "payment is being processed"). Otherwise call `cancel_checkout`: the payment becomes `canceled` and the job returns to `draft`.
- On `checkout.session.expired`, the same transition runs, so an abandoned checkout never leaves a job locked. The reconcile job covers a missed event.
- `publish_job` re-validates required fields at publish time regardless.

### Close and reopen
- `POST /api/v1/jobs/:id/close`: `published` -> `closed` (no refund).
- `POST /api/v1/jobs/:id/reopen`: `reopen_job` applies the rules in section 1.

### Stripe webhook handler (step 15)
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
   - Send the support alert email (below).
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
`POST /api/v1/applications/:id/withdraw` sets the status to `withdrawn`. The guard trigger clears `resume_url` and `cover_note` for every caller, and the CHECK constraint enforces it. The API then deletes the private-bucket resume copy, and a cleanup job removes any stored copy whose application has no `resume_url`. Employers lose access to the applicant's profile and name and see "Applicant withdrew". A resume an employer already downloaded cannot be recalled, so copy must not promise that.

### Legal text and live-key gate
`shared/src/legal/terms.md` and `privacy.md` carry `status: draft` until the owner supplies the text. While a document is draft, its page shows a "Draft" banner and `noindex` and is left out of the sitemap. The API refuses to boot with a live Stripe key (`sk_live_`, `rk_live_`) if either document is draft or `NODE_ENV` is not production. The `NODE_ENV` half is built (commit 7); the draft-document half comes in step 17. No legal text is written by the assistant. **The owner supplies the final text before step 22. Live Stripe stays blocked until then. The stores also need the final privacy policy at a public URL (section 10), so this text is on the critical path for both launches.**

### Hiring Pro launch notification
Admin-only `announce-hiring-pro` refuses to run until `HIRING_PRO_ENABLED` is true and a Hiring Pro price exists. It inserts one in-app notification per seeker with `is_visible = true` (`on conflict do nothing`, so it is safe to run twice) and writes an audit row. In-app only at first; with push (step 30) it can also send a push to those seekers.

## 6.2 Website sign-in (step 8)

How the website signs people in, and what it never does.

- **One adapter talks to Supabase Auth.** `apps/web/src/lib/auth/backend.ts` is the only file that imports `supabase-js`. The rest of the site uses a small `AuthBackend` interface, so screens and tests never touch the provider. The browser holds the **publishable key only**. The site refuses to start if the key looks like a secret or service-role key.
- **The role always comes from `GET /api/v1/me`.** The auth service builds its signed-in user in exactly one place, from that response (validated with zod). It never decodes the token and never reads `app_metadata`, `user_metadata`, browser storage, cookies or the URL for a role. Source-rule tests fail if any file does.
- **States.** `loading`, `signedOut`, `signedIn`, `noProfile`, `error`. Protected pages render nothing but a spinner while loading, and never render protected content on the server. A 401 from the API is refreshed once and retried once, then the person is signed out. A 403 `no_profile` shows "Your account is not set up yet". A failed or unreachable API shows a friendly message with "Try again".
- **Role routing.** Employer goes to `/dashboard`, seeker to `/profile`, admin to `/admin`. A signed-in person who opens a page for another role is sent to their own home. A signed-out visitor to a protected page is sent to `/sign-in?next=...` after a spinner; `next` accepts only same-site paths (no open redirects). Signed-in people who open sign-in or sign-up are sent home.
- **Sign-up** offers only "seeker" and "employer". A `?role=` link preselects one of those two and nothing else. The shared zod schema, the service and the form all refuse any other value, and the database signup trigger turns anything but `employer` into `seeker` and never creates an admin (proved against real Supabase). Admin is created only with the service role.
- **Email codes.** Sign-up confirmation and password reset use a 6-digit code emailed by Supabase (valid 15 minutes), not links. Reset verifies the code, then sets the new password. A new code can be requested after a 30 second wait. Messages are fixed friendly text: a wrong password and an unknown address look the same, password reset says the same thing for every address, and sign-up never says "already registered".
- **Never in the page or the logs.** Passwords live only in the password field and go straight to Supabase over HTTPS. They are never put in text, URLs, logs or sent to the HealthHyr API. Nothing calls `console`.
- **Known gap, closed in step 10b:** the Supabase session sits in the browser's local storage (the library default), so a script injected into the site could read it. The site sets no security headers or Content-Security-Policy yet. Step 10b adds them as its own commit, before the first public route that lists jobs (section 11 and `docs/SECURITY.md`). The public company page from step 9 is the one public page that exists before 10b; it renders only plain text, shows no scripts of its own and no images, and is `noindex`.

## 6.3 Company profile and the public company page (step 9)

- **Employer side.** `GET` and `PUT /api/v1/employer/company`, employers only (a seeker or admin gets 403, no token 401). A save replaces the seven editable fields (name, description, website, industry, size, city, state); a field left out is cleared. The body is validated by one shared strict zod schema, so `is_listed`, `slug`, `id`, `employer_id`, the logo and any unknown field are refused with 400 and nothing is saved. The website must be an http or https address, text has length limits, size comes from a list (1-10, 11-50, 51-200, 201-500, 501-1000, 1000+), and empty boxes become null. The logo is not editable yet: uploads arrive with step 18.
- **Ownership, two layers.** The database refuses any row that is not the caller's (RLS on the per-request client that carries their token). The code also filters every query by the caller's own id from the verified token, never an id from the request. If the database saves nothing, the answer is 404 and nothing was created. Tests cover both layers, including a run with RLS switched off, so the code-level check holds on its own.
- **Public side.** `GET /api/v1/public/companies/:slug`, no sign-in, anon client. It returns **only** an explicit allowlist, built field by field: `companyName`, `description`, `website`, `logoUrl`, `industry`, `companySize`, `city`, `state` (`PUBLIC_COMPANY_FIELDS` in shared). Never the id, the slug, the listing flag or any other column. A test fails if any other field appears, including a column added to the table later. The website is passed on only if it is a real http or https address.
- **404 until renamed.** A company still on the default name has no slug and is not listed, so every address answers 404, identical to a company that does not exist. A company renamed back to the default is hidden again (the route asks for `is_listed` itself as well as relying on RLS). The slug is created once, when the name first changes, and never changes after that: later renames keep it, and the page follows the new name.
- **Addresses.** A slug is lowercase letters, digits and single hyphens (at most 160). Anything else is a plain 404 without asking the database.
- **Web.** `/company` in the employer area (load, validate, save, with every state: loading, load error with retry, busy, field errors, server errors, saved with a link to the public page). `/companies/[slug]` renders the allowlist as plain text; no logo is shown yet; the website is shown as a link only if it is a real http or https address (checked again on the page, because the database lets an employer write that column directly, section 5.3); the page is `noindex` until step 12. An API that is down is an error, not a 404.
- **Real-Data-API proof.** The integration tests run all of this, and row-level security itself, through the real Data API with real Supabase Auth tokens: a user sees only their own profile, cannot read or change another company by calling the Data API directly, cannot set `is_listed`, `slug` or `role`, a forged token is refused, and the private schema is unreachable.

## 7. Mobile app design (adjusted)

### 7.1 Scope

Seekers only. Screens: sign in and up, jobs (search, filters, detail), saved jobs, apply (Easy Apply), applications (status, withdraw), messages (threads, report, block), notifications, profile (basics, experience, certifications, languages, shift preferences, resume, visibility switch with the approved copy), settings (sign out, delete account, legal links). No payments, no employer features, no directory.

If an employer or admin account signs in: a full-screen message ("Employer accounts use the HealthHyr website") with a button that opens the website, and the session is cleared from the phone.

### 7.2 Structure

`expo-router` for navigation; a typed API client in `src/api`; screens only call the API (never the database directly); forms validate with the same zod schemas as the API (`packages/shared/schemas`). Server data is cached with TanStack Query (optional, step 26). Expo's Metro bundler resolves the `@healthhyr/shared` workspace package (TypeScript source, as the web app does). `legal/` in shared stays Node-only and is never imported by the app.

### 7.3 Auth on mobile

- **Supabase client** with `persistSession` and `autoRefreshToken`, and no URL session detection. It is used for sign-in, sign-up, code verification, refresh and sign-out only.
- **Secure token storage: chunked `expo-secure-store`.** A Supabase session is larger than the 2048-byte limit Expo documents for one SecureStore value, so the storage adapter splits the session JSON across several SecureStore keys (about 1.8 KB each) and reassembles it, cleaning up leftover chunks. SecureStore uses the iOS Keychain and the Android Keystore, so the whole session stays hardware-backed. Supabase's own guide uses a different approach (an AES key in SecureStore and the encrypted session in AsyncStorage), which needs two more packages, one of them about 50 MB unpacked. The chunked adapter is covered by unit tests (round trip, missing chunks, interrupted writes, cleanup on sign-out). If it proves unreliable on a real device, Supabase's documented approach is the fallback.
- **Refresh:** automatic refresh runs while the app is in the foreground and is stopped in the background (an AppState listener). Every API call asks the client for the current session first. If the API answers `401 token_expired`, the app refreshes once and retries once, then signs out.
- **Role check from the API, never from the token:** after sign-in and on every cold start the app calls `GET /api/v1/me`. A role other than `seeker` shows the employer message and signs out. `no_profile` shows a "your account is not set up" screen with a retry. The website already works this way (section 6.2); the app reuses the same shared schemas and error wording.
- **Sign-up (seekers only)** with email and password (at least 8 characters) and a 6-digit code emailed by Supabase to confirm the address. Forgot password uses the same kind of emailed code, then sets a new password. This avoids email links and deep links in version 1.
- **Delete account** asks for the password again, calls `DELETE /api/v1/me`, then clears the phone.
- **Sign-out** removes the push token from the server first, then clears the session.
- **Not in version 1:** biometric lock, certificate pinning, root or jailbreak detection, social logins. (Apple's "Sign in with Apple" rule only applies when other third-party logins are offered, which this app does not do.)
- Logs and crash output never contain tokens or passwords. The only values in the app bundle are public: API URL, Supabase URL and publishable key (hygiene test).

### 7.4 Accessibility on mobile

The same rules as the web (section 4.1) plus touch: roles, labels and states on every control (`accessibilityRole`, `accessibilityLabel`, `accessibilityState`), error messages announced to screen readers, 48-point touch targets, text that grows with the phone's font size, and the same contrast pairs as the web.

### 7.5 Mobile tests

- **Runner:** Jest with the `jest-expo` preset and React Native Testing Library. React Native components do not run in Vitest, so the repo gains a second runner; `npm test` runs both.
- **Component tests** for every base component: roles, labels, `accessibilityState` (disabled, selected, checked, busy), disabled and error states, minimum touch target size, `allowFontScaling` never off, errors with an icon or text, press behavior.
- **Source guard** (like the web style guard) over `apps/mobile`: no raw hex or `rgb()`, no numeric `fontSize` below 12 or outside the theme, lime never used as a text color, olive only in the Logo at 24 or larger, no `allowFontScaling={false}`, no pressable without an accessibility role.
- **Theme parity:** `native.ts` equals the values derived from `tokens.ts`; every text and background pair used by a component is in the allowed contrast list.
- **Logic tests:** the secure-storage adapter, the role gate, refresh and retry, API error mapping, form validation against the shared schemas, approved copy (visibility switch) rendered word for word.
- **Screen tests** with a mocked API client (loading, empty, error and success states).
- **Not checked by any of this (needs a real phone):** see the list below. `docs/DEVICE-CHECKLIST.md` is written in step 24 and run before every store submission.

**Only a real phone can check:**
- Screen reader behavior: TalkBack on Android and VoiceOver on iPhone (reading order, announcements, focus after navigation and after an error).
- Touch comfort and gestures, notches, rounded corners, gesture navigation bars, foldables and tablets.
- The largest system font size, Android "display size", iOS "bold text" and "larger accessibility sizes", with no clipped text.
- The on-screen keyboard covering fields, and password managers filling them.
- Secure storage after a lock screen change, a backup and restore, an OS update, and an app reinstall.
- Picking a resume from Drive, Files, downloads and other apps' storage, and uploading over a slow connection.
- Push notifications (Android FCM and iPhone APNs): arriving with the app in the foreground, in the background and closed, tapping to the right screen, and token refresh.
- App resume after hours in the background, switching networks, airplane mode, and a slow or flaky connection.
- Performance and memory on a low-end Android phone.
- Install and update paths, the Play pre-launch report, and TestFlight.
- Screen readability outdoors (real contrast in sunlight).

## 8. SEO

Built across steps 9, 11, 12 and 22, and checked again in step 36. The security-side checklist is in `docs/SECURITY.md`; the rules here are the search-side checklist. "Tests" are written in the step that builds the item.

### 8.1 Rules that already exist

- JobPosting JSON-LD: `datePosted = published_at`, `validThrough = expires_at`, `hiringOrganization`, `jobLocation`, `baseSalary` when pay is set. **No "verified" or "background checked" claims in structured data or page text.**
- Expired or closed jobs: 200 with `noindex`, a "no longer accepting applications" notice, no JSON-LD, and removal from the sitemap.
- Canonical URLs: `/jobs/{slug}-{id}` and `/companies/{slug}`, with a redirect from a wrong slug. Filtered search URLs canonicalize to `/jobs`.
- Sitemap: published, non-expired jobs, listed companies, indexable static pages (Terms and Privacy only once final).
- robots: disallow `/dashboard`, `/messages`, `/api`. Seeker profiles have no public pages. The sign-in, sign-up, forgot-password and signed-in pages already carry `noindex` (step 8), and so does the company page (step 9) until step 12.
- Revalidate affected pages when a job is published, expires, closes or reopens.
- **(adjusted)** A job page shows an Apply button for seekers on the web. Once the app is published, it also shows store links; until then, no store badge or "get the app" claim appears.

### 8.2 Checklist

| Item | What it means here | Step | Tests |
|---|---|---|---|
| **Per-page title and description** | A unique `<title>` (about 60 characters) and meta description (about 155) on every public page, built from real data with a fixed pattern (for example "{Job title} at {Company} in {City}, {State} | HealthHyr"). No empty or duplicate titles. | 9 (company title, built), 11, 12, 22 | A test renders each public route's metadata, fails on empty, missing or over-long values, and fails if two sample routes would produce the same title |
| **Canonical URLs** | One canonical per page, absolute URL, pointing at the clean path; filtered and paged search canonicalize as above; wrong slug redirects. | 11, 12 | Canonical and redirect tests |
| **Open Graph and Twitter cards** | `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:image` and `twitter:card` (summary or large image) on every public page. The image is a plain brand image or a generated card from real fields, never a fake logo or screenshot. | 12, 22 | Metadata test checks the tags and that the image URL is absolute and exists |
| **JSON-LD: JobPosting** | As in 8.1, with only fields we actually have; omitted when a field is missing, never invented. | 12 | Field tests; absent on expired and closed jobs |
| **JSON-LD: Organization** | On company pages and the home page: name, URL, logo only if the employer uploaded one, `sameAs` only if supplied. Never ratings, review counts, awards or verification. | 12 | Field tests; fails if a banned property appears |
| **JSON-LD: BreadcrumbList** | Home → Jobs → job, and Home → Companies → company, matching the visible breadcrumb. | 12 | Structure and URL tests |
| **JSON-LD safety** | Serialized with `<` escaped so text from users cannot close the script tag; rendered only through one helper that carries the CSP nonce (step 10b). | 12 | Escaping test with hostile text |
| **No "verified" claims** | Banned phrases scanned across web copy, metadata, structured data, sitemap and later app and store text. | 12 and 36 | Banned-phrase scan (full scan at 36, earlier scans added as pages appear; the company page test already checks for such words) |
| **`noindex` for expired jobs and private pages** | Expired or closed jobs, sign-in, sign-up, reset, dashboards, seeker pages, admin, drafts of Terms and Privacy, and any page without real content (such as a company page still on the default name, which is a 404 anyway). | 8 (done), 9 (company page, done), 11, 12, 22 | Each page type tested for the right robots meta and status |
| **Sitemap and robots** | `sitemap.ts` lists only indexable URLs with real `lastmod` dates; split by type if it grows past 50,000 URLs. `robots.ts` points to the sitemap and disallows private paths. | 12 | Sitemap content tests (no expired, no unlisted, no drafts); robots test |
| **Images** | `next/image` with explicit width and height, modern formats, lazy loading below the fold, descriptive `alt` text for content images and empty `alt` for decoration. No layout shift from images. | 18, 22 | Component tests for alt text and dimensions; a source rule against raw `<img>` in `apps/web/src` (the company page shows no image until uploads exist) |
| **Fonts** | Manrope and DM Sans through `next/font` (self-hosted, no render-blocking request), only the weights used, `display: swap`, size-adjusted fallback. | 3 (done), 36 | Existing font test; a check that no other font file or request is added |
| **Core Web Vitals** | Targets on a mid-range phone and a throttled connection: LCP under 2.5 s, INP under 200 ms, CLS under 0.1. Public pages are server-rendered, ship little client JavaScript, and avoid layout shift (reserved space, skeletons). Measure with Lighthouse in CI or by hand and a field check after launch. | 11, 12, 36 | Lighthouse or equivalent run on the main public pages with budgets (new tool, ask the owner first) |
| **Rendering and the CSP** | A per-request nonce (step 10b) can turn static pages into per-request renders. Step 10b measures this on the public pages and picks the approach (see `docs/SECURITY.md`) so SEO pages stay fast and cacheable. The company page is already rendered on request (it fetches with no cache), so it is a good first measurement. | 10b, 11 | Header tests plus a cache and speed check |
| **Internal links and breadcrumbs** | Real `<a href>` links between jobs, companies and search; no links that need JavaScript to exist; a visible breadcrumb matching the JSON-LD. | 11, 12 | Link tests on rendered pages |
| **Search Console and Bing Webmaster Tools** | After launch: verify the domain by DNS, submit the sitemap, watch coverage, structured-data and Core Web Vitals reports, and fix errors. Owner action; no code needed except the sitemap. | After launch 1 | None (manual) |
| **Not indexable on purpose** | Seeker profiles, messages, applications, anything behind sign-in. | 8 (done), 19, 20 | `noindex` tests per area |

## 9. Approved copy and page content

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

Terms and Privacy: ship as pages marked Draft with `noindex` until the owner supplies the text. They must be final, public and indexable before the web launch and before the app is submitted (section 10).

## 10. Store requirements to prepare (adjusted)

These rules change often. Everything here is from my notes and a few searches, and each item must be re-checked against the stores' current pages when its step starts.

### 10.1 What the stores will ask for

| Requirement | Applies to | What we need |
|---|---|---|
| **Privacy policy at a public URL** | Both | Final text (owner-supplied), on `healthhyr.com/privacy`, no login, linked in the listing and in the app. Must match what the app really collects (10.2). |
| **Account deletion** | Both. Apple's guideline 5.1.1(v): an app that supports account creation must let people start deletion inside the app (deactivation alone is not enough; a direct link to a web page that finishes it is allowed; do not require a phone call or email). Google asks for an in-app path and a web link. | In-app "Delete account" (step 31) and a public web page `/delete-account` that explains and completes it. |
| **Data safety (Google) and App Privacy labels (Apple)** | Both | Filled from the data inventory in 10.2. Any new SDK that collects data (crash reporting, analytics) means updating these forms first. |
| **Test accounts for reviewers** | Both | A seeker account, and an employer account to show the "use the website" message, with working passwords in the review notes. Reviewers also need real content in the app (see 10.3). |
| **User-generated content rules** (messages between people) | Apple 1.2 and Google's UGC policy, as I understand them | A way to report a message, a way to block a user, and published contact details. Built in step 29 (`0004_report_and_block`). |
| **Content and age rating questionnaires** | Both | Jobs app, no ads, no gambling, not for children. |
| **Permissions explanations** | Both | Notifications (opt-in prompt with a reason). File access uses the system document picker, so no broad storage permission. |
| **Encryption and export declarations** | Apple | The app uses only standard HTTPS, so the exempt answer applies (to be confirmed in App Store Connect). |
| **Listing assets** | Both | Icon, screenshots from real devices, short and long descriptions, support URL, support email. No unproven claims (nothing like "verified employers"). |
| **Developer accounts** | Both | Google Play ($25 one-time) and Apple Developer Program ($99 per year), plus a free Expo account. Fees as I recall them; verify at signup. |
| **Closed testing for new personal Google accounts** | Google | Google's help page says a personal account created after November 13, 2023 must run a closed test with at least 12 testers opted in continuously for 14 days before it can apply for production access. The account type is not decided yet; the plan assumes this gate until it is. |
| **Target API level and signing** | Google | EAS and Expo track the required Android target level; Play manages app signing. Confirm at the first build. |

### 10.2 Data inventory (starting point for the privacy policy and both data forms)

| Data | Why | Who handles it | Optional? | Removed by account deletion? |
|---|---|---|---|---|
| Email address | Sign in, account email | Supabase (our processor) | No | Yes |
| Display name | Shown to employers you apply to | Supabase | No | Yes |
| Phone, ZIP | Contact for employers you apply to | Supabase | Yes | Yes |
| Resume file | Applications | Supabase Storage | Yes | Yes (stored file deleted) |
| Work history, certifications, languages, headline, summary, shift preferences | Profile and applications | Supabase | Yes | Yes |
| City and state | Job matching | Supabase | Yes | Yes |
| Messages, applications, saved jobs, notifications | Core features | Supabase | Per feature | Yes (messages are removed for both sides) |
| Push token (a device identifier) | Notifications | Supabase, Expo's push service, Google (FCM) and Apple (APNs) | Yes (permission prompt) | Yes |
| Diagnostics, crash reports, analytics | None planned | None | | Adding any such tool means updating the forms first |

No ads, no tracking across other apps, no precise location, no contacts access.

### 10.3 Order of work (adjusted)

1. **Now, in parallel with the web phase:** create the Google Play, Apple Developer and Expo accounts (identity checks and enrollment can take days). The Google Play **account type is decided before Phase B starts (before step 24)**. The bundle id `com.healthhyr.app` is confirmed before step 24, because it cannot change after publishing.
2. **Before step 22:** the owner supplies the final Privacy Policy and Terms text. Step 22 publishes them (draft until then).
3. **Steps 24 to 29:** build the app with the store rules in mind. Step 29 adds report and block.
4. **Tester recruitment, if the Google account is personal.** Owner decision: start recruiting the 12 testers two weeks before the planned launch. Planning note: the 14-day clock only starts when 12 testers are opted in to a closed test that has a build, and Google then reviews the production access request, so two weeks is the minimum and leaves no slack. If any tester drops out the clock can restart. The plan therefore sets the app's launch date no earlier than about four weeks after the first closed-test build (step 28), and asks for 15 to 20 testers.
5. **Step 31:** account deletion in the app, plus the `/delete-account` web page.
6. **Reviewer content.** Reviewers need real listings. **Real listings only, posted through the normal $2.50 flow, plus a reviewer test account. No sample data.** If the owner has no real openings by submission time, stop and ask before submitting.
7. **Step 32, Android:** EAS build, internal testing, closed testing, production access request, store listing, Data safety form, reviewer notes with test accounts, release.
8. **Step 32, iPhone:** Apple Developer enrollment complete, EAS iOS build, TestFlight, App Privacy labels, review notes, App Store review (it can be rejected once or twice), release.
9. **After release:** a version gate (`/api/v1/public/app-config`) so an unsafe old version can be told to update.

## 11. Build steps (one commit each, tests passing first) (adjusted)

Steps 0 to 9 are done. The rest is reordered into three phases: the web employer flow and public SEO pages first, then the seeker app, then the Pro directory search. Seeker features on the web (minimal) are in phase A2 because employers need applicants to manage and the public pages need an Apply button. **Step 10b (security headers and a Content-Security-Policy) is its own commit and lands before the first public route in step 11.** It keeps the number 10b so steps 11 to 36 keep theirs.

| # | Commit | Tests | Status |
|---|---|---|---|
| 0 | Save this plan to docs/PLAN.md | none (docs only) | done |
| 1 | Monorepo scaffold, `.gitignore` with `.env` verified ignored | Smoke test; repo hygiene | done |
| 2 | `shared`: tokens, constants, enums, zod schemas, `copy.ts`, legal stubs, COLORS.md | Token and contrast tests, constants, exact copy | done |
| 3 | Next.js app, Tailwind from tokens, `next/font`, style guard | Style guard, theme and font tests | done |
| 4 | Web base components, part 1 | Component tests | done |
| 5 | Web base components, part 2 | Component tests | done |
| 6 | Migration `0001_schema.sql`, local Supabase, RLS test suite, mutation runner | 158 RLS tests against real Supabase; 16 mutations proven caught | done |
| 7 | API skeleton: env validation, JWT auth, `requireRole`, errors, rate limit, helmet, CORS, reserved webhook route, client design rule | 113 API tests (supertest, boot, scanner) and 9 against real Supabase tokens | done |
| **Phase A1: web, employer flow, public SEO pages, payments** | | | |
| 8 | **Move the API to `/api/v1` and update commit 7's tests**, add the per-user rate limit. Web auth: sign in and up (employer and seeker), emailed codes, password reset, role routing from the API, protected layouts. | Every existing API test passes on the new paths; `/api/me` is 404; the webhook path is unchanged; role comes from the profile, never the client; each web flow, role routing and the signed-out view; 12 web flows against real Supabase Auth, mail catcher and the real API app | done |
| 9 | Local Supabase Data API on (PostgREST, `schemas = ["public"]`). The anon client. Employer company profile (`GET`, `PUT /api/v1/employer/company`, `/company` form) and the public company route and page (`GET /api/v1/public/companies/:slug` returning only the eight-field allowlist, `/companies/[slug]`, `noindex` until step 12). Section 6.3 | 404 until renamed from the default, slug stable after later renames; an employer edits only their own profile (RLS plus an ownership check in code, also proved with RLS switched off) and a stranger, another employer, a seeker and anon are refused; `is_listed`, `slug`, `id` and the logo never accepted; a test fails if any field outside the allowlist appears; **RLS applied to a per-request client with the user's token, against the real Data API (22 tests)**; component tests for the form and the public page | done |
| 10 | Jobs: draft CRUD, employer dashboard, close and reopen. Decide with the owner whether the database CHECK constraints (section 5.3) land here | Reopen rules, employers cannot set status or dates | |
| **10b** | **Security headers and a nonce-based Content-Security-Policy for the web app**, as its own commit before the first public job route: HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`, and a per-request nonce. Includes measuring the effect of per-request nonces on the cacheability of public pages and choosing the approach (`docs/SECURITY.md`). CI workflow, `npm audit` and Dependabot are proposed here, with the owner's approval first | Headers present on pages and error pages; nonce changes per request and is on every script; no `unsafe-inline` or `unsafe-eval` in production; source rule against `dangerouslySetInnerHTML` and `innerHTML`; sign-in still works under the policy (real browser check in report-only first) | |
| 11 | `0002_job_search`; public jobs API; search and detail pages (list left, detail right) | Expired, unpublished and unlisted jobs never returned; search and filter correctness | |
| 12 | SEO: JSON-LD, canonical, sitemap, robots, Open Graph and Twitter cards (section 8.2) | JSON-LD fields, expired noindex, metadata tests | |
| 13 | Checkout endpoint with `start_checkout` precheck (Stripe SDK) | Unlisted employer refused, missing fields listed, wrong status refused, one open payment per job, server price | |
| 14 | Cancel checkout, edit lock while `pending_payment`, session expiry handling | Cancel returns the job to draft, edits blocked while pending and allowed after cancel, cancel refused when paid | |
| 15 | Stripe webhook handler, `publish_job`, expiry job, page revalidation | Webhook tests (section 12) | |
| 16 | Email service (Zoho SMTP) and alert retry job | Stub transport, header sanitizing, retry of unsent alerts | |
| 17 | Permanent-failure path, reconcile job, live-key gate (legal drafts) | `needs_review` and refund path, retry cap, gate tests | |
| **Phase A2: applicants, seekers on the web, public pages, admin** | | | |
| 18 | Seeker API: profile, private details, experience, certifications, languages, visibility switch, resume upload (turns on local Storage) | Default off, opt-in stamp, owner-only contact details, upload type (by content) and size limits, server-side renaming, stranger refused | |
| 19 | Applications API (apply with Easy Apply, my applications, withdraw) and employer applicant review (five statuses, resume link) | One application per job, no applying to expired jobs, withdrawal clears data and deletes the stored resume, status rules | |
| 20 | Seekers on the web, minimal: sign in, profile editor, Apply on job pages, My applications | Component tests, accessibility, employer redirected from seeker pages | |
| 21 | Messages and notifications (API, employer web UI) | `can_message` rules, read-once | |
| 22 | Pages: Home, For Employers, About, Contact (API route, `contact_messages`, support email), Terms and Privacy (final text supplied by the owner before this step), /pricing (Pro "Coming soon"), `/delete-account` page, `/.well-known/security.txt` | No sample listings, empty states, rate limit and honeypot, prices from constants, no checkout control on Pro, disclaimer, legal documents marked final | |
| 23 | Admin: moderation, contact inbox, `needs_review` payments with retry and refund; two-factor required for admins | Every action writes an audit row, non-admins blocked, admin area refuses a session without the second factor | |
| **Phase B: seeker mobile app** | | | |
| 24 | Expo app scaffold: Metro with the workspace, `native.ts` theme, fonts, native base components, Jest, style guard, `app-config` route, `docs/DEVICE-CHECKLIST.md`. Needs the Play account type and the bundle id confirmed first | Component tests, theme parity, source guard, accessibility rules | |
| 25 | Mobile auth: sign in and up with emailed code, chunked secure storage, refresh, role gate, employer message | Storage adapter, role gate, refresh and retry, no token in logs | |
| 26 | Mobile jobs: search, filters, detail, saved jobs (API `saved-jobs`) | Screen states, API mapping, accessibility | |
| 27 | Mobile profile, visibility switch (approved copy word for word), resume upload (document picker) | Form validation from shared schemas, upload errors, copy parity | |
| 28 | Mobile apply (Easy Apply), applications list, withdraw. First installable Android build on EAS | Flow tests; real-phone checklist pass 1 | |
| 29 | Mobile messages and notifications; report and block (`0004_report_and_block`) | Block stops messaging in both directions (RLS and mutation tests), report stored | |
| 30 | Push notifications: `0003_push_tokens`, token API, Expo push sender with receipts, development build | Token RLS, pruning, send on new message and status change, opt-out | |
| 31 | Account deletion: API and in-app flow with password check, cascade and storage cleanup tests, web page wired | Everything of the user is gone, employer accounts refused, audit row without personal data | |
| 32 | Store release: EAS production config, Android internal then closed then production (iPhone after: TestFlight then App Store), listings, data forms, reviewer accounts | Full checklist, store pre-launch report, TestFlight pass | |
| **Phase C: Hiring Pro** | | | |
| 33 | Hiring Pro guard and launch notification tool (in-app and push to opted-in seekers) | No subscribe route before launch, announce idempotent and opted-in only | |
| 34 | Hiring Pro billing: Stripe subscription, webhook events, 30-postings-per-period allowance enforced on the server, `subscriptions` writes | Allowance limits enforced server-side, lapse handling, webhook idempotency | |
| 35 | Directory search for employers (web): filters, column allowlist, `invitations` (invite to apply), invitation shown to seekers on web and app | No contact fields ever returned, only opted-in seekers of Pro employers, RLS and mutation tests | |
| 36 | Hardening: accessibility on web and mobile, banned-phrase scan across web, app and store copy, performance and Core Web Vitals, the OWASP Top 10 review written into `docs/SECURITY.md` | Full suite | |

Old to new step numbers: old 9 split into new 9 (Data API, company page) and 18 (seeker profile); old 10 to 14 became 9 to 12 and 13; old 15 to 18 became 14 to 17; old 19 and 20 became 19; old 21 is 21; old 22 to 25 became 22; old 26 is 33; old 27 is 23; old 28 is 36. Step 10b was added on 2026-10-16.

Storage (resume uploads) is turned off in `supabase/config.toml` and gets turned on in step 18. The Data API (PostgREST) has been on since step 9.

### 11.1 Launch sequence (recommended)

Three launches, each independent of the next, so **no phase blocks the first launch**.

| Launch | When | What goes live | What it needs |
|---|---|---|---|
| **1. Website** | After Phase A1 and A2 (steps 8 to 23, including 10b) | Employers post and pay and manage applicants on the web. Seekers browse, apply and manage their applications on the web. Public SEO pages. Admin. | Final Privacy Policy and Terms live (step 22), which also lifts the live Stripe block (step 17); production hosting with the API always on; a production Supabase project with backups; production environment values and the CORS list; email alerts working; domain and https; error monitoring and an alert when the webhook fails; **every box in the pre-launch checklist in `docs/SECURITY.md` ticked, including the OWASP review**; the SEO checklist in section 8.2 done. The first live check is the owner posting one real job for $2.50 and confirming it publishes. |
| **2. Mobile app** | After Phase B (steps 24 to 32), Android first, then iPhone | The seeker app in the stores. Store links then appear on the web pages. | Everything the stores need (section 10), a finished closed-test period if the Google account is personal, account deletion, reviewer accounts and real listings. |
| **3. Hiring Pro** | After Phase C (steps 33 to 36) | Billing, the opt-in directory search for employers, invitations, and the launch notification to opted-in seekers. | A meaningful number of opted-in seekers (the directory is only as useful as the seekers who opt in), plus the web and the app both live. |

Rules that keep it that way:
- Launch 1 contains no store badge or "get the app" claim, and the visibility switch keeps its honest copy ("Hiring Pro is not live yet").
- Phase B and C work never changes what Launch 1 needs. Shared API additions (such as the version prefix, saved jobs, push tokens, report and block) ship only in their own steps and are backward compatible.
- Work on the closed-test requirement and store accounts runs alongside Phase A, so it does not delay Launch 2 more than the 14-day test itself.
- A launch is decided by its checklist, not by the calendar: if an item is missing, that launch waits and the others do not.

## 12. Tests

`npm test` runs everything: **986 tests** after step 9 (483 in the `node` project, 301 website component tests in jsdom, 158 RLS, 44 against real Supabase). `npm run test:fast` runs the `node` and `web-components` projects only (784 tests) and needs no Docker. Counts per suite are in `npx vitest list`. `docs/SECURITY.md` section 5 lists the security tests each later step must add.

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

`npm run test:rls:mutation` weakens one policy, guard, grant or function at a time (inside each test's own transaction, so nothing real changes) and checks that the right tests fail. 16 weakenings are caught. Two more confirm defense in depth: widening a column privilege alone is not noticed because a trigger still blocks the write, and removing both is. New migrations (0002 to 0004) add their own RLS tests and mutation entries.

### API tests (steps 7 to 9): 201 unit and process tests, plus 44 against real Supabase

All run on `/api/v1/...` paths. The Stripe webhook keeps `/api/webhooks/stripe`. The unit tests use a stand-in database (`tests/helpers/harness.ts`) that answers the way row-level security would, returns whole rows on purpose (so a route that forgets to pick fields is caught), and records every query.

| Suite | Tests | Covers |
|---|---|---|
| `env` | 13 | Valid config and defaults; every missing or malformed variable named; live Stripe key refused outside production; production rules; no value is ever printed |
| `auth` | 32 | 401 for no token, malformed headers, garbage, expired, wrong key (with and without the right key id), unknown key id, altered payload, wrong audience or issuer, no expiry, not-yet-valid, `alg: none`, HMAC with the public key, anon and service-role tokens, anonymous users, bad subject; role from the database and never from the token, header, query or body; re-read on every request; no profile is 403; database errors; the per-request client gets the caller's token only after verification |
| `roles` | 8 | `requireRole`: allowed and refused roles, 401 without a token, fails closed if mounted without authentication |
| `errors` | 16 | Generic 500 with no message, stack, SQL or path (sync, async, non-Error, database-style fields); full error only in the server log with the request id and never the token; same in every `NODE_ENV`; validation, bad JSON, too large, 404 are friendly and do not echo input; request ids |
| `security` | 18 | helmet headers; CORS allowlist (allowed, refused, preflight, no wildcard, no Origin); per-IP rate limit 429 with Retry-After, counts failures, health not throttled; per-user limit: 429 for one signed-in user, a separate counter for every person even from one IP, not used up by requests that fail authentication, separate from the per-IP limit |
| `webhook` | 13 | Raw body byte for byte (including non-ASCII), parsed everywhere else, no sign-in, not throttled, no origin check, POST only, 1 MB limit, reserved 501 handler, path unchanged by versioning |
| `versioning` | 7 | The prefix is `/api/v1`; `/api/me` and the other old `/api/...` paths answer 404 with and without a token; no other versions exist; health and the webhook are unversioned |
| `company` | 74 | **Employer routes:** no token 401, seeker and admin 403 with no data touched; reads own company only, never the id; named columns only; 404 without a row; generic 500; saves the seven fields; only those seven columns reach the database, filtered to the caller's id; rename lists the page and keeps the slug; empty boxes become null; omitted fields are cleared; every validation case refused with a friendly message and nothing saved; every size accepted; `is_listed`, `isListed`, `slug`, `id`, `employer_id`, the logo, `role` and unknown fields refused. **Stranger refused:** employer B never changes A (body, URL or query naming A's id), every query filtered to the caller's own id, and the same with RLS switched off. **Public route:** no sign-in needed (a bad token is ignored), exact eight-field allowlist, a test that fails on any other field including columns added later, named columns only, a website that is not http or https is dropped, 404 for the default name, for a company renamed back, and when RLS is off (identical answer to a missing company), slug stable after renames, malformed addresses are a 404 without a database call, only GET, unknown `/public` paths are 404 not 401, per-IP limit applies |
| `service-role-scan` | 17 | The scanner catches each kind of violation, accepts only an allow comment with a reason, and the real source (including `routes/v1/`) is clean |
| `boot` | 3 | The real server process exits with code 1 on missing or live-key config without printing a value, and starts with valid config, serves `/health`, answers 401 on `/api/v1/me` and 404 on the old `/api/me` |
| `integration/real-supabase-token` (real Supabase) | 10 | A token issued by real GoTrue (after the emailed-code confirmation) is signed ES256 with the expected issuer and audience; our verifier accepts it, refuses altered signature and payload, the wrong issuer or audience, and the project's own anon key; signup with `role: admin` in its metadata still creates a `seeker`; `/api/v1/me` returns the database role; `/api/me` is 404 |
| `integration/web-auth` (real Supabase) | 12 | The website's real auth code, against real GoTrue, the local mail catcher, the real Data API and the real API app: signed-out start; employer and seeker sign-up with the emailed code and the API's role; wrong code refused; admin requested straight to Supabase still yields `seeker`; sign-in, wrong password, unknown address, sign-out; password reset with the emailed code |
| `integration/data-api` (real Supabase) | 22 | **Row-level security through the real Data API** with real tokens: anon cannot read profiles; a user sees only their own profile; another user's profile or company by id returns nothing; a default-named company is visible only to its owner; direct PATCH of another user's company changes nothing; `is_listed`, `slug`, `id` and `role` cannot be set; the `private` schema is not reachable; a forged token gets 401. **Through the API:** `/me` as the caller; employer routes refuse no token, a seeker and a forged token; B saves without touching A; fields the server decides are refused; the public page is a 404 for a default-named or missing company (identical answer), shows exactly the eight allowed fields, the slug survives renames, hiding and showing again work, a `javascript:` website written straight to the Data API never reaches the page; anon reads only listed companies and cannot write |

### Website tests (steps 8 and 9): 301 component tests, plus the shared schemas

| Suite | Tests | Covers |
|---|---|---|
| `lib/auth-service` | 45 | The state machine: loading, signed out, signed in, no profile, error; role only from the API whatever the token says; refresh once on 401; friendly error mapping (no raw provider text); form validation before anything is sent; sign-up refuses admin and any other role; session changes from another tab |
| `lib/auth-helpers` | 40 | Role homes, `next` path safety (open redirects, backslashes, control characters, protocol-relative), error mapping table |
| `lib/api-client` | 25 | `/api/v1` prefix, bearer token, no cookies, no token means no request, response validated, network and server errors mapped, error issues kept and capped; the company profile read and save (PUT with a JSON body); the public client sends no token, drops fields outside the allowlist, treats 404 as "no such page" but other failures as errors, never asks for a malformed slug |
| `lib/public-env` | 8 | Missing or malformed variables named; refuses a secret or service-role key |
| `components/auth-guards` | 26 | `RequireRole` and `RedirectIfSignedIn`: nothing protected renders while loading or on the server, redirect for signed-out visitors with a safe `next`, each role sent to its own home, no profile and error screens, retry |
| `components/sign-in` | 21 | Labels, required fields, autocomplete, empty and malformed input, busy state (disabled, `aria-busy`, announced spinner), no double submit, one friendly error for wrong credentials, friendly rate-limit and network messages, password never in text, role routing per role and `next`, unconfirmed account goes to the code step |
| `components/sign-up` | 22 | Only seeker and employer offered and never "admin", `?role=` preselect, tampered radio value still sends a valid role, empty form errors, busy state, neutral "could not create" message, code step (format, wrong code, resend wait, role from the API wins), session-at-once path |
| `components/forgot-password` | 14 | Request code with one message for every address, rate limit, code and new password step, wrong code leaves the password alone, success routes by API role, change failure signs out, resend wait, password never in text |
| `components/protected-pages` | 11 | The employer, seeker and admin pages: a signed-out visitor sees only a spinner and is sent to sign-in; the right role sees the page; the other roles see nothing and are sent to their own home; signing out from a protected page; all account and auth pages carry `noindex` |
| `components/company-form` | 25 | Loading spinner, saved values shown, link to the public page, load error with Try again, 404 message; labelled fields and the size list, no logo or listing field; validation (name, https website, description length) with focus and nothing sent; saving sends only the editable fields with empty boxes as null; busy state and no double submit; public and hidden notices; server field errors; friendly network and server messages that never show the server's words; the page in the employer area: signed-out visitor, seeker and admin kept out and the API never asked; dashboard link |
| `components/public-company` | 26 | What the public page shows (name as heading, location, industry, size, description, safe external link), nothing invented when fields are empty, hostile text shown as plain text, no logo shown, no controls; `safeWebsite` accepts only http and https; the route: shows the company, 404 for no public page, an API failure is an error and not a 404, metadata is `noindex` |
| `auth-source-rules` | 12 | No `app_metadata`, `user_metadata`, token decoding, browser storage or cookies for roles; the role read from the URL only preselects the sign-up radio; only `backend.ts` calls Supabase Auth; only `public-env.ts` reads `process.env`; only the API client calls `fetch`; no `console`; no server secret names; only three public variables |
| `packages/shared` `auth-schemas` | 13 | The shared zod schemas: roles (no admin), trimming and lower-casing, password and code limits, `/me` response shape |
| `packages/shared` `company-schemas` | 47 | The public allowlist is exactly eight fields and never the id or listing flag; the public schema strips anything else; the employer's own view adds only the listing flag and address; input normalization, required name, website schemes, sizes, limits, and every server-decided field refused; slug pattern |

### Mobile tests (steps 24 to 31, adjusted)

Section 7.5 describes them: Jest with `jest-expo`, Testing Library, the source guard, theme parity, accessibility rules for roles, labels, states, touch size and font scaling, logic tests for storage, role gate and refresh, and screen tests with a mocked API. The list of what only a real phone can verify is in 7.5.

### Webhook handler tests (steps 15 and 17)
- Bad signature returns 400. Success returns 200 and sets `processed_at`.
- A handler that throws returns 500, stores the error and leaves `processed_at` null. The retry returns 200.
- A duplicate of a finished event returns 200 with no second publish. An unhandled type returns 200 and is recorded as ignored.
- A permanent publish failure leads to `needs_review`, an admin notification, an audit row, an employer notification, an alert email attempt and a refund call. The response is 200 only after those writes. If the `needs_review` write fails, the response is 500. If the refund call fails transiently, the response is 500 and the retry resumes at the refund.
- The fifth transient failure escalates to the permanent path. The reconcile job picks up a stuck payment.
- A live key is refused while a legal document is draft, and outside production.

### Checkout tests (steps 13 and 14)
- An unlisted employer cannot start Checkout. Checkout is refused when fields are missing (the response lists them) or the job is not `draft` or `pending_payment`.
- Cancel checkout returns the job to `draft` and the payment to `canceled`; it is refused when the payment has succeeded.

## 13. Environment, secrets and the local database

- `.gitignore` ignores `.env`, `.env.*` (except `.env.example`), `node_modules`, build output and coverage.
- Only `.env.example` files are committed, with placeholder values.
- Local Supabase keys (printed by `npm run db:status`) go only in git-ignored `.env` files. A hygiene test fails if a key-like string is committed.
- Root `.env` (tests only): `RLS_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- `apps/api/.env` (see `apps/api/.env.example`), server-only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `STRIPE_SECRET_KEY` (test keys while building), `STRIPE_WEBHOOK_SECRET`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_*`, `USER_RATE_LIMIT_*`, `PORT`. Later: `SMTP_*`, `ALERT_FROM`, `ALERT_TO`, `HIRING_PRO_ENABLED`.
- Web (`apps/web/.env.local`, see `apps/web/.env.example`): `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable key, never a secret key), later `NEXT_PUBLIC_SITE_URL`. No Stripe keys, no service-role key. The site refuses to start with a secret or service-role key.
- **Mobile (adjusted):** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Every `EXPO_PUBLIC_` value is compiled into the app and readable by anyone, so only public values go there. A hygiene test fails if the app source mentions a server-only secret name.
- A hygiene test fails if a `.env` file is tracked, if a secret-looking string is committed, or if web or mobile code references the service-role or Stripe secret key names.

### Local Supabase

- Requires Docker. The Supabase CLI is a dev dependency (`npx supabase`), not a global install.
- `npm run db:start` starts the database, auth, the Data API and the mail catcher (about 2 GB of Docker images the first time). `npm run db:reset` re-applies migrations. `npm run db:stop` stops it. `npm run db:status` prints the URLs and keys. Note that `supabase start` itself prints the local keys when it finishes; they are the standard local-only demo keys, but do not paste that output anywhere public.
- **Data API (step 9, approved by the owner).** `supabase/config.toml` turns on PostgREST (`[api] enabled = true`, `schemas = ["public"]`, `max_rows = 1000`). Only the HealthHyr API calls it, always with the caller's own token (or the anon key for public reads); the browser never does. The private schema is not exposed.
- **Email locally (step 8, approved by the owner).** `supabase/config.toml` turns on the local mail catcher (Mailpit, SMTP on 54324, web inbox at `http://127.0.0.1:54324`), requires email confirmation, and uses 6-digit codes valid for 15 minutes, with code-style templates in `supabase/templates/`. This matches what production must do. Tests read the emailed codes from the catcher's API (`tests/support/mailpit.ts`), so no real email is ever sent locally. Storage stays off until step 18.
- `npm test` runs everything, including the RLS and integration suites, and fails with instructions if the database or the mail catcher is not running. `npm run test:fast` skips them.
- Supabase Auth limits sign-in and sign-up to about 30 per 5 minutes per IP. Running the integration suites many times in a row can hit that and fail with a rate-limit message; wait a few minutes.
- Ports 54321 to 54329, so it does not clash with other local Postgres, Redis or MinIO containers.

### Running the API and the website locally (to try sign-up yourself)

Since step 9 this works end to end: sign up, confirm the emailed code, land on your home page, and (as an employer) edit your company profile and open its public page.

1. Start Docker Desktop, then `npm run db:start`.
2. The two git-ignored env files were created from the local Supabase in step 9 (no key was displayed or committed): `apps/api/.env` and `apps/web/.env.local`. The two Stripe values in `apps/api/.env` are clearly named placeholders: the word "devplaceholderuntilstep15" after the usual Stripe test prefixes. They only need to look like Stripe test values for the API to boot. Replace them with real Stripe **test** keys at step 15. If either file is missing, recreate it from `npm run db:status` using the variable names in section 13 (the web file holds the publishable key only).
3. In one terminal: `npm run dev -w @healthhyr/api` (port 4000). In another: `npm run dev -w @healthhyr/web` (port 3000).
4. Open `http://localhost:3000/sign-up`, create an account, then read the 6-digit code in the mail catcher at `http://127.0.0.1:54324` and enter it.
5. Use `http://localhost:3000` consistently (not a mix of `localhost` and `127.0.0.1`), so the browser origin matches the CORS list.
6. As an employer, open `http://localhost:3000/dashboard`, then "Edit company profile". After renaming the company from "My company", the form shows a link to the public page at `/companies/<address>`.

Other notes:

- `npm run start -w @healthhyr/api` runs the API without watch mode.
- The server logs one JSON line per event. `PORT=0` picks a free port (not allowed in production).

## 14. What this plan will install (step 9 added one Docker image and no packages)

Step 8 added `@supabase/supabase-js` to `apps/web` (the website's sign-in client, approved before install). Step 9 pulled one Docker image (PostgREST v16.4: 6.5 MB compressed, 27.1 MB on disk) and installed no npm package. Nothing else was installed.

Sizes are npm's unpacked size for the package itself. Each package also brings dependencies, and the React Native tree in particular adds a few hundred megabytes to `node_modules`. Each install gets its own approval request at the step where it is needed.

| Step | Package | Size | Why |
|---|---|---|---|
| 9 (done) | Docker image: PostgREST (the Data API), no npm package | 6.5 MB compressed, 27.1 MB on disk | RLS through the per-request client, end to end |
| 10b | Possibly CI, `npm audit` and Dependabot configuration (repository files and GitHub settings, no npm package) | none | Supply-chain checks. Owner approves before they are added |
| 13, 15 | `stripe` 23.0.0 | 16.5 MB | Checkout sessions, webhook signature check, refunds (API) |
| 16 | `nodemailer` 10.1.2, `@types/nodemailer` | 1.6 MB, 0.1 MB | Zoho SMTP alerts (API) |
| 18 | Docker image: Supabase Storage | about 240 MB compressed | Resume uploads locally |
| 24 | `expo` 58.0.12 | 1.7 MB | The app framework |
| 24 | `react-native` 0.88.0 | 20.2 MB | The runtime |
| 24 | `expo-router` | 3.7 MB | Navigation |
| 24 | `expo-font`, `@expo-google-fonts/manrope`, `@expo-google-fonts/dm-sans` | 2.7, 1.3, 2.9 MB | Manrope and DM Sans (only the needed weights are used) |
| 24 | `react-native-screens`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context` | 3.5, 3.1, 4.8, 0.2 MB | Required by the router and for smooth screens |
| 24 | `react-native-svg` | 3.7 MB | The app's icons (same drawings as the web icons) |
| 24 | `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar` | each 0.3 MB or less | App basics |
| 24 | `expo-secure-store` | 0.2 MB | Token storage (Keychain and Keystore) |
| 24 | Test tools: `jest`, `jest-expo`, `@testing-library/react-native`, `react-test-renderer` | under 3 MB for these four, plus Jest's own dependencies | Mobile component tests |
| 24 | `eas-cli` 25.0.0 (as a dev dependency, used with `npx`) | 5.6 MB | EAS builds and submissions |
| 26 | `@tanstack/react-query` | 1.7 MB | Caching server data in the app (optional) |
| 27 | `expo-document-picker` | 0.1 MB | Choosing a resume file |
| 30 | `expo-notifications`, `expo-device`, `expo-dev-client` | 1.5, 0.2, 0.1 MB | Push notifications and development builds |
| 30 | `expo-server-sdk` | under 0.1 MB | The API sending pushes through Expo |
| 31 | none | | Account deletion uses existing packages |

Also to be decided with the owner before launch 1, each needing approval first because they add a tool or a service: an error-monitoring service (`docs/SECURITY.md`), a Lighthouse or equivalent performance check (section 8.2), and an uptime check.

**Direct packages for the app total about 53 MB unpacked, before their own dependencies.**

**Deliberately not installed:**
- `@react-native-async-storage/async-storage` (49.5 MB unpacked) and `aes-js`, which Supabase's guide uses for session storage. The chunked SecureStore adapter replaces them (section 7.3).
- NativeWind (section 4.1).
- `react-native-web` (2.8 MB), because Vitest cannot run React Native components faithfully; Jest with `jest-expo` is used instead.
- The Android SDK and an emulator (roughly 6 to 10 GB). Testing uses a real Android phone with Expo Go first and then EAS development builds. Nothing from Android Studio is needed on this PC. Java 17 is already present.

**Accounts and things outside this PC:** an Expo account (free), the Expo Go app on your Android phone (from the Play Store), a Google Play developer account ($25), an Apple Developer account ($99 per year) later. EAS's free plan lists 15 Android and 15 iOS builds per month in a low-priority queue (verify at signup).

## 15. Decisions and open items

Approved earlier:

1. A permanent publish failure ends in 200 only after `needs_review` and the alert are durably written.
2. Reopen follows the rules in section 1.
3. Job thresholds (title at least 5 characters, description at least 50) are placeholders in `constants.ts`.
4. Hiring Pro benefit list as in section 9.
5. The Hiring Pro launch notification is in-app, plus push once push exists.

Decided by the owner for the mobile adjustment:

6. Seekers can use the website minimally (sign in, profile, Easy Apply, My applications).
7. Android first, tested on a real Android phone; iPhone later through EAS cloud builds.
8. React Native styling with `StyleSheet` and a theme derived from the tokens, no NativeWind (section 4.1).
9. Chunked `expo-secure-store` for the session instead of Supabase's AsyncStorage approach (section 7.3).
10. Emailed 6-digit codes for sign-up confirmation and password reset on mobile, no deep links in version 1.
11. The mobile app talks only to the Express API; `supabase-js` is used for authentication only.
12. API routes move to `/api/v1` in step 8, before any client ships, and commit 7's tests are updated in that step. The Stripe webhook path does not change. **Done in step 8.**
13. Push notifications are part of version 1 of the app (step 30).
14. Report and block for messages (`0004_report_and_block`) because user-generated content is likely required by the stores (to be confirmed at step 29).
15. Employer account deletion is handled through support for now.
16. Bundle id `com.healthhyr.app`, to be confirmed before step 24.
17. Reviewer content is real listings only, posted through the normal $2.50 flow, plus a reviewer test account. No sample data. If the owner has no real openings by submission time, stop and ask.
18. The owner supplies the final Privacy Policy and Terms text before step 22. Live Stripe stays blocked until then.
19. Launch sequence: website first (after Phase A1 and A2), then the app, then Hiring Pro (section 11.1).

Decided in step 8:

20. Local email uses the Supabase mail catcher with 6-digit codes and email confirmation ON, matching production. Tests read the codes from the catcher (section 13).
21. The website holds the publishable key only, and the role always comes from `GET /api/v1/me` (section 6.2).
22. `GET /api/v1/me` keeps returning `403 no_profile` for an account without a profile.

Decided after step 8 (owner, 2026-10-16):

23. **Security headers and a nonce-based Content-Security-Policy move to step 10b**, their own commit before the first public route, because the session is in local storage (section 6.2, section 11).
24. The anon client lands in step 9 with the public company route (it was planned for step 11). Step 9 also adds the end-to-end test that a per-request client with the user's token has RLS applied through the real Data API.
25. `docs/SECURITY.md` (threat model and pre-launch checklist, with which items are covered by tests and which need new ones), `docs/ARCHITECTURE.md`, and the SEO checklist in section 8.2 are part of the plan. Launch 1 needs every box in the security checklist ticked.

Decided for step 9 (owner, 2026-10-16):

26. The local Data API (PostgREST image) is on, with the `public` schema only. The two local env files are written from the local Supabase without displaying keys, and the Stripe values are clearly named placeholders until step 15.
27. **The public company route returns only an explicit allowlist** (company name, description, website, logo, industry, size, city, state), never the id, and a test fails if any other field appears (section 6.3).
28. The logo is not editable by employers until uploads exist (step 18); the public page does not show a logo yet.

Still open:

- **Google Play account type (personal or organization).** To be decided before Phase B (before step 24). If personal, start recruiting the 12 testers two weeks before the planned launch (owner decision). Planning note: that is the minimum, because the 14-day clock needs a closed-test build and 12 opted-in testers, and Google then reviews the production access request, so the plan keeps the app launch about four weeks after the first closed-test build and aims for 15 to 20 testers (section 10.3).
- **Apple account type** (individual or organization), which affects how the developer name appears in the store.
- **Per-request nonce versus cacheable public pages** (step 10b): decided with measurements at that step (`docs/SECURITY.md`).
- **CI, error monitoring, uptime check and a performance tool:** each adds a tool or service, so each needs the owner's approval before it is added (section 14).
- **Database CHECK constraints for rules the API enforces but a direct Data API write can bypass** (website must be http or https, text lengths, company size list) (section 5.3). Which step adds them is the owner's call; step 10 is recommended.
