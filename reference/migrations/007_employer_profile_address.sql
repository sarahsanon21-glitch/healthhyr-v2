-- ============================================================================
-- 007_employer_profile_address.sql
--
-- The address and classification half of the held migration 005.
--
-- WHY THIS EXISTS
--   005 did two unrelated things: it added these five columns, and it added
--   employer_profiles.status with a backfill that marks every employer
--   without a card-backed subscription 'pending' — which activates the
--   employer gate and blocks them from posting jobs.
--
--   The new billing model (docs/BILLING_SPEC.md) inverts that: employers
--   create a profile and job drafts for free and pay at the point of
--   publishing. So 005 is on hold, and the status column is deferred to the
--   Phase 2 verification work where it belongs — as a verification state, not
--   a billing gate.
--
--   The five address columns are wanted either way. employerRoutes.js:89
--   destructures city, state, zipCode, industryType and email from the
--   request body, CompanyProfile.jsx collects all of them, and they have
--   nowhere to go — the employer fills them in and they are discarded.
--   ADMIN_SPEC's Employers table needs Organization Type, Location and State
--   as columns.
--
-- RELATION TO THE COLUMN PROBE
--   employerRoutes.js probes for these five before including them in the
--   write, because PostgREST rejects the WHOLE statement when any column is
--   unknown. Once this migration has run, the first profile save flips the
--   probe's cache and every later save skips it. The probe can then be
--   removed — it is on the deferred list.
--
-- SAFETY
--   * Additive only. No status column, no backfill, no gate activation.
--   * Every ADD COLUMN is IF NOT EXISTS, so re-running is a no-op, and it is
--     safe to run even if a future 005 has already added some of them.
--   * Wrapped in BEGIN/COMMIT: all five land together or none do.
--   * Nothing here can block an employer from posting a job.
--
-- DEPENDS ON  003 (UNIQUE(user_id) on employer_profiles)
-- ============================================================================


BEGIN;


-- Lengths mirror the existing conventions on this table and on
-- worker_profiles, where city/state/zip_code are 255/100/20.
ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS city              character varying(255),
  ADD COLUMN IF NOT EXISTS state             character varying(100),
  ADD COLUMN IF NOT EXISTS zip_code          character varying(20),
  ADD COLUMN IF NOT EXISTS organization_type character varying(100),
  ADD COLUMN IF NOT EXISTS email             character varying(255);


COMMIT;


-- Everything above is all-or-nothing: if any step fails the whole migration
-- rolls back. The check below runs after the commit and only reads.

-- Verify: five rows, all nullable, no default.
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'employer_profiles'
  AND  column_name IN ('city', 'state', 'zip_code', 'organization_type', 'email')
ORDER  BY column_name;

-- Should NOT appear — status is deferred to the Phase 2 verification work.
SELECT count(*) AS status_column_should_be_zero
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'employer_profiles'
  AND  column_name  = 'status';
