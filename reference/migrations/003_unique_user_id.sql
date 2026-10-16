-- ============================================================================
-- 003_unique_user_id.sql
--
-- Adds UNIQUE(user_id) to `subscriptions` and `employer_profiles`.
--
-- ⚠️ THIS IS THE FIX FOR THE STRIPE WEBHOOK.
--
-- WHY
--   A2/A4 showed both tables carry only a primary key on `id` — no unique
--   constraint on user_id. `worker_profiles` has one
--   (worker_profiles_user_id_unique), which is why its upsert works and these
--   two do not.
--
--   server.js:162 (checkout.session.completed) does:
--       .upsert({ user_id, plan, status, stripe_subscription_id, ... },
--               { onConflict: 'user_id' })
--   Postgres rejects that with 42P10 — "there is no unique or exclusion
--   constraint matching the ON CONFLICT specification". The result is never
--   destructured, so the error is discarded and the webhook returns 200 to
--   Stripe. Nothing is written.
--
--   Net effect today: stripe_subscription_id is never persisted, so
--     POST /api/stripe/cancel-subscription -> "No active subscription found."
--     POST /api/stripe/billing-portal      -> "No billing account found."
--   A paying employer cannot cancel or manage billing, and trial_ends_at /
--   current_period_* / the real Stripe status are never recorded either.
--
--   employer_profiles gets the same constraint for a different reason: the
--   profile save is a check-then-insert with nothing behind it, so concurrent
--   requests can create duplicate rows, which would then break every
--   .single() lookup on that table.
--
-- SAFETY
--   * 000c confirmed zero duplicate user_id values in either table, so both
--     constraints validate immediately.
--   * user_id is nullable in both. UNIQUE permits multiple NULLs in Postgres,
--     so existing null-user_id rows (there are none today) would not block it.
--   * Guarded by a catalog check, so re-running is a no-op. Postgres has no
--     ADD CONSTRAINT IF NOT EXISTS, hence the DO block.
--   * Adds constraints only. No drops, no data change.
--   * Wrapped in BEGIN/COMMIT. Both constraints land together or neither
--     does, so the webhook is never left fixed for one table and broken for
--     the other.
--
-- DEPENDS ON  002 (no-op — 000c found nothing to delete)
-- REQUIRED BY code fix C6 (registration writing status 'inactive'). Without
--             this constraint the webhook cannot activate anyone, so flipping
--             registration first would lock every employer out permanently.
-- ============================================================================

BEGIN;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t ON t.oid = c.conrelid
    JOIN   pg_namespace  n ON n.oid = t.relnamespace
    WHERE  n.nspname = 'public'
      AND  t.relname = 'subscriptions'
      AND  c.contype = 'u'
      AND  c.conkey  = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.subscriptions'::regclass
                 AND attname  = 'user_id')
           ]::smallint[]
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
    RAISE NOTICE 'Added subscriptions_user_id_unique';
  ELSE
    RAISE NOTICE 'subscriptions already has a UNIQUE on user_id — skipped';
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t ON t.oid = c.conrelid
    JOIN   pg_namespace  n ON n.oid = t.relnamespace
    WHERE  n.nspname = 'public'
      AND  t.relname = 'employer_profiles'
      AND  c.contype = 'u'
      AND  c.conkey  = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.employer_profiles'::regclass
                 AND attname  = 'user_id')
           ]::smallint[]
  ) THEN
    ALTER TABLE public.employer_profiles
      ADD CONSTRAINT employer_profiles_user_id_unique UNIQUE (user_id);
    RAISE NOTICE 'Added employer_profiles_user_id_unique';
  ELSE
    RAISE NOTICE 'employer_profiles already has a UNIQUE on user_id — skipped';
  END IF;
END $$;


COMMIT;


-- Everything above is all-or-nothing: if any step fails the whole migration
-- rolls back. The checks below run after the commit and only read.

-- Verify: both rows must appear.
SELECT t.relname AS table_name,
       c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM   pg_constraint c
JOIN   pg_class     t ON t.oid = c.conrelid
JOIN   pg_namespace n ON n.oid = t.relnamespace
WHERE  n.nspname = 'public'
  AND  t.relname IN ('subscriptions', 'employer_profiles')
  AND  c.contype = 'u'
ORDER  BY t.relname;
