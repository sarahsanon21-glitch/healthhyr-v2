-- ============================================================================
-- 000a_schema_catalog.sql        RUN THIS FIRST
--
-- READ-ONLY. Five SELECTs against the Postgres system catalogs.
-- Creates nothing, alters nothing, writes nothing.
--
-- WHY THIS FILE CANNOT FAIL THE WAY 000 DID
--   The original 000_schema_introspection.sql mixed catalog queries with data
--   queries and aborted on:
--       ERROR: 42703: column "status" does not exist
--   because employer_profiles has no status column. Postgres parses a
--   statement in full before executing it, so a reference to a missing column
--   fails at PARSE time -- no CASE, EXISTS or information_schema guard inside
--   the query can prevent it.
--
--   Everything here DESCRIBES columns instead of SELECTing them. A column that
--   does not exist simply does not appear in the output. There is no column
--   reference to get wrong.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor. Run each query below separately (the
--   editor shows one result grid at a time) and send back all five.
--   A1 and A2 are the ones that actually unblock work.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A1 -- Every column of every table in `public`
--
-- Answers:
--   * Does employer_profiles.status exist?  (expected: NO -- this is the
--     finding that broke the original file)
--   * Does employer_profiles have city / state / zip_code / organization_type
--     / industry_type / email?              (bug fix #2)
--   * Do work_experience, education, licenses, certification_details and
--     worker_languages key on worker_id or user_id?   (bug fix #3 -- the
--     backend contradicts itself: profileRoutes writes worker_id,
--     employerRoutes reads user_id)
--   * Do jobs.status, jobs.salary_max, users.is_profile_complete and
--     subscriptions.job_posts_used physically exist? (migration 004)
-- ----------------------------------------------------------------------------
SELECT c.table_name,
       c.ordinal_position          AS pos,
       c.column_name,
       c.data_type,
       c.character_maximum_length  AS max_len,
       c.is_nullable,
       c.column_default
FROM   information_schema.columns c
JOIN   information_schema.tables t
       ON  t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
       AND t.table_type   = 'BASE TABLE'
WHERE  c.table_schema = 'public'
ORDER  BY c.table_name, c.ordinal_position;


-- ----------------------------------------------------------------------------
-- A2 -- Every constraint (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK)
--
-- THE IMPORTANT ONE. Look for table_name = 'applications' with
-- constraint_type = 'UNIQUE'. Its definition will read either:
--     UNIQUE (job_id)             -> one application per job, total
--     UNIQUE (job_id, worker_id)  -> one application per worker per job
-- If no such row appears, the database enforces no uniqueness at all and the
-- only guard is the racy read-then-write in seekerRoutes.js:351-360.
-- Check A4 as well: a unique INDEX enforces uniqueness without appearing here.
-- ----------------------------------------------------------------------------
SELECT t.relname AS table_name,
       c.conname AS constraint_name,
       CASE c.contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'c' THEN 'CHECK'
         WHEN 'x' THEN 'EXCLUDE'
         ELSE c.contype::text
       END AS constraint_type,
       pg_get_constraintdef(c.oid) AS definition
FROM   pg_constraint c
JOIN   pg_class     t ON t.oid = c.conrelid
JOIN   pg_namespace n ON n.oid = t.relnamespace
WHERE  n.nspname = 'public'
ORDER  BY t.relname, c.contype, c.conname;


-- ----------------------------------------------------------------------------
-- A3 -- CHECK constraints, isolated
--
-- The allowed-value lists that migrations 003 / 004 / 005 must extend without
-- breaking existing rows. Expect applications.status here. Do NOT expect
-- employer_profiles.status -- the column does not exist, so migration 003
-- creates it rather than extending it.
-- ----------------------------------------------------------------------------
SELECT t.relname AS table_name,
       c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS check_definition
FROM   pg_constraint c
JOIN   pg_class     t ON t.oid = c.conrelid
JOIN   pg_namespace n ON n.oid = t.relnamespace
WHERE  n.nspname = 'public'
  AND  c.contype = 'c'
ORDER  BY t.relname, c.conname;


-- ----------------------------------------------------------------------------
-- A4 -- Indexes
--
-- A UNIQUE INDEX enforces uniqueness exactly like a UNIQUE CONSTRAINT but does
-- not appear in A2, so the applications question is only fully answered by
-- reading both.
-- ----------------------------------------------------------------------------
SELECT tablename  AS table_name,
       indexname  AS index_name,
       indexdef   AS definition
FROM   pg_indexes
WHERE  schemaname = 'public'
ORDER  BY tablename, indexname;


-- ----------------------------------------------------------------------------
-- A5 -- Functions
--
-- Confirms increment_applications_count(job_id) exists. seekerRoutes.js:375
-- calls it via rpc() and never checks the result, so if it is missing the
-- applications_count on every job is silently wrong.
-- ----------------------------------------------------------------------------
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid)             AS returns
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
ORDER  BY p.proname;
