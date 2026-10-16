-- ============================================================================
-- 000b_data_checks.sql           RUN AFTER 000a
--
-- READ-ONLY. Only SELECTs. Creates nothing, alters nothing, writes nothing.
--
-- HOW TO RUN
--   Run each numbered statement ON ITS OWN, not the whole file at once.
--   Each block names the column it depends on. If A1 in 000a showed that
--   column does not exist, SKIP that block -- it will error, and running
--   statements individually means one failure can no longer abort the rest
--   the way it did in the original 000.
--
--   (Postgres parses a statement fully before running it, so a missing column
--   always fails at parse time. Separate statements are the fix; no in-query
--   guard can work.)
--
-- WHAT MATTERS MOST
--   B2 and B3 settle the applications uniqueness question empirically.
--   B10 sizes the migration 003 backfill.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- B1 -- Row counts.  Needs: nothing but the tables themselves.
--       Drop any line whose table A1 says is absent.
-- ----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM users)                AS users,
       (SELECT count(*) FROM employer_profiles)    AS employer_profiles,
       (SELECT count(*) FROM worker_profiles)      AS worker_profiles,
       (SELECT count(*) FROM jobs)                 AS jobs,
       (SELECT count(*) FROM applications)         AS applications,
       (SELECT count(*) FROM subscriptions)        AS subscriptions,
       (SELECT count(*) FROM notifications)        AS notifications,
       (SELECT count(*) FROM contact_messages)     AS contact_messages,
       (SELECT count(*) FROM interviews)           AS interviews,
       (SELECT count(*) FROM reviews)              AS reviews;


-- ----------------------------------------------------------------------------
-- B2 -- Duplicate (job_id, worker_id) pairs.  Needs: applications.job_id,
--       applications.worker_id.
--
--       > 0 proves the database does NOT enforce UNIQUE(job_id, worker_id),
--       and that the racy JS check in seekerRoutes.js has already been lost.
--       0 is consistent with the constraint existing, but does not prove it --
--       A2 and A4 are what prove it.
-- ----------------------------------------------------------------------------
SELECT count(*) AS duplicate_worker_job_pairs
FROM  (SELECT job_id, worker_id
       FROM   applications
       GROUP  BY job_id, worker_id
       HAVING count(*) > 1) d;


-- ----------------------------------------------------------------------------
-- B3 -- Jobs with more than one distinct applicant.  Needs: the same columns.
--
--       > 0 definitively rules out UNIQUE(job_id) alone.
-- ----------------------------------------------------------------------------
SELECT count(*) AS jobs_with_multiple_applicants
FROM  (SELECT job_id
       FROM   applications
       GROUP  BY job_id
       HAVING count(DISTINCT worker_id) > 1) m;


-- ----------------------------------------------------------------------------
-- B4 -- applications.status values in use.  Needs: applications.status.
--       Compare against the express-validator allowlist in
--       employerRoutes.js:342 -- applied, under_review, interview, offer,
--       hired, rejected. Anything else is a value the API cannot produce.
-- ----------------------------------------------------------------------------
SELECT status, count(*) AS rows
FROM   applications
GROUP  BY status
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B5 -- subscriptions.status values.  Needs: subscriptions.status.
--       Watch for raw Stripe statuses ('trialing', 'past_due', 'canceled')
--       passed through by the webhook at server.js:255 alongside this app's
--       own vocabulary ('trial', 'active', 'inactive', 'cancelled').
-- ----------------------------------------------------------------------------
SELECT status, count(*) AS rows
FROM   subscriptions
GROUP  BY status
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B6 -- subscriptions.plan values.  Needs: subscriptions.plan.
--       stripeRoutes.js normalises to 'standard'/'premium' while the webhook
--       at server.js:165 writes the raw metadata plan ('premium-yearly').
--       Both spellings appearing here confirms that inconsistency is live.
-- ----------------------------------------------------------------------------
SELECT plan, count(*) AS rows
FROM   subscriptions
GROUP  BY plan
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B7 -- users.role values.  Needs: users.role.
--       Expect worker / employer / admin. Confirms at least one admin exists,
--       which Phase 1 needs in order to test the admin guard at all.
-- ----------------------------------------------------------------------------
SELECT role, count(*) AS rows
FROM   users
GROUP  BY role
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B8 -- jobs.is_active split.  Needs: jobs.is_active.
--       This is the column migration 004 backfills jobs.status from.
-- ----------------------------------------------------------------------------
SELECT is_active, count(*) AS rows
FROM   jobs
GROUP  BY is_active
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B9 -- employer_profiles.status.  Needs: employer_profiles.status.
--
--       *** THIS ONE IS EXPECTED TO FAIL. ***
--       Kept deliberately as the one-line reproduction of the finding:
--           ERROR: 42703: column "status" does not exist
--       If it instead returns rows, the earlier diagnosis was wrong and
--       migration 003 must be rewritten -- tell me either way.
-- ----------------------------------------------------------------------------
SELECT status, count(*) AS rows
FROM   employer_profiles
GROUP  BY status
ORDER  BY rows DESC;


-- ----------------------------------------------------------------------------
-- B10 -- MIGRATION 003 BACKFILL PREVIEW.  Needs: subscriptions.status,
--        subscriptions.stripe_subscription_id.  Does NOT touch
--        employer_profiles.status, so it runs even though B9 fails.
--
--        Your intended design: an employer is 'active' only once they have
--        completed Stripe checkout with a card. Everyone else is 'pending'.
--        This shows how many existing employers land in each bucket, i.e.
--        exactly who would be locked out of posting jobs the moment
--        requireActiveProfile stops being dead code.
-- ----------------------------------------------------------------------------
SELECT CASE
         WHEN s.stripe_subscription_id IS NOT NULL
          AND s.status IN ('active', 'trial', 'trialing')
         THEN 'active'
         ELSE 'pending'
       END               AS would_get_status,
       count(*)          AS employers
FROM   employer_profiles ep
LEFT   JOIN subscriptions s ON s.user_id = ep.user_id
GROUP  BY 1
ORDER  BY 1;


-- ----------------------------------------------------------------------------
-- B11 -- Same as B10, itemised, so the buckets can be sanity-checked per
--        employer before anything is written. Same column requirements.
--
--        Expect a large 'pending' bucket: registration creates a
--        plan='trial' / status='trial' subscription row with NO Stripe
--        involvement (authRoutes.js:320), so those rows have a null
--        stripe_subscription_id and are correctly NOT card-backed.
-- ----------------------------------------------------------------------------
SELECT ep.user_id,
       ep.company_name,
       s.plan,
       s.status                                   AS subscription_status,
       (s.stripe_subscription_id IS NOT NULL)     AS has_stripe_subscription,
       s.trial_ends_at,
       CASE
         WHEN s.stripe_subscription_id IS NOT NULL
          AND s.status IN ('active', 'trial', 'trialing')
         THEN 'active'
         ELSE 'pending'
       END                                        AS would_get_status
FROM   employer_profiles ep
LEFT   JOIN subscriptions s ON s.user_id = ep.user_id
ORDER  BY would_get_status, ep.company_name;
