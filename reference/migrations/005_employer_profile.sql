-- ============================================================================
-- 005_employer_profile.sql
--
-- ⛔ ON HOLD (2026-09-27) — DO NOT RUN.
--
--   Superseded pending the new employer billing model. This migration
--   encodes "pending until Stripe checkout": every employer without a
--   card-backed subscription is marked 'pending' and loses job posting.
--
--   The new model is the opposite — employers create a profile and job
--   drafts for free, and pay at the point of publishing a job. Running this
--   would lock out exactly the employers the new model wants to let in.
--
--   SPLIT (2026-09-27). The five address/classification columns this file
--   also added are wanted regardless of the billing model, and have been
--   re-issued on their own as:
--
--       007_employer_profile_address.sql   <-- run this instead
--
--   What remains here is only the status column, its backfill, its default
--   and its CHECK. That belongs with the Phase 2 verification work, where
--   status is a verification state rather than a billing gate, and will be
--   folded into 009. This file is kept for the record and should not be run
--   as written.
--
--   The rest of the batch (003, 004, 006, 007) is unaffected and safe to
--   run: none of them touches employer_profiles.status.
--
-- ⚠️⚠️  THIS MIGRATION ACTIVATES THE EMPLOYER GATE.  ⚠️⚠️
--
--   DO NOT RUN until the frontend pending state (code fix C7) is deployed
--   and confirmed live.
--
--   requireActiveProfile (authMiddleware.js:187-205) reads
--   employer_profiles.status. The column does not exist, so that SELECT
--   errors, the error is discarded, `profile` is null, and the comparison
--   `profile?.status === 'pending'` is never true. The gate has never fired
--   for anyone.
--
--   Creating the column makes it live immediately, on POST /api/employer/jobs
--   and GET /api/employer/jobs. Every employer this migration marks 'pending'
--   loses job posting the moment it runs. Without C7 deployed they get a
--   silently empty dashboard and no way to fix it.
--
-- WHAT ELSE IS BROKEN BY THE MISSING COLUMN
--   employerRoutes.js:156 puts `status` into profileData for the company
--   profile save. PostgREST rejects the whole statement, not just that
--   column, so company_name / phone / website / address / logo_url are ALL
--   discarded. The error is not destructured, so the route returns HTTP 200
--   with a null body and CompanyProfile.jsx treats it as success. Employers
--   have never been able to save their company profile. Code fix C5 depends
--   on this migration.
--
-- ALSO ADDS the address and classification columns employerRoutes.js:89
--   destructures from the request body and then silently drops, because they
--   have nowhere to go: city, state, zip_code, organization_type, email.
--   (A1 confirmed employer_profiles has only id, user_id, company_name,
--   company_description, website, phone, address, logo_url, country,
--   created_at, updated_at.)
--
-- BACKFILL RULE (agreed 2026-09-26)
--   'active'  only where the employer has a subscription row with a non-null
--             stripe_subscription_id AND a status of active/trial/trialing —
--             i.e. they actually completed card-backed checkout.
--   'pending' everyone else.
--
--   Run 000b B10/B11 first to see the bucket sizes and the per-employer
--   breakdown. Expect most or all existing employers to land in 'pending',
--   because registration creates a trial subscription with no Stripe
--   involvement (authRoutes.js:320) and the webhook that would have set
--   stripe_subscription_id has never worked — see migration 003.
--
-- SAFETY
--   * Additive only. No drops, no deletes, no column removals.
--   * Every ADD COLUMN is IF NOT EXISTS, so re-running is a no-op.
--   * status is backfilled BEFORE the CHECK is added, so no row can violate
--     it at the moment it is applied.
--   * NOT VALID then VALIDATE, so a surprise row surfaces as a validation
--     error rather than failing the statement.
--   * Wrapped in BEGIN/COMMIT. Postgres DDL is transactional, so a failure
--     at any step rolls the whole migration back rather than leaving the
--     column added but unbackfilled or unconstrained.
--
-- DEPENDS ON  003 (UNIQUE(user_id) on employer_profiles)
-- ============================================================================


BEGIN;


-- ── 1. Address and classification columns ───────────────────────────────────
-- Lengths mirror the existing conventions on this table and on
-- worker_profiles (city/state/zip_code there are 255/100/20).
ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS city              character varying(255),
  ADD COLUMN IF NOT EXISTS state             character varying(100),
  ADD COLUMN IF NOT EXISTS zip_code          character varying(20),
  ADD COLUMN IF NOT EXISTS organization_type character varying(100),
  ADD COLUMN IF NOT EXISTS email             character varying(255);


-- ── 2. The status column ────────────────────────────────────────────────────
-- Added nullable first so the backfill can populate it before any constraint
-- or NOT NULL is applied.
ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS status character varying(20);


-- ── 3. Backfill ─────────────────────────────────────────────────────────────
-- Only rows still NULL are touched, so re-running cannot reclassify an
-- employer an admin has since changed by hand.
UPDATE public.employer_profiles ep
SET    status = CASE
         WHEN EXISTS (
           SELECT 1
           FROM   public.subscriptions s
           WHERE  s.user_id = ep.user_id
             AND  s.stripe_subscription_id IS NOT NULL
             AND  s.status IN ('active', 'trial', 'trialing')
         )
         THEN 'active'
         ELSE 'pending'
       END
WHERE  ep.status IS NULL;


-- ── 4. Default and NOT NULL ─────────────────────────────────────────────────
-- New profiles start pending: the employer has not completed checkout yet.
ALTER TABLE public.employer_profiles
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.employer_profiles
  ALTER COLUMN status SET NOT NULL;


-- ── 5. CHECK constraint ─────────────────────────────────────────────────────
-- 'suspended' is included now, ahead of Phase 2 / migration 009, so the admin
-- suspend action does not require a second constraint rewrite later.
ALTER TABLE public.employer_profiles
  DROP CONSTRAINT IF EXISTS employer_profiles_status_check;

ALTER TABLE public.employer_profiles
  ADD CONSTRAINT employer_profiles_status_check
  CHECK ((status)::text = ANY (ARRAY[
    'pending',
    'active',
    'suspended'
  ]::text[]))
  NOT VALID;

ALTER TABLE public.employer_profiles
  VALIDATE CONSTRAINT employer_profiles_status_check;


COMMIT;


-- Everything above is all-or-nothing: if any step fails the whole
-- migration rolls back and the table is left exactly as it was. The
-- checks below run after the commit and only read.

-- ── 6. Verify ───────────────────────────────────────────────────────────────
-- Bucket sizes after the backfill. Compare against 000b B10, which predicted
-- them before anything was written.
SELECT status, count(*) AS employers
FROM   public.employer_profiles
GROUP  BY status
ORDER  BY status;

-- New columns present?
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'employer_profiles'
  AND  column_name IN ('status', 'city', 'state', 'zip_code', 'organization_type', 'email')
ORDER  BY column_name;
