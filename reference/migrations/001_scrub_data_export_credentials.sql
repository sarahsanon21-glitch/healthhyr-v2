-- ============================================================================
-- 001_scrub_data_export_credentials.sql
--
-- Companion to bug fix #1 (credential leak via GET /api/admin/users/:id/export).
--
-- The code fix stops NEW archives from containing credential material, but any
-- data_export blob written before that fix still holds password_hash,
-- reset_token, reset_token_expires, verification_token, otp_code and
-- otp_expires_at — and that blob is served verbatim as a downloadable JSON
-- file to any admin.
--
-- This strips those six keys from the nested `user` object inside every
-- existing data_export, leaving the rest of the archive (profile data, the
-- non-sensitive user columns) untouched.
--
-- SAFETY
--   - Only touches rows where data_export IS NOT NULL.
--   - Removes keys; adds and renames nothing.
--   - Idempotent: running it twice is a no-op, because `- 'key'` on a jsonb
--     object that lacks that key returns the object unchanged.
--   - No schema change, no drops.
--
-- Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- Preview first: how many archives currently carry credential material?
-- (Safe to run on its own; returns a count, changes nothing.)
SELECT count(*) AS archives_with_credentials
FROM   users
WHERE  data_export IS NOT NULL
  AND  data_export -> 'user' ?| array[
         'password_hash',
         'reset_token',
         'reset_token_expires',
         'verification_token',
         'otp_code',
         'otp_expires_at'
       ];


-- The scrub itself.
UPDATE users
SET    data_export = jsonb_set(
         data_export,
         '{user}',
         (data_export -> 'user')
           - 'password_hash'
           - 'reset_token'
           - 'reset_token_expires'
           - 'verification_token'
           - 'otp_code'
           - 'otp_expires_at'
       )
WHERE  data_export IS NOT NULL
  AND  jsonb_typeof(data_export -> 'user') = 'object'
  AND  data_export -> 'user' ?| array[
         'password_hash',
         'reset_token',
         'reset_token_expires',
         'verification_token',
         'otp_code',
         'otp_expires_at'
       ];


-- Verify: this must return 0.
SELECT count(*) AS archives_still_with_credentials
FROM   users
WHERE  data_export IS NOT NULL
  AND  data_export -> 'user' ?| array[
         'password_hash',
         'reset_token',
         'reset_token_expires',
         'verification_token',
         'otp_code',
         'otp_expires_at'
       ];
