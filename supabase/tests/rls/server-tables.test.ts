import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAdmin,
  createEmployer,
  createJob,
  createPayment,
  createSeeker,
  grantPro,
} from './fixtures';
import { tx, type Db } from './helpers';

describe('saved_jobs', () => {
  it('a seeker saves, reads and removes their own, and nobody else can', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { status: 'published' });
      const seeker = await createSeeker(db);
      const other = await createSeeker(db);

      await db.asUser(seeker);
      await db.q('insert into saved_jobs (seeker_id, job_id) values ($1, $2)', [seeker, job]);
      expect(await db.count('select 1 from saved_jobs')).toBe(1);

      await db.asUser(other);
      expect(await db.count('select 1 from saved_jobs')).toBe(0);
      await db.expectError('insert into saved_jobs (seeker_id, job_id) values ($1, $2)', [seeker, job], /row-level security/);
      expect(await db.count('delete from saved_jobs where seeker_id = $1', [seeker])).toBe(0);

      await db.asUser(employer);
      expect(await db.count('select 1 from saved_jobs')).toBe(0);
      await db.asAnon();
      expect(await db.count('select 1 from saved_jobs')).toBe(0);

      await db.asUser(seeker);
      expect(await db.count('delete from saved_jobs where seeker_id = $1', [seeker])).toBe(1);
    }));
});

describe('notifications', () => {
  async function note(db: Db, userId: string, type = 'test') {
    await db.asService();
    return (await db.one(`insert into notifications (user_id, type, title) values ($1, $2, 'Hello') returning id`, [userId, type])).id as string;
  }

  it('a user reads only their own and can mark them read, nothing more', () =>
    tx(async (db) => {
      const a = await createSeeker(db);
      const b = await createSeeker(db);
      const mine = await note(db, a);
      const theirs = await note(db, b);

      await db.asUser(a);
      expect(await db.count('select 1 from notifications')).toBe(1);
      await db.q('update notifications set read_at = now() where id = $1', [mine]);
      await db.expectError(`update notifications set title = 'Changed' where id = $1`, [mine], /permission denied/);
      expect(await db.count('update notifications set read_at = now() where id = $1', [theirs])).toBe(0);
    }));

  it('users cannot create or delete notifications', () =>
    tx(async (db) => {
      const a = await createSeeker(db);
      const mine = await note(db, a);
      await db.asUser(a);
      await db.expectError(`insert into notifications (user_id, type, title) values ($1, 'x', 'Fake')`, [a], /permission denied/);
      await db.expectError('delete from notifications where id = $1', [mine], /permission denied/);
      await db.asAnon();
      expect(await db.count('select 1 from notifications')).toBe(0);
    }));

  it('the Hiring Pro launch notification can only be sent once per person', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await note(db, seeker, 'hiring_pro_launched');
      await db.asService();
      await db.expectError(
        `insert into notifications (user_id, type, title) values ($1, 'hiring_pro_launched', 'Again')`,
        [seeker],
        /duplicate key/,
      );
      await db.q(
        `insert into notifications (user_id, type, title) values ($1, 'hiring_pro_launched', 'Again') on conflict do nothing`,
        [seeker],
      );
      expect(await db.count(`select 1 from notifications where user_id = $1 and type = 'hiring_pro_launched'`, [seeker])).toBe(1);
    }));
});

describe('payments and subscriptions', () => {
  it('an employer reads only their own; nobody else can', () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      const seeker = await createSeeker(db);
      const jobA = await createJob(db, a);
      const jobB = await createJob(db, b);
      await createPayment(db, a, jobA);
      await createPayment(db, b, jobB);
      await grantPro(db, a);

      await db.asUser(a);
      expect(await db.count('select 1 from payments')).toBe(1);
      expect(await db.count('select 1 from subscriptions')).toBe(1);
      await db.asUser(b);
      expect(await db.count('select 1 from subscriptions')).toBe(0);
      await db.asUser(seeker);
      expect(await db.count('select 1 from payments')).toBe(0);
      await db.asAnon();
      expect(await db.count('select 1 from payments')).toBe(0);
    }));

  it('an admin reads all payments and subscriptions', () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const admin = await createAdmin(db);
      await createPayment(db, a, await createJob(db, a));
      await grantPro(db, a);
      await db.asUser(admin);
      expect(await db.count('select 1 from payments')).toBeGreaterThanOrEqual(1);
      expect(await db.count('select 1 from subscriptions')).toBeGreaterThanOrEqual(1);
    }));

  it('no app role can write payments or subscriptions', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      const payment = await createPayment(db, employer, job);
      const admin = await createAdmin(db);
      for (const actor of [employer, admin]) {
        await db.asUser(actor);
        await db.expectError(
          `insert into payments (employer_id, job_id, amount_cents, status) values ($1, $2, 1, 'succeeded')`,
          [employer, job],
          /permission denied/,
        );
        await db.expectError(`update payments set status = 'succeeded' where id = $1`, [payment], /permission denied/);
        await db.expectError('delete from payments where id = $1', [payment], /permission denied/);
        await db.expectError(
          `insert into subscriptions (employer_id, status, current_period_end) values ($1, 'active', now() + interval '1 year')`,
          [employer],
          /permission denied/,
        );
      }
    }));
});

describe('webhook_events', () => {
  it('only the service role can touch it', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      await db.asService();
      await db.q(`insert into webhook_events (stripe_event_id, type, payload) values ('evt_test_1', 'x', '{}')`);
      expect(await db.count('select 1 from webhook_events')).toBe(1);

      for (const actor of [employer, null]) {
        if (actor) await db.asUser(actor);
        else await db.asAnon();
        await db.expectError('select * from webhook_events', [], /permission denied/);
        await db.expectError(`insert into webhook_events (stripe_event_id, type, payload) values ('evt_x', 'x', '{}')`, [], /permission denied/);
      }
    }));

  it('a Stripe event id can only be stored once', () =>
    tx(async (db) => {
      await db.asService();
      await db.q(`insert into webhook_events (stripe_event_id, type, payload) values ('evt_dup', 'x', '{}')`);
      await db.expectError(`insert into webhook_events (stripe_event_id, type, payload) values ('evt_dup', 'x', '{}')`, [], /duplicate key/);
    }));
});

describe('contact_messages', () => {
  const insert = `insert into contact_messages (name, email, topic, message) values ('Sam', 'sam@example.test', 'billing', 'I have a question about billing.')`;

  it('nobody but the service role can create them (the API rate-limits and audits)', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      await db.asAnon();
      await db.expectError(insert, [], /permission denied/);
      await db.asUser(seeker);
      await db.expectError(insert, [], /permission denied/);
      await db.asService();
      await db.q(insert);
      expect(await db.count('select 1 from contact_messages')).toBe(1);
    }));

  it('only admins can read them', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      const admin = await createAdmin(db);
      await db.asService();
      await db.q(insert);
      await db.asUser(admin);
      expect(await db.count('select 1 from contact_messages')).toBe(1);
      await db.asUser(seeker);
      expect(await db.count('select 1 from contact_messages')).toBe(0);
      await db.asAnon();
      await db.expectError('select 1 from contact_messages', [], /permission denied/);
    }));

  it('validates topic, email and length', () =>
    tx(async (db) => {
      await db.asService();
      const bad = [
        `insert into contact_messages (name, email, topic, message) values ('Sam', 'sam@example.test', 'sales', 'A valid length message.')`,
        `insert into contact_messages (name, email, topic, message) values ('Sam', 'not-an-email', 'billing', 'A valid length message.')`,
        `insert into contact_messages (name, email, topic, message) values ('Sam', 'sam@example.test', 'billing', 'short')`,
        `insert into contact_messages (name, email, topic, message) values ('', 'sam@example.test', 'billing', 'A valid length message.')`,
      ];
      for (const sql of bad) await db.expectError(sql, [], /check constraint/);
    }));
});

describe('admin_audit_log', () => {
  it('admins can read it; everyone else cannot', () =>
    tx(async (db) => {
      const admin = await createAdmin(db);
      const seeker = await createSeeker(db);
      await db.asService();
      await db.q(`insert into admin_audit_log (admin_id, action, target_type) values ($1, 'test', 'x')`, [admin]);
      await db.asUser(admin);
      expect(await db.count('select 1 from admin_audit_log')).toBe(1);
      await db.asUser(seeker);
      expect(await db.count('select 1 from admin_audit_log')).toBe(0);
    }));

  it('admins cannot write to it directly: only the API can, so every entry is genuine', () =>
    tx(async (db) => {
      const admin = await createAdmin(db);
      await db.asUser(admin);
      await db.expectError(`insert into admin_audit_log (admin_id, action, target_type) values ($1, 'x', 'y')`, [admin], /permission denied/);
    }));

  it('is append-only, even for the service role', () =>
    tx(async (db) => {
      const admin = await createAdmin(db);
      await db.asService();
      const id = (await db.one(`insert into admin_audit_log (admin_id, action, target_type) values ($1, 'x', 'y') returning id`, [admin])).id;
      await db.expectError(`update admin_audit_log set action = 'edited' where id = $1`, [id], /permission denied/);
      await db.expectError('delete from admin_audit_log where id = $1', [id], /permission denied/);
      await db.expectError('truncate admin_audit_log', [], /permission denied/);
    }));

  it('every entry names exactly one actor: an admin or the system', () =>
    tx(async (db) => {
      const admin = await createAdmin(db);
      await db.asService();
      await db.q(`insert into admin_audit_log (system_actor, action, target_type) values ('system:webhook', 'x', 'y')`);
      await db.expectError(`insert into admin_audit_log (action, target_type) values ('x', 'y')`, [], /check constraint/);
      await db.expectError(
        `insert into admin_audit_log (admin_id, system_actor, action, target_type) values ($1, 'system:webhook', 'x', 'y')`,
        [admin],
        /check constraint/,
      );
    }));
});

describe('privileges and exposure', () => {
  it('authenticated can never truncate, reference or add triggers on any table', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select table_name, privilege_type from information_schema.role_table_grants
          where grantee = 'authenticated' and table_schema = 'public'
            and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`,
      );
      expect(rows).toEqual([]);
    }));

  it('anon can read only the public job board tables', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select table_name from information_schema.role_table_grants
          where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT' order by 1`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(['employer_profiles', 'jobs']);
    }));

  it('the helper functions that take arbitrary ids are not callable through the API', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const exposed = await db.rows(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('is_admin','can_message','has_active_hiring_pro','employer_can_view_seeker','employer_holds_application_from')`,
      );
      expect(exposed).toEqual([]);
    }));

  it('the private schema is not exposed by the API and is closed to the public', () =>
    tx(async (db) => {
      const config = readFileSync(resolve(import.meta.dirname, '../../config.toml'), 'utf8');
      const schemas = /^schemas\s*=\s*\[([^\]]*)\]/m.exec(config)?.[1] ?? '';
      expect(schemas).not.toMatch(/private/);

      await db.asSuperuser();
      const row = await db.one(`select has_schema_privilege('public', 'private', 'create') as can_create`);
      expect(row.can_create).toBe(false);
    }));

  it('app roles cannot call the helpers with someone else’s ids to probe relationships', () =>
    tx(async (db) => {
      const pro = await createEmployer(db, 'Pro Care');
      const seeker = await createSeeker(db);
      await grantPro(db, pro);
      await db.asUser(seeker);
      await db.expectError('select has_active_hiring_pro($1)', [pro], /does not exist/);
      await db.expectError('select can_message($1, $2)', [pro, seeker], /does not exist/);
      await db.expectError('select employer_holds_application_from($1, $2)', [seeker, pro], /does not exist/);
    }));
});
