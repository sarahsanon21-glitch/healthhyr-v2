import { describe, expect, it } from 'vitest';
import { createEmployer, createJob, createPayment, setCompanyName } from './fixtures';
import { tx, type Db } from './helpers';

/** A listed employer with a complete job waiting for payment, and a succeeded payment for it. */
async function readyToPublish(db: Db) {
  const employer = await createEmployer(db, 'Sunrise Care');
  const job = await createJob(db, employer, { status: 'pending_payment' });
  const payment = await createPayment(db, employer, job, { status: 'succeeded' });
  await db.asService();
  return { employer, job, payment };
}

const publish = (db: Db, job: string, payment: string) => db.attempt('select publish_job($1, $2)', [job, payment]);

describe('server-only functions refuse app roles', () => {
  it('authenticated and anon get permission denied', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      const calls = [
        ['select start_checkout($1, $2, 250)', [job, employer]],
        ['select cancel_checkout($1, $2)', [job, employer]],
        ['select publish_job($1, $1)', [job]],
        ['select close_job($1, $2)', [job, employer]],
        ['select reopen_job($1, $2)', [job, employer]],
        ['select expire_jobs()', []],
        ['select job_missing_fields($1)', [job]],
      ] as const;
      for (const as of ['user', 'anon'] as const) {
        if (as === 'user') await db.asUser(employer);
        else await db.asAnon();
        for (const [sql, values] of calls) await db.expectError(sql, [...values], /permission denied/);
      }
    }));
});

describe('job_missing_fields', () => {
  it('is empty for a complete job', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await db.asService();
      expect((await db.one('select job_missing_fields($1) as missing', [job])).missing).toEqual([]);
    }));

  it('names every incomplete field', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { title: 'Aide', description: 'Too short.' });
      await db.asService();
      await db.q(`update jobs set pay_min = 15 where id = $1`, [job]);
      const missing = (await db.one('select job_missing_fields($1) as missing', [job])).missing as string[];
      expect(missing.sort()).toEqual(['description', 'pay_period', 'title']);
    }));
});

describe('start_checkout', () => {
  it('creates a pending payment and moves the job to pending_payment', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await db.asService();
      const payment = (await db.one('select start_checkout($1, $2, 250) as id', [job, employer])).id;
      const row = await db.one('select status, amount_cents, employer_id from payments where id = $1', [payment]);
      expect(row).toEqual({ status: 'pending', amount_cents: 250, employer_id: employer });
      expect((await db.one('select status from jobs where id = $1', [job])).status).toBe('pending_payment');
    }));

  it('reuses the open payment when called twice', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await db.asService();
      const first = (await db.one('select start_checkout($1, $2, 250) as id', [job, employer])).id;
      const second = (await db.one('select start_checkout($1, $2, 250) as id', [job, employer])).id;
      expect(second).toBe(first);
      expect(await db.count('select 1 from payments where job_id = $1', [job])).toBe(1);
    }));

  it('refuses an employer whose company page is not listed yet', () =>
    tx(async (db) => {
      const employer = await createEmployer(db);
      const job = await createJob(db, employer);
      await db.asService();
      const result = await db.attempt('select start_checkout($1, $2, 250)', [job, employer]);
      expect(result).toMatchObject({ ok: false, code: 'HY002' });
      expect(!result.ok && result.error).toMatch(/employer_not_listed/);
      expect(await db.count('select 1 from payments where job_id = $1', [job])).toBe(0);
      expect((await db.one('select status from jobs where id = $1', [job])).status).toBe('draft');
    }));

  it('refuses a job that is already published, closed or expired', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      for (const status of ['published', 'closed', 'expired'] as const) {
        const job = await createJob(db, employer, { status, expiresInDays: status === 'expired' ? -2 : 30 });
        await db.asService();
        const result = await db.attempt('select start_checkout($1, $2, 250)', [job, employer]);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error).toMatch(/job_wrong_status/);
      }
    }));

  it('refuses an incomplete job and lists the missing fields', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { title: 'Aide', description: 'Short.' });
      await db.asService();
      const result = await db.attempt('select start_checkout($1, $2, 250)', [job, employer]);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/job_incomplete:(title,description|description,title)/);
    }));

  it("refuses someone else's job", () =>
    tx(async (db) => {
      const owner = await createEmployer(db, 'Alpha Care');
      const other = await createEmployer(db, 'Beta Care');
      const job = await createJob(db, owner);
      await db.asService();
      const result = await db.attempt('select start_checkout($1, $2, 250)', [job, other]);
      expect(!result.ok && result.error).toMatch(/job_not_found/);
    }));

  it('allows only one open payment per job', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await createPayment(db, employer, job, { status: 'pending' });
      await db.asService();
      await db.expectError(
        `insert into payments (employer_id, job_id, amount_cents, status) values ($1, $2, 250, 'pending')`,
        [employer, job],
        /duplicate key/,
      );
    }));
});

describe('cancel_checkout', () => {
  it('returns the job to draft and cancels the open payment', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await db.asService();
      await db.q('select start_checkout($1, $2, 250)', [job, employer]);
      await db.q('select cancel_checkout($1, $2)', [job, employer]);
      expect((await db.one('select status from jobs where id = $1', [job])).status).toBe('draft');
      expect((await db.one('select status from payments where job_id = $1', [job])).status).toBe('canceled');
    }));

  it('lets the employer start a fresh checkout afterwards', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer);
      await db.asService();
      const first = (await db.one('select start_checkout($1, $2, 250) as id', [job, employer])).id;
      await db.q('select cancel_checkout($1, $2)', [job, employer]);
      const second = (await db.one('select start_checkout($1, $2, 250) as id', [job, employer])).id;
      expect(second).not.toBe(first);
    }));

  it('is refused once the payment has succeeded', () =>
    tx(async (db) => {
      const { employer, job } = await readyToPublish(db);
      const result = await db.attempt('select cancel_checkout($1, $2)', [job, employer]);
      expect(result).toMatchObject({ ok: false, code: 'HY003' });
      expect(!result.ok && result.error).toMatch(/payment_succeeded/);
      expect((await db.one('select status from jobs where id = $1', [job])).status).toBe('pending_payment');
    }));

  it('is refused for a job that is not waiting for payment, and for another employer', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const other = await createEmployer(db, 'Beta Care');
      const draft = await createJob(db, employer);
      const pending = await createJob(db, employer, { status: 'pending_payment' });
      await db.asService();
      const wrongStatus = await db.attempt('select cancel_checkout($1, $2)', [draft, employer]);
      expect(!wrongStatus.ok && wrongStatus.error).toMatch(/job_not_pending_payment/);
      const wrongOwner = await db.attempt('select cancel_checkout($1, $2)', [pending, other]);
      expect(wrongOwner.ok).toBe(false);
      expect((await db.one('select status from jobs where id = $1', [pending])).status).toBe('pending_payment');
    }));
});

describe('publish_job', () => {
  it('publishes for 30 days, links the payment and marks it consumed', () =>
    tx(async (db) => {
      const { job, payment } = await readyToPublish(db);
      await db.q('select publish_job($1, $2)', [job, payment]);
      const row = await db.one(
        `select status, payment_id, published_at is not null as has_published,
                extract(epoch from (expires_at - published_at)) / 86400 as days
           from jobs where id = $1`,
        [job],
      );
      expect(row.status).toBe('published');
      expect(row.payment_id).toBe(payment);
      expect(row.has_published).toBe(true);
      expect(Number(row.days)).toBeCloseTo(30, 3);
      expect((await db.one('select consumed_at is not null as consumed from payments where id = $1', [payment])).consumed).toBe(true);
    }));

  it('refuses the same payment a second time, so republishing needs a new payment', () =>
    tx(async (db) => {
      const { job, payment } = await readyToPublish(db);
      await db.q('select publish_job($1, $2)', [job, payment]);
      await db.q('select close_job($1, (select employer_id from jobs where id = $1))', [job]);
      const employer = (await db.one('select employer_id from jobs where id = $1', [job])).employer_id as string;
      await db.q('select reopen_job($1, $2)', [job, employer]); // closed, still in its 30 days: no payment needed
      await db.q(`update jobs set status = 'expired', expires_at = now() - interval '1 day' where id = $1`, [job]);
      await db.q('select reopen_job($1, $2)', [job, employer]); // expired: back to draft
      await db.q(`update jobs set status = 'pending_payment' where id = $1`, [job]);

      const result = await publish(db, job, payment);
      expect(result).toMatchObject({ ok: false, code: 'HY001' });
      expect(!result.ok && result.error).toMatch(/payment_already_consumed/);
    }));

  it("refuses another job's payment", () =>
    tx(async (db) => {
      const { employer, job } = await readyToPublish(db);
      const otherJob = await createJob(db, employer, { status: 'pending_payment' });
      const otherPayment = await createPayment(db, employer, otherJob, { status: 'succeeded' });
      await db.asService();
      const result = await publish(db, job, otherPayment);
      expect(!result.ok && result.error).toMatch(/payment_not_for_job/);
    }));

  it('refuses a payment that has not succeeded', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { status: 'pending_payment' });
      for (const status of ['pending', 'failed', 'canceled', 'needs_review', 'refunded'] as const) {
        await db.asService();
        await db.q('delete from payments where job_id = $1', [job]);
        const payment = await createPayment(db, employer, job, { status });
        await db.asService();
        const result = await publish(db, job, payment);
        expect(result.ok, status).toBe(false);
        expect(!result.ok && result.error, status).toMatch(/payment_not_succeeded/);
      }
    }));

  it('refuses a job that is not waiting for payment', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      for (const status of ['draft', 'published', 'closed', 'expired'] as const) {
        const job = await createJob(db, employer, { status, expiresInDays: status === 'expired' ? -2 : 30 });
        const payment = await createPayment(db, employer, job, { status: 'succeeded' });
        await db.asService();
        const result = await publish(db, job, payment);
        expect(result.ok, status).toBe(false);
        expect(!result.ok && result.error, status).toMatch(/job_not_pending_payment/);
      }
    }));

  it('refuses an employer whose company is not listed', () =>
    tx(async (db) => {
      const { employer, job, payment } = await readyToPublish(db);
      await setCompanyName(db, employer, 'My company');
      await db.asService();
      const result = await publish(db, job, payment);
      expect(!result.ok && result.error).toMatch(/employer_not_listed/);
    }));

  it('refuses a job that was edited to be incomplete', () =>
    tx(async (db) => {
      const { job, payment } = await readyToPublish(db);
      await db.asService();
      await db.q(`update jobs set description = 'Short.' where id = $1`, [job]);
      const result = await publish(db, job, payment);
      expect(!result.ok && result.error).toMatch(/job_incomplete/);
    }));

  it('a refused publish leaves the payment unconsumed and the job untouched', () =>
    tx(async (db) => {
      const { employer, job, payment } = await readyToPublish(db);
      await setCompanyName(db, employer, 'My company');
      await db.asService();
      const result = await publish(db, job, payment);
      expect(result.ok).toBe(false);
      expect((await db.one('select consumed_at from payments where id = $1', [payment])).consumed_at).toBeNull();
      expect((await db.one('select status, payment_id from jobs where id = $1', [job]))).toEqual({
        status: 'pending_payment',
        payment_id: null,
      });
    }));

  it('one payment cannot be attached to two jobs', () =>
    tx(async (db) => {
      const { employer, job, payment } = await readyToPublish(db);
      await db.q('select publish_job($1, $2)', [job, payment]);
      const other = await createJob(db, employer);
      await db.asService();
      await db.expectError('update jobs set payment_id = $2 where id = $1', [other, payment], /duplicate key/);
    }));
});

describe('close_job and reopen_job', () => {
  it('close_job closes a published job and nothing else', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const published = await createJob(db, employer, { status: 'published' });
      const draft = await createJob(db, employer);
      await db.asService();
      await db.q('select close_job($1, $2)', [published, employer]);
      expect((await db.one('select status from jobs where id = $1', [published])).status).toBe('closed');
      const result = await db.attempt('select close_job($1, $2)', [draft, employer]);
      expect(result).toMatchObject({ ok: false, code: 'HY004' });
    }));

  it('reopening a closed job that has not expired republishes it with no payment and the same expires_at', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const job = await createJob(db, employer, { status: 'closed', expiresInDays: 12 });
      await db.asService();
      const before = await db.one('select expires_at, payment_id from jobs where id = $1', [job]);
      const status = (await db.one('select reopen_job($1, $2) as s', [job, employer])).s;
      expect(status).toBe('published');
      const after = await db.one('select status, expires_at, payment_id from jobs where id = $1', [job]);
      expect(after.status).toBe('published');
      expect(after.expires_at).toEqual(before.expires_at);
      expect(after.payment_id).toEqual(before.payment_id);
    }));

  it('reopening an expired job (or a closed one past its end date) returns it to draft and clears the payment', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const expired = await createJob(db, employer, { status: 'expired', expiresInDays: -3 });
      const closedPast = await createJob(db, employer, { status: 'closed', expiresInDays: -1 });
      await db.asService();
      for (const job of [expired, closedPast]) {
        expect((await db.one('select reopen_job($1, $2) as s', [job, employer])).s).toBe('draft');
        expect(await db.one('select status, payment_id, published_at, expires_at from jobs where id = $1', [job])).toEqual({
          status: 'draft',
          payment_id: null,
          published_at: null,
          expires_at: null,
        });
      }
    }));

  it('reopen is refused for published and draft jobs, and for someone else', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const other = await createEmployer(db, 'Beta Care');
      const published = await createJob(db, employer, { status: 'published' });
      const draft = await createJob(db, employer);
      const closed = await createJob(db, employer, { status: 'closed' });
      await db.asService();
      for (const job of [published, draft]) {
        expect(await db.attempt('select reopen_job($1, $2)', [job, employer])).toMatchObject({ ok: false, code: 'HY004' });
      }
      expect(await db.attempt('select reopen_job($1, $2)', [closed, other])).toMatchObject({ ok: false, code: 'HY004' });
    }));
});

describe('expire_jobs', () => {
  it('expires published jobs past their end date and leaves everything else alone', () =>
    tx(async (db) => {
      const employer = await createEmployer(db, 'Sunrise Care');
      const stale = await createJob(db, employer, { status: 'published', expiresInDays: -1 });
      const fresh = await createJob(db, employer, { status: 'published', expiresInDays: 10 });
      const closed = await createJob(db, employer, { status: 'closed', expiresInDays: -5 });
      const draft = await createJob(db, employer);
      await db.asService();
      const count = (await db.one('select expire_jobs() as n')).n;
      expect(count).toBe(1);
      const status = async (id: string) => (await db.one('select status from jobs where id = $1', [id])).status;
      expect(await status(stale)).toBe('expired');
      expect(await status(fresh)).toBe('published');
      expect(await status(closed)).toBe('closed');
      expect(await status(draft)).toBe('draft');
    }));
});
