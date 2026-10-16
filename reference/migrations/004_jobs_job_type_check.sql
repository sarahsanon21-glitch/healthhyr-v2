-- ============================================================================
-- 004_jobs_job_type_check.sql
--
-- Widens jobs_job_type_check from four values to seven.
--
-- WHY
--   A3 showed the constraint allows only:
--       full-time, part-time, contract, per-diem
--   But express-validator at employerRoutes.js:223 and :293 also accepts
--   'live-in', and PostJob.jsx:465 offers seven options to the employer:
--       Full-Time, Part-Time, Per Diem, Contract, Live-In, Overnight, Weekend
--
--   So posting a Live-In, Overnight or Weekend job passes every application
--   layer and then fails at the database with a raw constraint violation.
--   For a marketplace that lists "Live-In Caregiver" as a role, that is a
--   real gap rather than a theoretical one.
--
--   Decision (2026-09-26): widen the constraint to cover everything the UI
--   offers, rather than removing shift types from the product.
--
-- SAFETY
--   * Purely widening. Every value allowed before is still allowed, so no
--     existing row can be invalidated.
--   * 000c C5 confirmed the only stored value is 'full-time' (1 row), so
--     nothing needs normalising first.
--   * NULL is explicitly permitted. A CHECK already passes on NULL, but
--     stating it keeps the intent obvious — jobs.job_type is nullable and
--     employerRoutes.js:255 writes null when no type is given.
--   * Added NOT VALID then VALIDATE separately, so if an unexpected row does
--     exist it surfaces as a validation error on a constraint that is already
--     enforcing for new writes, rather than failing the whole statement.
--   * Wrapped in BEGIN/COMMIT. This drops the old constraint before adding
--     the new one, so without a transaction a failure on the ADD would leave
--     jobs.job_type with NO constraint at all — strictly worse than the
--     narrow one it started with.
--
-- COMPANION CODE CHANGE  C5b normalises the case mismatch: PostJob sends
--   'Full-Time' while the validator expects 'full-time'. This migration only
--   governs what the database accepts.
-- ============================================================================

BEGIN;


ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_job_type_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_job_type_check
  CHECK (
    job_type IS NULL
    OR (job_type)::text = ANY (ARRAY[
         'full-time',
         'part-time',
         'contract',
         'per-diem',
         'live-in',
         'overnight',
         'weekend'
       ]::text[])
  )
  NOT VALID;

ALTER TABLE public.jobs
  VALIDATE CONSTRAINT jobs_job_type_check;


COMMIT;


-- Everything above is all-or-nothing: if any step fails the whole migration
-- rolls back. The checks below run after the commit and only read.

-- Verify: definition should list all seven values.
SELECT c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM   pg_constraint c
JOIN   pg_class     t ON t.oid = c.conrelid
JOIN   pg_namespace n ON n.oid = t.relnamespace
WHERE  n.nspname = 'public'
  AND  t.relname = 'jobs'
  AND  c.conname = 'jobs_job_type_check';
