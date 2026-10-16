# HealthHyr v2 security: threat model and pre-launch checklist

Status as of step 10 (2026-10-16). This file is a plan and a checklist, not a claim that anything is "secure". Nothing here has had an outside review. Each row says what is already enforced by a test, what still needs one, and what can only be checked by a person. Update it in the same commit as the change it describes. `docs/PLAN.md` says when each item is built.

Test status words used below:

- **Covered** — a test in this repo fails if the control is removed.
- **Needs test** — the control is planned or built without a test; a test is part of the step that builds it.
- **Manual** — a setting or process outside the code (GitHub, hosting, Supabase dashboard). A person checks it and ticks it in the launch checklist.

## 1. What we protect

| Asset | Why it matters | Where it lives |
|---|---|---|
| Seeker contact details (phone, ZIP) and resumes | Private by promise; employers see them only after an application | `seeker_private`, private storage bucket (step 18) |
| Seeker visibility choice | Opt-in, default off | `seeker_profiles` |
| Accounts and sessions | Takeover exposes everything above, and lets an attacker post or apply | Supabase Auth; session in the browser |
| The admin role | Can read and change anything | `profiles.role`, service-role operations |
| Payments and job state | Money and the "paid means published" rule | `payments`, `jobs`, Stripe |
| Service-role key, Stripe secret and webhook secret | Full database bypass; money | API environment only |

## 2. Who might attack, and how

| Threat | Example | Main controls | Test status |
|---|---|---|---|
| **Role escalation** | Sign up as admin; edit own `role`; forge a token | Signup trigger never creates admin; role read from the database on every request; column privileges and guard triggers; only asymmetric JWTs accepted | **Covered**: RLS suites, mutation runner, 32 API auth tests, web source rules, real-Supabase flows, and a direct `PATCH role` through the real Data API is refused |
| **Reading another person's data** | An employer reading a seeker's phone; a stranger reading an application | Row-level security on every table; per-request client carries the user's own token; ownership checks in code where the service role is needed | **Covered** by RLS tests and by tests through the **real Data API** with real tokens (own profile only; another user's profile, company and jobs return nothing; anon reads nothing private; a forged token is refused) |
| **Changing another person's data** | Employer B editing, closing, reopening or deleting employer A's company or job | RLS on the per-request client, plus the code filtering every query by the caller's own id, plus an ownership check in code before any service-role function | **Covered**: unit tests (including RLS switched off), real Data API tests (direct `PATCH`, `DELETE`) and real end-to-end tests of every job route as a stranger |
| **Direct Data API writes skip API validation** | A signed-in employer sends `PATCH employer_profiles` with their own token and a `javascript:` website or a huge description | **Migration 0002 CHECK constraints** on every text column a user can write (maximum length, no control characters, addresses must start with `http://` or `https://`, ZIP, phone and size formats), the same limits in the shared zod schemas for friendly messages, and public output re-checked on the way out | **Covered** (step 10): 55 database tests, 45 direct `PATCH`/`POST` tests against the real Data API with the row read back, and mutation proofs that removing or weakening the constraints is noticed |
| **Setting what the server decides** | An employer sets a job's `status`, `payment_id`, `published_at` or `expires_at`, or edits the required fields while it waits for payment | Column privileges (those columns are not writable), the `jobs_guard` trigger, strict zod schemas that refuse the fields, and server-only functions for close, reopen and cancel checkout | **Covered**: unit, database and real Data API tests for each field, for create and edit, and for the pending-payment lock |
| **Seeker directory leak** | Opted-out seekers or contact fields appearing in employer results | Opt-in AND active Hiring Pro in the database; explicit column allowlist | **Covered** at the database (RLS); the API route is **Needs test** (step 35) |
| **Public pages leaking fields** | The public company page exposing the owner's id or a column added later | Responses built field by field from an explicit allowlist (`PUBLIC_COMPANY_FIELDS`) | **Covered** (step 9): a test fails if any other field appears, including a column added to the table |
| **Employer job responses leaking internals** | A job response carrying `employer_id` or `payment_id` | Named columns and field-by-field mapping | **Covered** (step 10): list and detail responses are checked for the owner and payment ids |
| **Using the service role by mistake** | A route that skips RLS | `service-role-scan` test: allow comment with a reason, key named only in `env.ts`, `server.ts` and `serviceClient.ts`; the client is created only in `server.ts` and handed to `services/` | **Covered** |
| **Plan limits bypassed from the UI** | Calling the API directly | Every limit enforced on the server and in SQL functions | **Covered** for what exists; **Needs test** per step (13 to 17, 34). Note: there is no cap on the number of drafts per employer yet; it is decided when plans define it |
| **Token theft by script injection (XSS)** | An injected script reads the session from local storage | React escaping; no `dangerouslySetInnerHTML`; nonce-based CSP; no user HTML anywhere | Plain-text rendering of hostile text is **Covered** on the company page. CSP is **Needs test** (step 10b). A source rule banning `dangerouslySetInnerHTML` is **Needs test** (step 10b) |
| **Clickjacking, content sniffing, referrer leaks** | Site framed by another site | `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | API helmet defaults **Covered**; web headers **Needs test** (step 10b) |
| **Open redirect after sign-in** | `?next=https://evil.example` | `safeNextPath` accepts only same-site paths | **Covered** (40 helper tests, sign-in tests) |
| **Unsafe links from user text** | A company website of `javascript:` becoming a link | The database now refuses such addresses; the API drops non-http(s) addresses; the page checks again; links use `rel="nofollow noopener noreferrer"` | **Covered** (three layers) |
| **Account enumeration** | "That email is already registered" | Fixed friendly messages; reset says the same for every address; sign-in does not say which part was wrong; a company or job that is not yours answers exactly like one that does not exist | **Covered** (service, component, real-Supabase, company and job route tests) |
| **Password guessing** | Credential stuffing against sign-in | Supabase Auth rate limits; per-IP and per-user limits on our API | Our API limits **Covered**. The Supabase limits and CAPTCHA option are **Manual** (verify in the production project) |
| **Malicious uploads** | A script renamed `resume.pdf`; huge files; path tricks | Type checked by content, size limits, server-chosen names, private bucket, 60 second signed links; `resume_url` already refuses anything that looks like an address (migration 0002) | The path constraint is **Covered**; the upload rules are **Needs test** (step 18) |
| **Forged or replayed Stripe events** | Fake "payment succeeded" | Signature check on the raw body; idempotent event table; server-side price | Raw body **Covered**; the rest **Needs test** (steps 13 to 17) |
| **Secrets in the repo or the browser** | A key committed or bundled into the site | `.env` ignored; hygiene test scans committed text; site refuses a secret-looking key; source rules ban secret names in web code | **Covered**; GitHub secret scanning is **Manual** |
| **Local keys shown in a terminal** | `supabase start` prints the local demo keys when it finishes | `npm run db:start` runs it through a script that hides every key in the output. `npm run db:status` shows them on purpose, in a private terminal. They are local-only values, never production | The masking is a script (checked by hand once); **Manual** discipline otherwise |
| **Leaky errors and logs** | Stack traces, SQL or tokens in a response or log | Single error handler; logs never include tokens; web code never calls `console`; database check messages become a fixed friendly answer | **Covered** |
| **Vulnerable dependencies** | A known CVE in a package | `npm audit`, Dependabot | **Needs** CI (see section 4) |
| **Abuse of the contact form and messaging** | Spam, harassment | Rate limit, honeypot, report and block (app stores require it) | **Needs test** (steps 21, 22, 29) |
| **Admin account takeover** | One phished admin password | Two-factor for admins; every action audited | **Needs test** (step 23), 2FA setting **Manual** |
| **Data loss** | Bad migration, dropped project | Production backups, restore drill | **Manual** |

## 3. Design rules that already hold

These are tested and stay true; change them only with a plan update.

1. The browser holds the publishable key only. The service-role key and the Stripe secret exist only in the API environment, and only `env.ts` reads them.
2. User requests run as the user (per-request client with the user's token), so RLS decides. Public reads run as `anon`. The service role is for server-only operations, lives in `services/`, and checks ownership in code first.
3. The role always comes from the database (API) and never from the token, metadata, storage, the URL or the client. Admin is only ever set with the service role.
4. Plan limits are enforced on the server and in the database, never only in the UI.
5. Passwords and codes go only to Supabase Auth over HTTPS. They are never logged, put in a URL, or sent to the HealthHyr API.
6. Error responses are fixed friendly text with a request id. Details go to the server log only.
7. Anything public is built from an explicit allowlist of fields, never from "the whole row".
8. A client may not set a field the server decides (`is_listed`, `slug`, `id`, `role`, prices, statuses, dates, payment): strict schemas refuse it, the database refuses it, and tests prove both.
9. The Data API exposes only the `public` schema; the `private` helpers are unreachable through it (tested against the real Data API).
10. **Every table a user can write through the Data API has CHECK constraints on each text column**, because a signed-in person can skip the API entirely (`docs/ARCHITECTURE.md` rule 8).

## 4. Pre-launch checklist (before launch 1)

"Built in" names the plan step. "Tests" says what exists or must be added. Tick each box only when it is true in the production setup, not the local one.

### Headers and browser protections
- [ ] **Security headers on the web app** (step 10b): `Strict-Transport-Security` (HSTS, with a long max-age; add `includeSubDomains` only after checking subdomains; `preload` only if the owner decides), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation and similar off), `frame-ancestors 'none'` (and `X-Frame-Options: DENY` for old browsers). Tests: **Needs test** — a test builds the header list and a request-level test checks them on a page and an error page.
- [ ] **Nonce-based Content-Security-Policy** (step 10b): `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src` as tight as Tailwind and Next allow, `connect-src` limited to the API and the Supabase project URL, `img-src` and `font-src` limited to self (and the storage host once photos exist), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. A fresh nonce per request, generated in Next's request interceptor (middleware, named `proxy` in Next 16; confirm at the step) and passed to the page. **Trade-off to decide in step 10b:** a per-request nonce makes every page render on request instead of being served from a static cache. That matters for the public job and company pages (SEO and speed), so the step will measure it and propose either dynamic rendering with short revalidation at the CDN, or a hash-based policy for static pages. The public company page (step 9) already renders on request, so it is a first measurement. Tests: **Needs test** — header present with a nonce, a different nonce on each request, the nonce on every script tag, no `unsafe-inline` or `unsafe-eval` in production, a report-only run first in a real browser.
- [ ] **No raw HTML from users**: a source rule fails on `dangerouslySetInnerHTML` and on `innerHTML` in `apps/web/src`. **Needs test** (step 10b). Job descriptions are plain text with line breaks, never HTML. The company page and job screens already render user text as plain text.
- [ ] **API headers**: helmet defaults (including HSTS, `nosniff`, `frame-ancestors` through CSP defaults) **Covered** by the existing helmet test; production TLS and HSTS at the host are **Manual**.
- [ ] **CORS** allowlist: **Covered**. The production list is **Manual** (explicit, https only).

### Database
- [x] **CHECK constraints** on every user-editable text column in every table users can write through the Data API (migration 0002, step 10): **Covered** (database tests, direct Data API tests, mutation proofs).
- [ ] **Remove the direct Data API write grants that the API will own** when uploads arrive (step 18): `employer_profiles.logo_url`, `seeker_profiles.avatar_url` and `seeker_private.resume_url` are writable by their owners today. The constraints stop dangerous values, but an owner could still point a logo at any web address of their choosing. Once files are uploaded through the API, these columns should be written only by the API (revoke the column grants). **Needs test** (step 18).
- [ ] **Data API exposure** reviewed in production: only `public` exposed, `max_rows` set, no anonymous write grants. The local part is **Covered**; the production setting is **Manual**.
- [ ] **A new table or a new grant** goes through `docs/ARCHITECTURE.md` rule 8 (constraints and tests in the same migration). Reviewed at every step.

### Sign-in and accounts
- [ ] **Brute-force limits with non-revealing messages.** Our API limits are **Covered**. Sign-in, sign-up, code verification and reset requests go to Supabase Auth directly, so its limits are what protect them: check the production project's rate limits (and CAPTCHA, if enabled) match the local defaults or are stricter. **Manual**, then add a note to this file. Messages are **Covered**.
- [ ] **Password policy**: minimum 8 characters in config and in the shared schema, **Covered**. Consider breached-password checks (a Supabase Pro setting): **Manual**, owner decision.
- [ ] **Email codes**: 6 digits, 15 minutes, single use. Local config **Covered** by the real-Supabase tests; production Auth settings **Manual**.
- [ ] **Signup with an odd name**: the signup trigger cuts the name to 100 characters and removes control characters, so a client cannot make signup fail against the constraints. **Covered** (database test and mutation proof).
- [ ] **Admin two-factor** (step 23): admins must use an authenticator app (Supabase MFA, TOTP); the admin area refuses a session that has not passed the second factor. **Needs test** (step 23).
- [ ] **Audited admin actions** (step 23): every admin read of private data and every admin change writes an audit row without personal data in the text. The append-only table is **Covered** by RLS tests; each action's row is **Needs test** (step 23).
- [ ] **Session in local storage**: accepted for now because of the CSP above. Revisit cookie-based sessions only if the CSP cannot be made strict.

### Uploads (step 18, and any photo feature)
- [ ] **Type decided by file content** (magic bytes), not by name or the type the browser reports: PDF, DOC and DOCX for resumes; JPEG, PNG and WebP for photos if added.
- [ ] **Size limits** (resume 5 MB, photos smaller) checked on the server, and the storage bucket's own limit set the same.
- [ ] **Server-side renaming**: stored under a generated id, never the uploaded name; no user-supplied path segments.
- [ ] **Private bucket**, no client policies; only the API reads and writes.
- [ ] **Short-lived signed links** (about 60 seconds) issued only after an ownership check; employers only for a non-withdrawn applicant.
- [ ] No active content served from the storage host (download with `Content-Disposition: attachment`; photos re-encoded if added). A logo, when added, is stored by us and shown from our own host, never from an address the employer types.
- [ ] Malware scanning is not planned for version 1. The owner decides whether to add it; if not, say so in the privacy policy review.
- Tests: all **Needs test** (step 18): wrong content under a right extension, oversize, double extension, path characters in a name, stranger and employer without an application refused, expired link.

### Payments
- [ ] Stripe test keys only until launch; live keys only in the production API environment, and the API refuses them outside production or while a legal document is draft (step 17). Boot refusal outside production is **Covered**.
- [ ] Webhook signature on the raw body **Covered**; the idempotency, retries, `needs_review` and refund paths are **Needs test** (steps 15 and 17).
- [ ] Prices come only from `constants.ts` on the server: **Needs test** (step 13).
- [ ] Cancel checkout also expires the Stripe session (step 14); until then it only returns the job to a draft in the database. **Needs test** (step 14).

### Repository and supply chain (no CI exists yet)
- [ ] **CI workflow** (GitHub Actions) running lint, typecheck and the fast tests on every push and pull request, with a separate job for the database tests using the Supabase CLI. **Manual to set up; tell the owner before adding it.**
- [ ] **`npm audit`** in CI, failing on high and critical findings in production dependencies.
- [ ] **Dependabot** for npm and GitHub Actions (weekly), grouped so updates stay reviewable. Every update must pass the full suite.
- [ ] **GitHub secret scanning and push protection** turned on for the repository. **Manual.**
- [ ] **Branch protection** on `main`: pull request required, CI must pass, no force pushes, no deletion. **Manual.**
- [ ] Lockfile committed, `npm ci` in CI and deploys.
- [ ] Hygiene test (no secrets, no `.env`) **Covered**; extend its patterns when new key formats appear (**Needs test** when step 13 adds Stripe keys to examples).

### Operations
- [ ] **Error monitoring** for the API and the website with personal data and tokens scrubbed before sending. Choosing a tool means a new dependency and a privacy-form update: ask the owner first.
- [ ] **Alert when a Stripe webhook fails** (an event not processed after retries, or a payment in `needs_review`): email through the alert service (step 16) and a monitoring alert. **Needs test** (steps 16 and 17).
- [ ] **Production database backups** on, with a restore drill written down and run once. **Manual.**
- [ ] **Uptime check** on the API health route and the website.
- [ ] **Hosting**: https only, HSTS, the API always on, environment values set in the host (not in the repository), and the production CORS list.
- [ ] **Separate production and development projects**: no test data and no development keys in production; the production Supabase project is never used for tests, and migrations are applied to it only by a deliberate, reviewed release step (never from a development session).
- [ ] Log retention and who can read logs written down.

### Review before launch 1
- [ ] **OWASP Top 10 review** (current list) walked through item by item against this repository, with the findings written in this file: broken access control, security misconfiguration, supply chain, cryptographic failures, injection, insecure design, authentication failures, integrity failures, logging and alerting failures, and exceptional-condition handling. Each item names the control and the test, or opens a fix.
- [ ] **Authenticated manual test** of the main abuse cases against a staging copy: employer A against employer B's job, applicant, payment and company; seeker against another seeker; signed-out against every `/api/v1` route; role change in the database while a token is live; direct Data API calls with each role's token against every table.
- [ ] **Dependency and secret scan** run once more on the release commit.
- [ ] **Privacy policy and terms** final (owner-supplied) and matching what the product collects.
- [ ] Optional, owner decision: an independent security review or penetration test before charging real money.

## 5. Summary of what needs new tests, by step

| Step | New security tests |
|---|---|
| 9 (done) | RLS through the real Data API (user token applied, stranger and anon refused, server-decided columns refused, private schema closed, forged token refused); ownership check on the company profile (also with RLS off); the public company allowlist; website scheme handling |
| 10 (done) | CHECK constraints on every user-writable text column (database tests and direct `PATCH`/`POST` tests against the real Data API, with mutation proofs); jobs: strict input, status/payment/dates refused (API, database and Data API), pending-payment lock, delete rules, close/reopen/cancel-checkout rules, ownership of every job route (also with RLS off), responses never carry the owner or payment |
| 10b | Security headers and nonce CSP on pages and error pages; nonce differs per request and appears on every script; no `unsafe-inline` or `unsafe-eval` in production; source rule against `dangerouslySetInnerHTML` and `innerHTML` |
| 13 to 17 | Server-side price; checkout refusals; webhook idempotency, retry cap, `needs_review`, refund; alert on failure; live-key gate; cancel checkout expires the Stripe session |
| 16 | Alert email header sanitizing and retry |
| 18 | Every upload rule in section 4; revoking the direct write grants on `logo_url`, `avatar_url` and `resume_url`; constraints for every new text column (rule 8) |
| 19 | Application ownership and withdrawal clearing; employer resume link rules |
| 21, 22, 29 | Messaging rules, contact form rate limit and honeypot, report and block |
| 23 | Admin 2FA gate, audit row for every action, non-admins refused |
| 35 | Directory column allowlist and opt-in rules through the API |
| 36 | OWASP review written up; accessibility and banned-phrase scans |
| CI (before step 10b is merged, owner approval needed) | `npm audit`, Dependabot config checked in |

## 6. Reporting a problem

Until a public contact exists, security problems go to `support@healthhyr.com`. A `/.well-known/security.txt` file with that contact is added with the public pages (step 22).
