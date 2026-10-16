# HealthHyr v2 architecture

Short and accurate to the repository as of step 9. It describes what exists; parts that are planned are marked **(planned, step N)**. The product decisions, the database design and the step list are in `docs/PLAN.md`. The rules that never bend are in `CLAUDE.md`. Security rules and the launch checklist are in `docs/SECURITY.md`.

## 1. Folder responsibilities

```
packages/shared/   Code used by more than one app. TypeScript source, no build step.
  src/tokens.ts      The only place colors, fonts, spacing and radii are defined (the only file with hex values).
  src/constants.ts   Prices, 30 days, limits, default company name, contact email.
  src/enums.ts       Roles, statuses and other enums, kept in sync with the SQL by tests.
  src/copy.ts        Approved wording that must not drift.
  src/contrast.ts    Contrast math used by tests.
  src/schemas/       zod schemas (auth, company; more per step). The same rules run in the browser, the API and, later, the app.
  src/legal/         Terms and Privacy text (draft until the owner supplies it). Node only.

apps/web/          The website (Next.js App Router, Tailwind from the tokens).
  src/app/           Routes only: layouts, pages, metadata. Route groups: (auth), (employer), (seeker), (admin), (public).
  src/components/ui/ Base components. No business logic, no data fetching.
  src/components/auth, account, company/   Feature components: sign-in, the signed-in frame, the company form and the public company page.
  src/lib/public-env.ts           The only file that reads the environment (public values only).
  src/lib/api/client.ts           The only file that calls fetch. The signed-in client (sends the person's token) and the public client (sends none).
  src/lib/api/public.ts           Server-side calls for public pages; builds the public client from the environment.
  src/lib/auth/                   Sign-in logic: backend.ts (the only file that imports supabase-js), service.ts (state machine),
                                  guards, redirects, error messages, provider (also hands the API client to forms).

apps/api/          The Express API. The only place business rules and Stripe live.
  src/env.ts         The only place process.env and secrets are read; validated at boot.
  src/app.ts         createApp(): middleware order. Receives everything it needs as options (no secrets read here).
  src/server.ts      Entry point: load config, build clients, listen.
  src/auth/          Token verification (JWKS, ES256 and RS256 only).
  src/middleware/    Request id, authenticate (role from the database), requireRole, per-IP and per-user limits, CORS, error handler.
  src/lib/           userClient.ts (per request, as the user), anonClient.ts (public reads, as anon), serviceClient.ts (bypasses RLS).
  src/routes/        paths.ts (API_V1, webhook path), health, stripeWebhook (reserved), v1/: me.ts, employer.ts (signed in), public.ts (no sign-in).
  src/services/      (planned) server-only operations; the only code allowed to use the service client.

supabase/          Local stack and the database.
  config.toml        Local services (database, auth, the Data API with the public schema only, mail catcher; storage is turned on in step 18).
  migrations/        0001_schema.sql is the executable source of truth; later changes are new numbered files.
  templates/         The emailed 6-digit code (confirmation, recovery).
  tests/rls/         RLS tests against the real local database; mutation.mjs proves the tests catch weakened policies.

tests/             Repository-wide tests (hygiene) and support/ (mail catcher reader used by integration tests).
docs/              PLAN.md, COLORS.md, SECURITY.md, ARCHITECTURE.md.
apps/mobile/      (planned, step 24) The seeker app, Expo and React Native.
```

Tests sit next to their app, in `apps/<app>/tests/` and `packages/shared/tests/`. Tests that need the real local Supabase live in `apps/api/tests/integration/`. The API's unit tests use a stand-in database (`apps/api/tests/helpers/harness.ts`) that applies row-level security and records every query.

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
        │                                                             (Postgres applies RLS and column privileges as that user)
        │                                                          5. only server-only operations use the service client
        │                                                       ──▶ Data API (PostgREST) ──▶ Postgres (Supabase)
        │
        └── public pages (server-rendered): the Next.js server calls /api/v1/public/... with no token
                                                               ──▶ API ──▶ anon client ──▶ Data API ──▶ Postgres (role: anon)

 Stripe ──POST /api/webhooks/stripe (raw body, signature)──▶ API ──▶ service client ──▶ Postgres        [not versioned]

 Mobile app (planned, step 24): the same path as the browser. It uses supabase-js for sign-in and refresh only, and the API for everything else.
```

What follows from this:

- **The database enforces access** (privileges, RLS, guard triggers). The API adds rules the database cannot express (prices, Stripe, uploads, plan limits). The web app and the app only display; they never decide anything about access.
- **The role is read, not carried.** `GET /api/v1/me` returns `{ id, role }` from the database. The website builds its signed-in user from that answer only.
- **Browsers never talk to the database.** They talk to Supabase Auth and to the API. The Data API is for the API's own use. (A signed-in person holding their own token could still call it directly, which is why privileges and RLS must hold on their own and why format rules that matter belong in the database too; see `docs/SECURITY.md`.)
- **Three Supabase clients on the server:** per-request (user token, RLS applies, the default), anon (public reads, RLS as `anon`) and service-role (server-only operations, allow comment required). A scanner test enforces the service-role rule.
- **Public output is an allowlist.** A public route builds its response field by field; a test fails if any other field appears.

## 3. Naming conventions

- **Files:** React components `PascalCase.tsx`; everything else `camelCase.ts` (`public-env.ts` and similar existing kebab names stay); Next.js route files use the framework names (`page.tsx`, `layout.tsx`). Route directories are lowercase and kebab-case. Route groups are in parentheses.
- **Tests:** `*.test.ts` or `*.test.tsx`, named for what they cover (`auth-service.test.ts`, `sign-in.test.tsx`, `company.test.ts`). Test titles describe behavior in plain words.
- **Code:** `camelCase` for values and functions, `PascalCase` for types and components, `UPPER_SNAKE` for constants and environment variables. Database names are `snake_case`. JSON fields in the API are `camelCase`, mapped from the table columns by hand in each route (never passing a row through).
- **API:** paths are lowercase and plural for collections, under `/api/v1`. Routes for people who are not signed in live under `/api/v1/public`. Errors use fixed codes (`invalid_token`, `no_profile`, …) with friendly fixed messages.
- **Migrations:** `NNNN_short_name.sql`, one concern each, with RLS tests and a mutation entry for anything that changes access.
- **Commits:** one step per commit, message says what and why, ends with the co-author line. Tests pass first; push after the commit.

## 4. Rules for adding code

1. **Plan first.** A step is in `docs/PLAN.md` and approved before code. Update the plan in the same commit as the change.
2. **Colors, fonts, spacing:** only from `packages/shared/src/tokens.ts`, through the Tailwind theme. No raw hex in components, no text under 12px, lime is a fill with ink text, olive only for large headings.
3. **Whole-file rewrites only.** Write the complete file, not patches.
4. **No fake data.** No sample listings, no invented counts, no "verified" or "background checked" wording, in the UI, the tests' fixtures that could reach the UI, or structured data.
5. **Secrets:** read the environment only in `apps/api/src/env.ts` / `server.ts` and `apps/web/src/lib/public-env.ts`. Never put a secret in a `NEXT_PUBLIC_` variable. Never commit a real `.env`; add new variable names to the matching `.env.example`. Never print or paste keys (including the output of `supabase start`).
6. **API route checklist:** under `routes/v1/`; authenticated by default (public routes only in `public.ts`, with an explicit field allowlist and the anon client); `requireRole(...)` for role-specific routes; validate input with a shared strict zod schema and reject unknown fields; use `req.auth.db` (the user's client) unless the operation is server-only, in which case it lives in `services/`, carries `// service-role-allowed: <reason>`, checks ownership in code and has a "stranger is refused" test; filter by the caller's id from the verified token, never an id from the request; never accept a role, status, price, slug, listing flag or date that the server decides; return only fixed friendly errors.
7. **Plan limits and prices are enforced on the server** (and in SQL where possible), never only in the UI.
8. **Schema changes** are a new numbered migration with privileges stated explicitly (new tables start closed), RLS, guard triggers where values are restricted, CHECK constraints for rules that must hold even against a direct Data API write, RLS tests, and a mutation entry when a policy or function changes. Never apply a migration to the production project from a development session.
9. **Web code:** pages stay thin; logic lives in `lib/` and feature components; all network calls go through `lib/api/client.ts`; all provider calls through `lib/auth/backend.ts`; protected areas use `RequireRole`; every form has labels, error text with an icon, a busy state and a disabled state; never render protected content on the server or while loading; show text from users as plain text and links only after checking the scheme.
10. **Tests:** every new behavior gets a test that fails without it. Run `npm test` (needs `npm run db:start`) before every commit; `npm run test:fast` is for quick loops only. Lint and typecheck must be clean.
11. **Dependencies:** tell the owner before installing anything, with its purpose and size. Prefer what is already installed.
12. **Seekers are visible to employers only if they opt in** (default off), and contact details never appear in a list.

## 5. Where to look

| I want to… | Look at |
|---|---|
| Add a signed-in route | `apps/api/src/routes/v1/`, then register it in `v1/index.ts`; tests in `apps/api/tests/` |
| Add a public route | `apps/api/src/routes/v1/public.ts` (explicit allowlist, anon client); the allowlist constant goes in `packages/shared` |
| Change what a role may do in the database | A new migration, plus `supabase/tests/rls/` and a real Data API test in `apps/api/tests/integration/` |
| Add a screen | `apps/web/src/app/<group>/…`, wrapped by the group's layout guard |
| Add a form | `apps/web/src/components/…`, a schema in `packages/shared/src/schemas/`, the same schema in the API route |
| Add a color, size or font | `packages/shared/src/tokens.ts` only |
| Understand sign-in | `docs/PLAN.md` section 6.2, then `apps/web/src/lib/auth/` |
| Understand the company profile and public page | `docs/PLAN.md` section 6.3 |
| Run things locally | `docs/PLAN.md` section 13 |
