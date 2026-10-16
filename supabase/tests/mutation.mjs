// Proves the RLS tests protect something: removes or weakens one policy, guard or grant at a time,
// runs the RLS suite, and checks that the tests that should notice DO fail.
//
// The mutation SQL is applied inside each test's own transaction (RLS_MUTATION_SQL, see
// supabase/tests/rls/helpers.ts), and every test rolls back, so nothing is ever changed for real.
//
// Where two layers protect the same thing (a column grant AND a trigger), weakening one layer must
// NOT be noticed, and weakening both must be. Both cases are listed.
//
// Usage: npm run test:rls:mutation   (needs the local database: npm run db:start)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs');

/**
 * expectFail: substrings of test names that must fail under the mutation.
 * expectPass: true when the mutation should NOT be noticed (a second layer still protects).
 */
const mutations = [
  {
    name: 'seeker_private readable by any signed-in user',
    sql: `drop policy private_applicant_employer on seeker_private;
          create policy private_applicant_employer on seeker_private for select using (true);`,
    expectFail: ['another seeker, anon and unrelated employers see nothing', 'another employer (no application) sees nothing'],
  },
  {
    name: 'withdrawn applications still count as "holding an application"',
    sql: `create or replace function private.employer_holds_application_from(p_seeker uuid, p_employer uuid)
            returns boolean language sql stable security definer set search_path = public as $$
            select exists (select 1 from applications a join jobs j on j.id = a.job_id
                            where a.seeker_id = p_seeker and j.employer_id = p_employer) $$;`,
    expectFail: ['after the seeker withdraws, the employer can no longer read the details'],
  },
  {
    name: 'applications guard trigger removed (status rules and withdrawal clearing)',
    sql: 'drop trigger applications_guard_t on applications;',
    expectFail: [
      'may not set the status to submitted',
      'may not set any other status',
      'a seeker withdrawing clears the cover note and resume',
    ],
  },
  {
    name: 'applications: all columns writable, but the guard trigger still stands (defense in depth)',
    sql: 'grant update on applications to authenticated;',
    expectPass: true,
  },
  {
    name: 'applications: guard trigger removed AND all columns writable',
    sql: `drop trigger applications_guard_t on applications; grant update on applications to authenticated;`,
    expectFail: ['may not change the cover note, resume, job or seeker', 'may not edit the cover note, resume or job'],
  },
  {
    name: 'jobs guard trigger removed and status/dates writable',
    sql: `drop trigger jobs_guard_t on jobs; grant insert, update on jobs to authenticated;`,
    expectFail: [
      'an employer cannot change status, payment, dates or owner',
      'an employer cannot create a job that is already published',
      'content is locked while a job waits for payment',
    ],
  },
  {
    name: 'role escalation: guard trigger removed AND role column writable',
    sql: `drop trigger profiles_lock on profiles; grant update (role) on profiles to authenticated;`,
    expectFail: ['a user cannot make themselves admin'],
  },
  {
    name: 'role column writable, but the guard trigger still stands (defense in depth)',
    sql: `grant update (role) on profiles to authenticated;`,
    expectPass: true,
  },
  {
    name: 'public job board ignores expiry and the listing rule',
    sql: `drop policy jobs_public_read on jobs;
          create policy jobs_public_read on jobs for select using (status = 'published');`,
    expectFail: [
      'anon sees published, unexpired jobs of listed employers, and nothing else',
      'a job disappears from the public as soon as its employer goes back to the default name',
    ],
  },
  {
    name: 'every employer treated as having Hiring Pro',
    sql: `create or replace function private.has_active_hiring_pro(p_employer uuid)
            returns boolean language sql stable security definer set search_path = public as $$ select true $$;`,
    expectFail: [
      'an opted-in seeker is invisible to employers without Hiring Pro',
      'an expired, past-due, cancelled, incomplete or other-plan subscription does not count',
      'an employer without Hiring Pro may not message an opted-in seeker; with Hiring Pro they may',
    ],
  },
  {
    name: 'messaging policy no longer checks the relationship',
    sql: `drop policy msg_send on messages;
          create policy msg_send on messages for insert with check (sender_id = auth.uid());`,
    expectFail: [
      'an employer may not message a seeker with no relationship',
      'a seeker may not start a conversation with a stranger employer',
    ],
  },
  {
    name: 'messages editable by the recipient (guard trigger removed and all columns writable)',
    sql: `drop trigger messages_guard_t on messages; grant update on messages to authenticated;`,
    expectFail: ['the recipient cannot edit the body, sender or recipient', 'the recipient can mark it read, once'],
  },
  {
    name: 'employer pages public even under the default name',
    sql: `drop policy employer_select on employer_profiles;
          create policy employer_select on employer_profiles for select using (true);`,
    expectFail: ['a default-named employer is not visible to anon or other users'],
  },
  {
    name: 'publish_job no longer checks that a payment was already used',
    sql: `do $mutation$
          declare d text;
          begin
            d := pg_get_functiondef('public.publish_job(uuid,uuid)'::regprocedure);
            d := replace(d, 'and consumed_at is not null)', 'and false)');
            d := replace(d, ' and consumed_at is null', '');
            execute d;
          end $mutation$;`,
    expectFail: ['refuses the same payment a second time, so republishing needs a new payment'],
  },
  {
    name: 'authenticated may TRUNCATE a table (row-level security does not cover it)',
    sql: 'grant truncate on jobs to authenticated;',
    expectFail: ['authenticated can never truncate, reference or add triggers on any table'],
  },
  {
    name: 'helper function exposed in the public schema (relationship probing via RPC)',
    sql: `create function public.can_message(p_sender uuid, p_recipient uuid) returns boolean
            language sql security definer as $$ select private.can_message(p_sender, p_recipient) $$;`,
    expectFail: [
      'the helper functions that take arbitrary ids are not callable through the API',
      'app roles cannot call the helpers with someone else’s ids to probe relationships',
    ],
  },
  {
    name: 'webhook events readable by signed-in users',
    sql: `grant select on webhook_events to authenticated;
          create policy leak on webhook_events for select using (true);`,
    expectFail: ['only the service role can touch it'],
  },
  {
    name: 'audit log can be truncated by the service role',
    sql: 'grant truncate on admin_audit_log to service_role;',
    expectFail: ['is append-only, even for the service role'],
  },

  // ───────── step 10: reopen rule and the text constraints of migration 0002 ─────────
  {
    name: 'reopen_job republishes a closed job even after its end date (no new payment needed)',
    sql: `do $mutation$
          declare d text;
          begin
            d := pg_get_functiondef('public.reopen_job(uuid,uuid)'::regprocedure);
            d := replace(d, 'j.expires_at > now()', 'true');
            execute d;
          end $mutation$;`,
    expectFail: ['reopening an expired job (or a closed one past its end date) returns it to draft and clears the payment'],
  },
  {
    name: 'constraint removed: employer website may be any text (javascript: addresses)',
    sql: 'alter table employer_profiles drop constraint employer_profiles_website_ok;',
    expectFail: ['website refuses every dangerous or malformed address'],
  },
  {
    name: 'constraint removed: employer description has no length limit',
    sql: 'alter table employer_profiles drop constraint employer_profiles_description_ok;',
    expectFail: ['description over its limit (5001 characters) is refused'],
  },
  {
    name: 'constraint removed: job title has no length limit',
    sql: 'alter table jobs drop constraint jobs_title_ok;',
    expectFail: ['title over its limit is refused when creating and when editing'],
  },
  {
    name: 'constraint removed: resume path may be an address or a script',
    sql: 'alter table seeker_private drop constraint seeker_private_resume_url_ok;',
    expectFail: ['resume_url is a storage path, never an address or a script'],
  },
  {
    name: 'address check weakened to accept anything (all three address columns at once)',
    sql: `create or replace function private.http_url(v text) returns boolean
            language sql immutable parallel safe as $$ select true $$;`,
    expectFail: [
      'website refuses every dangerous or malformed address',
      'logo_url refuses every dangerous or malformed address',
      'avatar_url refuses every dangerous or malformed address, and accepts real ones',
    ],
  },
  {
    name: 'single-line check weakened to length only (control characters and line breaks allowed)',
    sql: `create or replace function private.clean_line(v text, max_len integer) returns boolean
            language sql immutable parallel safe as $$ select v is null or char_length(v) <= max_len $$;`,
    expectFail: ['refuses control characters', 'single-line job fields refuse control characters'],
  },
  {
    name: 'signup trigger no longer cuts a long name (signup would fail against the constraints)',
    sql: `create or replace function handle_new_user() returns trigger
            language plpgsql security definer set search_path = public as $$
          declare r user_role;
          begin
            r := case new.raw_user_meta_data->>'role' when 'employer' then 'employer'::user_role else 'seeker'::user_role end;
            insert into profiles (id, role, email, full_name) values (new.id, r, new.email, new.raw_user_meta_data->>'full_name');
            if r = 'employer' then insert into employer_profiles (id) values (new.id);
            else
              insert into seeker_profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New seeker'));
              insert into seeker_private (id) values (new.id);
            end if;
            return new;
          end $$;`,
    expectFail: ['a very long, odd or empty name is cut, cleaned or defaulted instead of failing signup'],
  },
];

function runSuite(mutationSql) {
  const dir = mkdtempSync(join(tmpdir(), 'rls-mutation-'));
  const outputFile = join(dir, 'result.json');
  try {
    const env = { ...process.env };
    if (mutationSql) env.RLS_MUTATION_SQL = mutationSql;
    else delete env.RLS_MUTATION_SQL;
    const run = spawnSync(
      process.execPath,
      [vitest, 'run', '--project', 'rls', '--reporter=json', `--outputFile=${outputFile}`],
      { cwd: root, env, encoding: 'utf8' },
    );
    let report;
    try {
      report = JSON.parse(readFileSync(outputFile, 'utf8'));
    } catch {
      throw new Error(`vitest produced no report.\n${run.stdout}\n${run.stderr}`);
    }
    const results = report.testResults.flatMap((file) => file.assertionResults);
    return {
      total: results.length,
      failed: results.filter((r) => r.status === 'failed').map((r) => r.fullName),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('Baseline (no mutation)...');
const baseline = runSuite(null);
console.log(`  ${baseline.total} tests, ${baseline.failed.length} failed`);
if (baseline.failed.length > 0 || baseline.total === 0) {
  console.error('The unmodified suite must pass before mutations mean anything. Failing:');
  for (const name of baseline.failed) console.error('  -', name);
  process.exit(1);
}

let unexpected = 0;
let caught = 0;
let weakenings = 0;
for (const mutation of mutations) {
  const { failed } = runSuite(mutation.sql);
  let verdict;
  if (mutation.expectPass) {
    verdict = failed.length === 0 ? 'OK (not noticed, as expected: a second layer still protects)' : 'UNEXPECTED FAILURES';
    if (failed.length > 0) unexpected += 1;
  } else {
    weakenings += 1;
    const missing = mutation.expectFail.filter((expected) => !failed.some((name) => name.includes(expected)));
    verdict = missing.length === 0 ? 'CAUGHT' : `NOT CAUGHT: ${missing.join(' | ')}`;
    if (missing.length === 0) caught += 1;
    else unexpected += 1;
  }
  console.log(`\n- ${mutation.name}\n    ${failed.length} test(s) fail -> ${verdict}`);
  if (!mutation.expectPass) {
    for (const name of failed.slice(0, 6)) console.log(`      x ${name}`);
    if (failed.length > 6) console.log(`      ... and ${failed.length - 6} more`);
  }
}

console.log(`\n${caught} of ${weakenings} weakenings caught by the tests.`);
if (unexpected > 0) {
  console.error(`${unexpected} mutation(s) behaved unexpectedly.`);
  process.exit(1);
}
