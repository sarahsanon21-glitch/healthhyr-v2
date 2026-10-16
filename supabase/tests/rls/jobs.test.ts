import { describe, expect, it } from 'vitest';
import {
  LONG_DESCRIPTION,
  createAdmin,
  createEmployer,
  createJob,
  createPayment,
  createSeeker,
  ids,
  setCompanyName,
} from './fixtures';
import { tx } from './helpers';

describe('jobs: who can read what', () => {
  it('anon sees published, unexpired jobs of listed employers, and nothing else', () =>
    tx(async (db) => {
      const listed = await createEmployer(db, 'Sunrise Care');
      const unlisted = await createEmployer(db);
      const published = await createJob(db, listed, { status: 'published' });
      const draft = await createJob(db, listed, { status: 'draft' });
      const pending = await createJob(db, listed, { status: 'pending_payment' });
      const closed = await createJob(db, listed, { status: 'closed' });
      const expired = await createJob(db, listed, { status: 'expired', expiresInDays: -2 });
      const pastDue = await createJob(db, listed, { status: 'published', expiresInDays: -1 });
      const unlistedPublished = await createJob(db, unlisted, { status: 'published' });

      await db.asAnon();
      const visible = ids(await db.rows('select id from jobs'));
      expect(visible).toEqual([published]);
      for (const hidden of [draft, pending, closed, expired, pastDue, unlistedPublished]) {
        expect(visible).not.toContain(hidden);
      }
    }));

  it('a signed-in seeker sees the same public jobs as anon', () =>
    tx(async (db) => {
      const listed = await createEmployer(db, 'Sunrise Care');
      const seeker = await createSeeker(db);
      const published = await createJob(db, listed, { status: 'published' });
      await createJob(db, listed, { status: 'draft' });
      await db.asUser(seeker);
      expect(ids(await db.rows('select id from jobs'))).toEqual([published]);
    }));

  it('an employer sees all their own jobs, in every status', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      for (const status of ['draft', 'pending_payment', 'published', 'closed', 'expired'] as const) {
        await createJob(db, employer, { status, expiresInDays: status === 'expired' ? -3 : 30 });
      }
      await db.asUser(employer);
      expect(await db.count('select 1 from jobs')).toBe(5);
    }));

  it("an employer cannot see another employer's drafts or non-public jobs", () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      const draft = await createJob(db, a, { status: 'draft' });
      const closed = await createJob(db, a, { status: 'closed' });
      const published = await createJob(db, a, { status: 'published' });
      await db.asUser(b);
      const visible = ids(await db.rows('select id from jobs'));
      expect(visible).toEqual([published]);
      expect(visible).not.toContain(draft);
      expect(visible).not.toContain(closed);
    }));

  it('an admin sees every job', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const admin = await createAdmin(db);
      await createJob(db, employer, { status: 'draft' });
      await createJob(db, employer, { status: 'closed' });
      await db.asUser(admin);
      expect(await db.count('select 1 from jobs')).toBeGreaterThanOrEqual(2);
    }));

  it('a job disappears from the public as soon as its employer goes back to the default name', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      await createJob(db, employer, { status: 'published' });
      await db.asAnon();
      expect(await db.count('select 1 from jobs')).toBe(1);
      await setCompanyName(db, employer, 'My company');
      await db.asAnon();
      expect(await db.count('select 1 from jobs')).toBe(0);
    }));
});

describe('jobs: employer writes', () => {
  const insertJob = (employerId: string, extra = '', extraValue: unknown[] = []) => ({
    sql: `insert into jobs (employer_id, title, description, care_role, employment_type, city, state${extra ? ', ' + extra : ''})
          values ($1, 'Home health aide', $2, 'hha', 'part_time', 'Austin', 'TX'${extraValue.length ? ', $3' : ''}) returning id`,
    values: [employerId, LONG_DESCRIPTION, ...extraValue],
  });

  it('an employer can create a draft for themselves', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await db.asUser(employer);
      const { sql, values } = insertJob(employer);
      const job = await db.one(sql, values);
      const row = await db.one('select status, published_at, expires_at, payment_id from jobs where id = $1', [job.id]);
      expect(row).toEqual({ status: 'draft', published_at: null, expires_at: null, payment_id: null });
    }));

  it('an employer cannot create a job for another employer', () =>
    tx(async (db) => {
      const a = await createEmployer(db);
      const b = await createEmployer(db);
      await db.asUser(a);
      const { sql, values } = insertJob(b);
      await db.expectError(sql, values, /row-level security/);
    }));

  it('an employer cannot create a job that is already published', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      await db.asUser(employer);
      const { sql, values } = insertJob(employer, 'status', ['published']);
      await db.expectError(sql, values, /permission denied|must be drafts/);
    }));

  it('an employer cannot attach a payment or set dates on a new job', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      await db.asUser(employer);
      await db.expectError(
        `insert into jobs (employer_id, title, description, care_role, employment_type, city, state, expires_at)
         values ($1, 'Aide job', $2, 'hha', 'part_time', 'Austin', 'TX', now() + interval '90 days')`,
        [employer, LONG_DESCRIPTION],
        /permission denied|server-managed|must be drafts/,
      );
    }));

  it('a seeker and anon cannot create jobs', () =>
    tx(async (db) => {
      const seeker = await createSeeker(db);
      const employer = await createEmployer(db);
      const { sql, values } = insertJob(employer);
      await db.asUser(seeker);
      await db.expectError(sql, values, /row-level security|permission denied/);
      await db.asAnon();
      await db.expectError(sql, values, /permission denied|row-level security/);
    }));

  it('an employer can edit the content of a draft', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer, { status: 'draft' });
      await db.asUser(employer);
      await db.q(`update jobs set title = 'Senior home health aide', city = 'Dallas' where id = $1`, [job]);
      expect((await db.one('select title, city from jobs where id = $1', [job]))).toEqual({
        title: 'Senior home health aide',
        city: 'Dallas',
      });
    }));

  it('an employer can edit a live job for free', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { status: 'published' });
      await db.asUser(employer);
      await db.q(`update jobs set description = $2 where id = $1`, [job, LONG_DESCRIPTION + ' Updated.']);
      expect(await db.count(`select 1 from jobs where id = $1 and description like '%Updated.'`, [job])).toBe(1);
    }));

  it('an employer cannot change status, payment, dates or owner', () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      const job = await createJob(db, a, { status: 'draft' });
      const payment = await createPayment(db, a, job, { status: 'succeeded' });
      await db.asUser(a);
      for (const sql of [
        `update jobs set status = 'published' where id = $1`,
        `update jobs set payment_id = '${payment}' where id = $1`,
        `update jobs set published_at = now() where id = $1`,
        `update jobs set expires_at = now() + interval '365 days' where id = $1`,
        `update jobs set employer_id = '${b}' where id = $1`,
      ]) {
        await db.expectError(sql, [job], /permission denied|server-managed/);
      }
      await db.asSuperuser();
      expect((await db.one('select status, expires_at from jobs where id = $1', [job]))).toEqual({ status: 'draft', expires_at: null });
    }));

  it('content is locked while a job waits for payment, and open again after checkout is cancelled', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { status: 'pending_payment' });
      await createPayment(db, employer, job, { status: 'pending' });

      await db.asUser(employer);
      await db.expectError(`update jobs set title = 'Sneaky edit' where id = $1`, [job], /cancel checkout/);

      await db.asService();
      await db.q('select cancel_checkout($1, $2)', [job, employer]);

      await db.asUser(employer);
      await db.q(`update jobs set title = 'Allowed edit' where id = $1`, [job]);
      expect((await db.one('select title from jobs where id = $1', [job])).title).toBe('Allowed edit');
    }));

  it("an employer cannot edit another employer's job (no rows affected)", () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      const job = await createJob(db, a, { status: 'published' });
      await db.asUser(b);
      expect(await db.count(`update jobs set title = 'Hacked' where id = $1`, [job])).toBe(0);
    }));

  it('maximum pay below minimum is rejected', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer);
      await db.asUser(employer);
      await db.expectError(`update jobs set pay_min = 30, pay_max = 20, pay_period = 'hour' where id = $1`, [job], /check constraint/);
    }));

  it('only drafts with no payment history can be deleted, and only by their owner', () =>
    tx(async (db) => {
      const a = await createEmployer(db, 'Alpha Care');
      const b = await createEmployer(db, 'Beta Care');
      const draft = await createJob(db, a, { status: 'draft' });
      const published = await createJob(db, a, { status: 'published' });
      const paidDraft = await createJob(db, a, { status: 'draft' });
      await createPayment(db, a, paidDraft, { status: 'canceled' });

      await db.asUser(b);
      expect(await db.count('delete from jobs where id = $1', [draft])).toBe(0);

      await db.asUser(a);
      expect(await db.count('delete from jobs where id = $1', [published])).toBe(0);
      expect(await db.count('delete from jobs where id = $1', [paidDraft])).toBe(0);
      expect(await db.count('delete from jobs where id = $1', [draft])).toBe(1);
    }));
});
