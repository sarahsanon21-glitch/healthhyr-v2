-- ============================================================================
-- 006_applications_status.sql
--
-- Two changes to applications.status:
--   1. Fix a default value that its own CHECK constraint forbids.
--   2. Add 'withdrawn' to the allowed set.
--
-- WHY (1) — the illegal default
--   A1 showed:  status character varying(30) DEFAULT 'pending'
--   A3 showed:  CHECK (status IN ('applied','under_review','interview',
--                                 'offer','hired','rejected'))
--
--   'pending' is not in that list. Any INSERT that omits `status` therefore
--   fails the constraint. It has not bitten yet only because the single
--   insert path (seekerRoutes.js:367) always passes 'applied' explicitly.
--   It is a trap for the admin work, which will insert and update
--   applications from new code paths.
--
--   Changed to 'applied', which is both legal and the actual first stage of
--   the pipeline.
--
-- WHY (2) — 'withdrawn' and 'shortlisted'
--   docs/ADMIN_SPEC.md §12 defines the pipeline as
--       Applied, Under Review, Interview, Offer, Hired, Rejected, Withdrawn
--   Six of the seven exist. 'withdrawn' is the seeker-initiated exit and is
--   needed before the admin Applications view can represent it.
--
--   Note there is currently NO route that withdraws an application — this
--   migration makes the value representable; the endpoint is separate work.
--
--   'shortlisted' comes from BILLING_SPEC.md §6, whose pipeline is
--       New, Reviewed, Shortlisted, Interview, Offer, Hired, Rejected
--   New maps to 'applied' and Reviewed to 'under_review', but Shortlisted
--   has no equivalent — and the employer dashboard already renders a
--   "Shortlisted" count derived from something else. Added here rather than
--   in a second migration, since this one already has to rewrite the same
--   constraint.
--
--   Deliberately NOT renaming the existing six to match the spec's wording:
--   a rename would invalidate every existing row and the express-validator
--   allowlist at employerRoutes.js:381. The stored vocabulary stays; any
--   relabelling belongs in the UI.
--
-- SAFETY
--   * Purely widening. Every value allowed before is still allowed, so no
--     existing row can be invalidated.
--   * 000b B4 lists the values actually in use; nothing needs normalising.
--   * The default change affects only future inserts that omit the column.
--   * NOT VALID then VALIDATE, so a surprise row surfaces as a validation
--     error rather than failing the statement.
--   * Wrapped in BEGIN/COMMIT. This drops the old constraint before adding
--     the new one, so without a transaction a failure on the ADD would leave
--     applications.status with NO constraint at all — and the default change
--     could land without the widened CHECK that makes it legal.
--
-- SUPERSEDES the separately-planned applications_withdrawn migration, which
--   would have rewritten this same constraint a second time.
-- ============================================================================


BEGIN;


-- ── 1. Legal default ────────────────────────────────────────────────────────
ALTER TABLE public.applications
  ALTER COLUMN status SET DEFAULT 'applied';


-- ── 2. Widen the CHECK ──────────────────────────────────────────────────────
ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_status_check
  CHECK ((status)::text = ANY (ARRAY[
    'applied',
    'under_review',
    'interview',
    'offer',
    'hired',
    'rejected',
    'withdrawn',
    'shortlisted'
  ]::text[]))
  NOT VALID;

ALTER TABLE public.applications
  VALIDATE CONSTRAINT applications_status_check;


COMMIT;


-- Everything above is all-or-nothing: if any step fails the whole migration
-- rolls back. The checks below run after the commit and only read.

-- ── 3. Verify ───────────────────────────────────────────────────────────────
SELECT c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM   pg_constraint c
JOIN   pg_class     t ON t.oid = c.conrelid
JOIN   pg_namespace n ON n.oid = t.relnamespace
WHERE  n.nspname = 'public'
  AND  t.relname = 'applications'
  AND  c.conname = 'applications_status_check';

SELECT column_name, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'applications'
  AND  column_name  = 'status';
