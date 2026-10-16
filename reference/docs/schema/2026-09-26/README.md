# Schema snapshot — 2026-09-26

Output of `backend/migrations/000a_schema_catalog.sql`, run against the
production Supabase project on 2026-09-26, **before** migrations 003, 004,
006 and 007 were applied.

The backend talks to Postgres only through `@supabase/supabase-js`, so there
are no `CREATE TABLE` statements anywhere in the repo and the schema exists
nowhere but the database. This is the only checked-in record of what it
looked like.

| File | Query | Contents |
|---|---|---|
| `columns.csv` | A1 | Every column of every table in `public`, one row per table |
| `constraints.csv` | A2 | Primary keys, unique constraints, foreign keys, checks |
| `checks.csv` | A3 | CHECK constraints isolated |
| `indexes.csv` | A4 | All indexes |

A5 (functions) returned **zero rows** — there are no functions in the `public`
schema. Worth remembering: `seekerRoutes.js` called
`rpc('increment_applications_count')` for months against a function that did
not exist, failing silently the whole time.

## What this snapshot establishes

- `applications` has **two** redundant unique constraints over the same pair,
  `(job_id, worker_id)` and `(worker_id, job_id)`.
- `subscriptions` and `employer_profiles` have **no** `UNIQUE(user_id)`, which
  is why the Stripe webhook's `onConflict: 'user_id'` upsert fails with 42P10
  and has never recorded a subscription. Fixed by migration 003.
- `employer_profiles` has no `status`, and no `city`/`state`/`zip_code`/
  `organization_type`/`email`.
- `jobs` has no `status` column — publication state is the boolean
  `is_active` — and no index beyond its primary key.
- `applications.status` defaults to `'pending'`, a value its own CHECK
  constraint forbids. Fixed by migration 006.
- 38 columns are `timestamp without time zone` against 7 `with time zone`,
  which is why evening records display a day late.

## Refreshing this

Re-run `000a_schema_catalog.sql` and save the five grids into a new dated
directory. Do not overwrite this one — the point is to be able to see what
changed and when.
