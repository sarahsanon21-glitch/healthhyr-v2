import { describe, expect, it } from 'vitest';
import { createAdmin, createEmployer, createSeeker, createUser } from './fixtures';
import { tx } from './helpers';

describe('schema: structural guarantees', () => {
  it('every table in public has row-level security enabled', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    }));

  it('all 17 expected tables exist', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' order by 1`,
      );
      expect(rows.map((r) => r.relname)).toEqual([
        'admin_audit_log',
        'applications',
        'contact_messages',
        'employer_profiles',
        'jobs',
        'messages',
        'notifications',
        'payments',
        'profiles',
        'saved_jobs',
        'seeker_certifications',
        'seeker_experience',
        'seeker_languages',
        'seeker_private',
        'seeker_profiles',
        'subscriptions',
        'webhook_events',
      ]);
    }));

  it('server-only functions cannot be executed by anon or authenticated', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const functions = [
        'start_checkout(uuid,uuid,integer)',
        'cancel_checkout(uuid,uuid)',
        'publish_job(uuid,uuid)',
        'close_job(uuid,uuid)',
        'reopen_job(uuid,uuid)',
        'expire_jobs()',
        'job_missing_fields(uuid)',
      ];
      for (const fn of functions) {
        for (const role of ['anon', 'authenticated']) {
          const row = await db.one('select has_function_privilege($1, $2, $3) as allowed', [role, fn, 'execute']);
          expect(row.allowed, `${role} must not execute ${fn}`).toBe(false);
        }
        const service = await db.one('select has_function_privilege($1, $2, $3) as allowed', ['service_role', fn, 'execute']);
        expect(service.allowed, `service_role must execute ${fn}`).toBe(true);
      }
    }));

  it('anon cannot write to any table', () =>
    tx(async (db) => {
      await db.asSuperuser();
      const rows = await db.rows(
        `select table_name, privilege_type from information_schema.role_table_grants
          where grantee = 'anon' and table_schema = 'public'
            and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`,
      );
      expect(rows).toEqual([]);
    }));
});

describe('signup trigger', () => {
  it('a default signup is a seeker with profile, seeker profile and private rows, visibility off', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asSuperuser();
      expect((await db.one('select role from profiles where id = $1', [id])).role).toBe('seeker');
      const profile = await db.one('select is_visible, visibility_opted_in_at from seeker_profiles where id = $1', [id]);
      expect(profile.is_visible).toBe(false);
      expect(profile.visibility_opted_in_at).toBeNull();
      expect(await db.count('select 1 from seeker_private where id = $1', [id])).toBe(1);
      expect(await db.count('select 1 from employer_profiles where id = $1', [id])).toBe(0);
    }));

  it('an employer signup creates an employer profile with the default name, not listed', () =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asSuperuser();
      expect((await db.one('select role from profiles where id = $1', [id])).role).toBe('employer');
      const employer = await db.one('select company_name, is_listed, slug from employer_profiles where id = $1', [id]);
      expect(employer).toEqual({ company_name: 'My company', is_listed: false, slug: null });
      expect(await db.count('select 1 from seeker_profiles where id = $1', [id])).toBe(0);
    }));

  it('a client cannot sign up as admin: the role becomes seeker', () =>
    tx(async (db) => {
      const id = await createUser(db, 'seeker', { role: 'admin' });
      await db.asSuperuser();
      expect((await db.one('select role from profiles where id = $1', [id])).role).toBe('seeker');
    }));

  it('a company name in signup metadata is ignored', () =>
    tx(async (db) => {
      const id = await createUser(db, 'employer', { company_name: 'Sneaky Care' });
      await db.asSuperuser();
      expect((await db.one('select company_name from employer_profiles where id = $1', [id])).company_name).toBe('My company');
    }));
});

describe('profiles', () => {
  it('a user reads their own profile and nobody else', () =>
    tx(async (db) => {
      const a = await createSeeker(db);
      const b = await createSeeker(db);
      await db.asUser(a);
      expect(await db.count('select 1 from profiles where id = $1', [a])).toBe(1);
      expect(await db.count('select 1 from profiles where id = $1', [b])).toBe(0);
      expect(await db.count('select 1 from profiles')).toBe(1);
    }));

  it('anon reads no profiles', () =>
    tx(async (db) => {
      await createSeeker(db);
      await db.asAnon();
      expect(await db.count('select 1 from profiles')).toBe(0);
    }));

  it('an admin reads all profiles', () =>
    tx(async (db) => {
      const admin = await createAdmin(db);
      await createSeeker(db);
      await createEmployer(db);
      await db.asUser(admin);
      expect(await db.count('select 1 from profiles')).toBeGreaterThanOrEqual(3);
    }));

  it('a user can change their own name', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      await db.q(`update profiles set full_name = 'New Name' where id = $1`, [id]);
      expect((await db.one('select full_name from profiles where id = $1', [id])).full_name).toBe('New Name');
    }));

  it('a user cannot make themselves admin', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      await db.expectError(`update profiles set role = 'admin' where id = $1`, [id], /permission denied|server-managed/);
      await db.asSuperuser();
      expect((await db.one('select role from profiles where id = $1', [id])).role).toBe('seeker');
    }));

  it('a user cannot set their own Stripe customer id', () =>
    tx(async (db) => {
      const id = await createEmployer(db);
      await db.asUser(id);
      await db.expectError(`update profiles set stripe_customer_id = 'cus_fake' where id = $1`, [id], /permission denied|server-managed/);
    }));

  it('a user cannot rename someone else (no rows affected)', () =>
    tx(async (db) => {
      const a = await createSeeker(db);
      const b = await createSeeker(db);
      await db.asUser(a);
      expect(await db.count(`update profiles set full_name = 'Hacked' where id = $1`, [b])).toBe(0);
    }));

  it('a user cannot insert or delete profiles directly', () =>
    tx(async (db) => {
      const id = await createSeeker(db);
      await db.asUser(id);
      await db.expectError(
        `insert into profiles (id, role, email) values (gen_random_uuid(), 'admin', 'x@example.test')`,
        [],
        /permission denied/,
      );
      await db.expectError('delete from profiles where id = $1', [id], /permission denied/);
    }));
});
