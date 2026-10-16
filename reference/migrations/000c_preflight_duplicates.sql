-- ============================================================================
-- 000c_preflight_duplicates.sql          READ-ONLY. Run before 002 and 003.
--
-- Only SELECTs. Creates nothing, alters nothing, deletes nothing.
--
-- WHY
--   A2/A4 showed that neither `subscriptions` nor `employer_profiles` has a
--   UNIQUE constraint on user_id -- only a primary key on id. Two consequences:
--
--   1. The Stripe webhook at server.js:162 does
--          .upsert({...}, { onConflict: 'user_id' })
--      which Postgres rejects with 42P10 ("no unique or exclusion constraint
--      matching the ON CONFLICT specification"). The error is discarded, the
--      webhook returns 200 to Stripe, and nothing is written. stripe_
--      subscription_id has never been persisted, so cancel-subscription and
--      billing-portal both fail for anyone who has actually paid.
--
--   2. The employer profile save does check-then-insert with no constraint
--      behind it, so concurrent requests can create duplicate rows -- which
--      would then break every .single() lookup on that table.
--
--   Migration 003 adds the UNIQUE constraints. It cannot run while duplicate
--   user_id rows exist, so 002 deletes them first. This file shows exactly
--   which rows 002 would keep and which it would delete, so the outcome is
--   reviewable BEFORE anything is removed.
--
-- DEDUPE RULE (agreed 2026-09-26)
--   subscriptions      keep the row with a non-null stripe_subscription_id;
--                      if several or none qualify, keep the most recently
--                      updated (updated_at, then created_at, then id).
--   employer_profiles  keep the most recently updated.
--
-- HOW TO RUN
--   Supabase SQL Editor. Run each block separately and send back all five.
--   C1 and C3 are the ones that decide whether 002 is needed at all.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- C1 -- subscriptions: is there a duplicate problem, and how big?
--
--       If duplicate_user_ids = 0, migration 002 is a no-op for this table and
--       003 can add the constraint directly.
-- ----------------------------------------------------------------------------
SELECT count(*)                                         AS total_rows,
       count(DISTINCT user_id)                          AS distinct_user_ids,
       count(*) FILTER (WHERE user_id IS NULL)          AS null_user_ids,
       count(*) - count(DISTINCT user_id)               AS surplus_rows,
       (SELECT count(*)
          FROM (SELECT user_id
                  FROM subscriptions
                 WHERE user_id IS NOT NULL
                 GROUP BY user_id
                HAVING count(*) > 1) d)                 AS duplicate_user_ids
FROM   subscriptions;


-- ----------------------------------------------------------------------------
-- C2 -- subscriptions: every row in every duplicate set, with the verdict.
--
--       One row per record. `verdict` is exactly what migration 002 will do.
--       Read this before running 002 -- nothing is deleted until you do.
--
--       Ordering implements the agreed rule: a non-null stripe_subscription_id
--       wins outright, then most recently updated.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT s.*,
         row_number() OVER (
           PARTITION BY s.user_id
           ORDER BY (s.stripe_subscription_id IS NOT NULL) DESC,
                    s.updated_at DESC NULLS LAST,
                    s.created_at DESC NULLS LAST,
                    s.id
         ) AS rn,
         count(*) OVER (PARTITION BY s.user_id) AS rows_for_user
  FROM   subscriptions s
  WHERE  s.user_id IS NOT NULL
)
SELECT r.user_id,
       u.email,
       r.id                                        AS subscription_id,
       r.plan,
       r.status,
       (r.stripe_subscription_id IS NOT NULL)      AS has_stripe_sub,
       r.stripe_subscription_id,
       r.trial_ends_at,
       r.created_at,
       r.updated_at,
       CASE WHEN r.rn = 1 THEN 'KEEP' ELSE 'DELETE' END AS verdict
FROM   ranked r
LEFT   JOIN users u ON u.id = r.user_id
WHERE  r.rows_for_user > 1
ORDER  BY u.email, r.rn;


-- ----------------------------------------------------------------------------
-- C3 -- employer_profiles: is there a duplicate problem?
-- ----------------------------------------------------------------------------
SELECT count(*)                                         AS total_rows,
       count(DISTINCT user_id)                          AS distinct_user_ids,
       count(*) FILTER (WHERE user_id IS NULL)          AS null_user_ids,
       count(*) - count(DISTINCT user_id)               AS surplus_rows,
       (SELECT count(*)
          FROM (SELECT user_id
                  FROM employer_profiles
                 WHERE user_id IS NOT NULL
                 GROUP BY user_id
                HAVING count(*) > 1) d)                 AS duplicate_user_ids
FROM   employer_profiles;


-- ----------------------------------------------------------------------------
-- C4 -- employer_profiles: every row in every duplicate set, with the verdict.
--       Rule: keep the most recently updated.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT ep.*,
         row_number() OVER (
           PARTITION BY ep.user_id
           ORDER BY ep.updated_at DESC NULLS LAST,
                    ep.created_at DESC NULLS LAST,
                    ep.id
         ) AS rn,
         count(*) OVER (PARTITION BY ep.user_id) AS rows_for_user
  FROM   employer_profiles ep
  WHERE  ep.user_id IS NOT NULL
)
SELECT r.user_id,
       u.email,
       r.id                AS employer_profile_id,
       r.company_name,
       r.phone,
       r.website,
       r.created_at,
       r.updated_at,
       CASE WHEN r.rn = 1 THEN 'KEEP' ELSE 'DELETE' END AS verdict
FROM   ranked r
LEFT   JOIN users u ON u.id = r.user_id
WHERE  r.rows_for_user > 1
ORDER  BY u.email, r.rn;


-- ----------------------------------------------------------------------------
-- C5 -- jobs.job_type values currently stored.  Needs: jobs.job_type.
--
--       Migration 004 widens the CHECK from
--           full-time, part-time, contract, per-diem
--       to include live-in, overnight, weekend, because express-validator
--       already accepts 'live-in' and PostJob.jsx offers all seven -- so a
--       Live-In job passes validation and then fails at the database.
--
--       Anything here outside the new seven-value set has to be normalised
--       inside 004 before the constraint is revalidated. NULL is fine: a
--       CHECK constraint passes on NULL.
-- ----------------------------------------------------------------------------
SELECT COALESCE(job_type, '(null)') AS job_type,
       count(*)                     AS rows,
       CASE
         WHEN job_type IS NULL THEN 'ok (null passes CHECK)'
         WHEN job_type IN ('full-time', 'part-time', 'contract', 'per-diem')
              THEN 'ok (already allowed)'
         WHEN job_type IN ('live-in', 'overnight', 'weekend')
              THEN 'ok once 004 widens the CHECK'
         ELSE 'NEEDS NORMALISING in 004'
       END                          AS verdict
FROM   jobs
GROUP  BY job_type
ORDER  BY rows DESC;
