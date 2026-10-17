# HealthHyr v2 architecture

Short and accurate to the repository as of step 10. It describes what exists; parts that are planned are marked **(planned, step N)**. The product decisions, the database design and the step list are in `docs/PLAN.md`. The rules that never bend are in `CLAUDE.md`. Security rules and the launch checklist are in `docs/SECURITY.md`.

## 1. Folder responsibilities

```
packages/shared/   Code used by more than one app. TypeScript source, no build step.
  src/tokens.ts      The only place colors, fonts, spacing and radii are defined (the only file with hex values).
  src/constants.ts   Prices, 30 days, limits, default company name, contact email.
  src/enums.ts       Roles, statuses and other enums, kept in sync with the SQL by tests.
  src/labels.ts      The words people see for those enum values (one place for the website and the app).
  src/copy.ts        Approved wording that must not drift.
  src/contrast.ts    Contrast math used by tests.
  src/schemas/       zod schemas (auth, company, job, text rules; more per step). The same rules run in the browser, the API and,
                     later, the app. Their limits mirror the database CHECK constraints (see rule 8).
  src/legal/         Terms and Privacy text (draft until the owner supplies it). Node only.

apps/web/          The website (Next.js App Router, Tailwind from the tokens).
  src/app/           Routes only: layouts, pages, metadata. Route groups: (auth), (employer), (seeker), (admin), (public).
                     Employer pages: /dashboard, /dashboard/jobs/new, /dashboard/jobs/[id], /company. (/jobs is kept for the public job pages.)
  src/components/ui/ Base components. No business logic, no data fetching.
  src/components/auth, account, company, jobs/   Feature components: sign-in, the signed-in frame, the company form and page, the dashboard, job form and job editor.
  src/proxy.ts                    Runs before every page: makes the nonce and sets the Content-Security-Policy (Next.js 16's name for middleware).
  src/lib/security/               csp.ts (builds the policy), headers.ts (the six headers that are the same on every response; next.config.ts applies them).
  src/lib/public-env.ts           The only file that reads the environment (public values only).
  src/lib/api/client.ts           The only file that calls fetch. The signed-in client (sends the person's token) and the public client (sends none).
  src/lib/api/public.ts           Server-side calls for public pages; builds the public client from the environment.
  src/lib/auth/                   Sign-in logic: backend.ts (the only file that imports supabase-js), service.ts (state machine),
                                  guards, redirects, error messages, provider (also hands the API client to forms).
  src/lib/format.ts               Date and list formatting (dates in UTC).

apps/api/          The Express API. The only place business rules and Stripe live.
  src/env.ts         The only place process.env and secrets are read; validated at boot.
  src/app.ts         createApp(): middleware order. Receives everything it needs as options (no secrets read here).
  src/server.ts      Entry point: load config, build clients, listen. The only place the service-role client is created.
  src/auth/          Token verification (JWKS, ES256 and RS256 only).
  src/middleware/    Request id, authenticate (role from the database), requireRole, per-IP and per-user limits, CORS, error handler.
  src/lib/           userClient.ts (per request, as the user), anonClient.ts (public reads, as anon), serviceClient.ts (bypasses RLS).
  src/routes/        paths.ts (API_V1, webhook path), health, stripeWebhook (reserved), v1/: me.ts, employer.ts (company), jobs.ts (signed in),
                     public.ts (no sign-in).
  src/services/      Server-only operations; the only code that works with the service client. jobTransitions.ts: close, reopen, cancel checkout,
                     with ownership checked in code. (More per step: stripe, mailer, push...)

supabase/          Local stack and the database.
  config.toml        Local services (database, auth, the Data API with the public schema only, mail catcher; storage is turned on in step 18).
  migrations/        0001_schema.sql and 0002_text_constraints.sql; later changes are new numbered files.
  templates/         The emailed 6-digit code (confirmation, recovery).
  tests/rls/         RLS and constraint tests against the real local database; mutation.mjs proves the tests catch weakened policies and constraints.

scripts/           db-start.mjs: starts the local Supabase and hides the keys it prints.
tests/             Repository-wide tests (hygiene) and support/ (mail catcher reader used by integration tests).
docs/              PLAN.md, COLORS.md, SECURITY.md, ARCHITECTURE.md.
apps/mobile/      (planned, step 24) The seeker app, Expo and React Native.
```

Tests sit next to their app, in `apps/<app>/tests/` and `packages/shared/tests/`. Tests that need the real local Supabase live in `apps/api/tests/integration/`, with shared helpers there (`app.ts` starts the real API, `people.ts` signs up real people and calls the Data API and the API). The API's unit tests use a stand-in database (`apps/api/tests/helpers/harness.ts`) that applies row-level security and the jobs guard, returns whole rows on purpose, and records every query.

## 2. Data flow

```
 Browser (apps/web) ──sign in, sign up, codes, refresh──▶ Supabase Auth (GoTrue)          [publishable key only]
        │  ◀── session (access token) ──┘
        │
        ├── fetch /api/v1/...  Authorization: Bearer <token> ──▶ API (apps/api)
        │                                                          1. verify token against Supabase's published keys
        │                                                          2. read the role from `profiles` (per-request client, as the user)
        │                                                          3. per-user rate limit, then the route
        │                                                          4. route reads or writes through the per-request client
        │                                                             (Postgres applies RLS, column privileges, guards and CHECK constraints as that user)
        │                                                          5. only server-only operations use the service client (services/)
        │                                                       ──▶ Data API (PostgREST) ──▶ Postgres (Supabase)
        │
        └── public pages (server-rendered): the Next.js server calls /api/v1/public/... with no token
                                                               ──▶ API ──▶ anon client ──▶ Data API ──▶ Postgres (role: anon)

 Stripe ──POST /api/webhooks/stripe (raw body, signature)──▶ API ──▶ service client ──▶ Postgres        [not versioned]

 Mobile app (planned, step 24): the same path as the browser. It uses supabase-js for sign-in and refresh only, and the API for everything else.
```

What follows from this:

- **The database enforces access and shape** (privileges, RLS, guard triggers, CHECK constraints). The API adds rules the database cannot express (prices, Stripe, uploads, plan limits). The web app and the app only display; they never decide anything about access.
- **The role is read, not carried.** `GET /api/v1/me` returns `{ id, role }` from the database. The website builds its signed-in user from that answer only.
- **Browsers never talk to the database.** They talk to Supabase Auth and to the API. The Data API is for the API's own use. **But a signed-in person holding their own token can still call it directly**, skipping the API and its validation. That is why privileges, RLS, guards and CHECK constraints must hold on their own (rules 8 and 9).
- **Three Supabase clients on the server:** per-request (user token, RLS applies, the default), anon (public reads, RLS as `anon`) and service-role (server-only operations in `services/`, which check ownership in code). A scanner test enforces the service-role rule.
- **Public output is an allowlist.** A public route builds its response field by field; a test fails if any other field appears.
- **State changes the user may not make themselves** (a job's status, payment, dates) are database functions that only the service role can call. They run in `services/` with ownership checked in code first.

## 3. Naming conventions

- **Files:** React components `PascalCase.tsx`; everything else `camelCase.ts` (`public-env.ts` and similar existing kebab names stay); Next.js route files use the framework names (`page.tsx`, `layout.tsx`). Route directories are lowercase and kebab-case. Route groups are in parentheses.
- **Tests:** `*.test.ts` or `*.test.tsx`, named for what they cover (`auth-service.test.ts`, `sign-in.test.tsx`, `company.test.ts`). Test titles describe behavior in plain words.
- **Code:** `camelCase` for values and functions, `PascalCase` for types and components, `UPPER_SNAKE` for constants and environment variables. Database names are `snake_case`. JSON fields in the API are `camelCase`, mapped from the table columns by hand in each route (never passing a row through).
- **API:** paths are lowercase and plural for collections, under `/api/v1`. Routes for people who are not signed in live under `/api/v1/public`. Errors use fixed codes (`invalid_token`, `no_profile`, `job_locked`, …) with friendly fixed messages.
- **Migrations:** `NNNN_short_name.sql`, one concern each, with RLS tests and a mutation entry for anything that changes access or shape. Constraints are named `<table>_<column>_ok`.
- **Commits:** one step per commit, message says what and why, ends with the co-author line. Tests pass first; push after the commit.

## 4. Rules for adding code

1. **Plan first.** A step is in `docs/PLAN.md` and approved before code. Update the plan in the same commit as the change.
2. **Colors, fonts, spacing:** only from `packages/shared/src/tokens.ts`, through the Tailwind theme. No raw hex in components, no text under 12px, lime is a fill with ink text, olive only for large headings.
3. **Whole-file rewrites only.** Write the complete file, not patches or scripted edits.
4. **No fake data.** No sample listings, no invented counts, no "verified" or "background checked" wording, in the UI, the tests' fixtures that could reach the UI, or structured data.
5. **Secrets:** read the environment only in `apps/api/src/env.ts` / `server.ts` and `apps/web/src/lib/public-env.ts`. Never put a secret in a `NEXT_PUBLIC_` variable. Never commit a real `.env`; add new variable names to the matching `.env.example`. Never print or paste keys. Start the local database with `npm run db:start` (it hides the keys); never run `supabase start` directly in a shared terminal.
6. **API route checklist:** under `routes/v1/`; authenticated by default (public routes only in `public.ts`, with an explicit field allowlist and the anon client); `requireRole(...)` for role-specific routes; validate input with a shared strict zod schema and reject unknown fields; use `req.auth.db` (the user's client) unless the operation is server-only, in which case it lives in `services/`, is handed to the route through `createApp` options, checks ownership in code and has a "stranger is refused" test; filter by the caller's id from the verified token, never an id from the request; never accept a role, status, price, slug, listing flag or date that the server decides; return only fixed friendly errors.
7. **Plan limits and prices are enforced on the server** (and in SQL where possible), never only in the UI.
8. **Every table that a user can write through the Data API needs CHECK constraints on every text column, and a test.** "Writable through the Data API" means any table where `anon` or `authenticated` holds `insert` or `update` (check the grants in the migrations). For each such text column the migration adds, in the same commit:
   - a maximum length (and a minimum where blank is never valid for the column);
   - no control characters (`private.clean_line` for one-line text, `private.clean_text` where line breaks are allowed);
   - for a web address, `private.http_url` (must start with `http://` or `https://`, which also refuses `javascript:`, `data:` and `vbscript:`); for a stored file path, `private.storage_path`; for formatted values (ZIP, phone, a fixed list), a format or `in (...)` check;
   - the same limits in the shared zod schema, so the API answers with a friendly message first (the database check is the backstop, not the message);
   - a test in `supabase/tests/rls/` that writes an oversized value, a control character and (for addresses) a dangerous address as the signed-in user and expects a check violation (`23514`), and a test in `apps/api/tests/integration/` that sends the same through direct `PATCH` and `POST` requests to the real Data API and reads the row back;
   - a mutation entry in `supabase/tests/mutation.mjs` for at least one of the new constraints, so the test is proven to notice when it is removed.
   A column that clients cannot write (no grant) still gets a maximum length when the API writes it, but the Data API tests are not needed for it. If a new grant makes an existing table writable, the constraints come in the same migration as the grant.
9. **Schema changes** are a new numbered migration with privileges stated explicitly (new tables start closed), RLS, guard triggers where values are restricted, CHECK constraints (rule 8), RLS tests, and a mutation entry when a policy, function or constraint changes. Never apply a migration to the production project from a development session.
10. **Web code:** pages stay thin; logic lives in `lib/` and feature components; all network calls go through `lib/api/client.ts`; all provider calls through `lib/auth/backend.ts`; protected areas use `RequireRole`; every form has labels, error text with an icon, a busy state and a disabled state; never render protected content on the server or while loading; show text from users as plain text and links only after checking the scheme.
11. **Tests:** every new behavior gets a test that fails without it. Run `npm test` (needs `npm run db:start`) before every commit; `npm run test:fast` is for quick loops only. Lint and typecheck must be clean.
12. **Dependencies:** tell the owner before installing anything, with its purpose and size. Prefer what is already installed.
13. **Seekers are visible to employers only if they opt in** (default off), and contact details never appear in a list.

## 5. Where to look

| I want to… | Look at |
|---|---|
| Add a signed-in route | `apps/api/src/routes/v1/`, then register it in `v1/index.ts`; tests in `apps/api/tests/` |
| Add a state change only the server may make | A server-only SQL function (migration), a method in `apps/api/src/services/`, and a route that calls it |
| Add a public route | `apps/api/src/routes/v1/public.ts` (explicit allowlist, anon client); the allowlist constant goes in `packages/shared` |
| Change what a role may do in the database | A new migration, plus `supabase/tests/rls/` and a real Data API test in `apps/api/tests/integration/` |
| Add a text column a user can write | A new migration with CHECK constraints (rule 8), the same limits in the shared schema, and the tests listed in rule 8 |
| Add a screen | `apps/web/src/app/<group>/…`, wrapped by the group's layout guard |
| Add a form | `apps/web/src/components/…`, a schema in `packages/shared/src/schemas/`, the same schema in the API route |
| Add a color, size or font | `packages/shared/src/tokens.ts` only |
| Understand sign-in | `docs/PLAN.md` section 6.2, then `apps/web/src/lib/auth/` |
| Understand the security headers and CSP | `docs/PLAN.md` section 6.5, then `apps/web/src/proxy.ts` and `apps/web/src/lib/security/`. Pages may not use inline `style` attributes, and a new `NEXT_PUBLIC_` address the browser calls must be added to `connect-src` (it is read from `public-env.ts`) |
| Understand the company profile and public page | `docs/PLAN.md` section 6.3 |
| Understand jobs and the database constraints | `docs/PLAN.md` section 6.4 and 5.6 |
| Run things locally | `docs/PLAN.md` section 13 |
