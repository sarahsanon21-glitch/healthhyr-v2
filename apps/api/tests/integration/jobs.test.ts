// Employer jobs end to end: the real HealthHyr API, the real Data API with real tokens (so row-level
// security and the jobs guard apply), and the real server-only SQL functions (close_job, reopen_job,
// cancel_checkout) called with the local service-role key. Rows are read back with a separate
// database connection to prove what actually changed.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type RunningApi } from './app';
import { supabaseEnv } from './env';
import { callApi, createPerson, deleteCreatedPeople, type CallOptions, type Person } from './people';

const { databaseUrl } = supabaseEnv();
const db = new pg.Client({ connectionString: databaseUrl });

let api: RunningApi;
let employerA: Person;
let employerB: Person;
let seeker: Person;

const call = (path: string, options: CallOptions = {}) => callApi(api.url, path, options);

const NEW_JOB = {
  title: 'Home health aide',
  description: 'Support clients with daily living activities in their homes across the county, including meals.',
  careRole: 'hha',
  employmentType: 'part_time',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  payMin: 18,
  payMax: 22.5,
  payPeriod: 'hour',
  easyApply: true,
};

type Status = 'draft' | 'pending_payment' | 'published' | 'expired' | 'closed';

/** Inserts a job in any state, as the service role (the way the server's own code would). */
async function insertJob(employerId: string, status: Status = 'draft', expiresInDays = 30): Promise<string> {
  const live = status === 'published' || status === 'closed' || status === 'expired';
  const payment = live ? (await db.query(`select gen_random_uuid() as id`)).rows[0].id : null;
  if (payment) {
    // a succeeded, consumed payment is what a live job always has
    // (the job row is inserted first, so the payment is attached after)
  }
  const job = await db.query(
    `insert into public.jobs (employer_id, title, description, care_role, employment_type, city, state, status, published_at, expires_at)
     values ($1, 'Seeded job', $2, 'hha', 'part_time', 'Austin', 'TX', $3,
             case when $4 then now() - interval '1 day' end,
             case when $4 then now() + make_interval(days => $5) end)
     returning id`,
    [employerId, NEW_JOB.description, status, live, expiresInDays],
  );
  const id = (job.rows[0] as { id: string }).id;
  if (live) {
    const paid = await db.query(
      `insert into public.payments (employer_id, job_id, amount_cents, status, consumed_at) values ($1, $2, 250, 'succeeded', now()) returning id`,
      [employerId, id],
    );
    await db.query('update public.jobs set payment_id = $2 where id = $1', [id, (paid.rows[0] as { id: string }).id]);
  }
  return id;
}

const row = async (id: string) =>
  (await db.query('select status, payment_id, published_at, expires_at, title, employer_id from public.jobs where id = $1', [id])).rows[0] as
    | { status: Status; payment_id: string | null; published_at: Date | null; expires_at: Date | null; title: string; employer_id: string }
    | undefined;

beforeAll(async () => {
  await db.connect();
  // Setup writes act as the service role, like the API's own server-side code would.
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  api = await startApi();
  employerA = await createPerson('jobs-employer-a', 'employer');
  employerB = await createPerson('jobs-employer-b', 'employer');
  seeker = await createPerson('jobs-seeker', 'seeker');
});

afterAll(async () => {
  await api?.close();
  await deleteCreatedPeople(db, 'jobs-');
  await db.end();
});

describe('access', () => {
  it('needs a token, and refuses a seeker', async () => {
    expect((await call('/employer/jobs')).status).toBe(401);
    expect((await call('/employer/jobs', { token: seeker.token })).status).toBe(403);
    expect((await call('/employer/jobs', { token: `${employerA.token}x` })).status).toBe(401);
  });
});

describe('create, read, edit and delete a draft', () => {
  let id = '';

  it('creates a draft owned by the caller, with no payment or dates', async () => {
    const res = await call('/employer/jobs', { token: employerA.token, method: 'POST', body: NEW_JOB });
    expect(res.status).toBe(201);
    id = res.body.id as string;
    expect(res.body).toMatchObject({ title: NEW_JOB.title, status: 'draft', zip: '78701', payMin: 18, payMax: 22.5, payPeriod: 'hour' });
    expect(res.body.missingFields).toEqual([]);
    expect(await row(id)).toMatchObject({ status: 'draft', payment_id: null, published_at: null, expires_at: null, employer_id: employerA.id });
  });

  it('an unfinished draft is saved, and says what is missing', async () => {
    const res = await call('/employer/jobs', { token: employerA.token, method: 'POST', body: { ...NEW_JOB, title: 'Aide', description: 'Short', payPeriod: null } });
    expect(res.status).toBe(201);
    expect((res.body.missingFields as string[]).sort()).toEqual(['description', 'pay_period', 'title']);
  });

  it('refuses status, payment, dates and owner, and creates nothing', async () => {
    const before = (await db.query('select count(*)::int n from public.jobs where employer_id = $1', [employerA.id])).rows[0].n;
    for (const extra of [{ status: 'published' }, { paymentId: 'x' }, { publishedAt: '2026-01-01T00:00:00Z' }, { expiresAt: '2099-01-01T00:00:00Z' }, { employerId: employerB.id }, { employer_id: employerB.id }]) {
      const res = await call('/employer/jobs', { token: employerA.token, method: 'POST', body: { ...NEW_JOB, ...extra } });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect((await db.query('select count(*)::int n from public.jobs where employer_id = $1', [employerA.id])).rows[0].n).toBe(before);
  });

  it('refuses oversized values with a friendly message', async () => {
    const res = await call('/employer/jobs', { token: employerA.token, method: 'POST', body: { ...NEW_JOB, title: 'x'.repeat(121), description: 'y'.repeat(10001) } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'validation_error' });
  });

  it('lists the caller’s jobs only, and reads one in full', async () => {
    const list = await call('/employer/jobs', { token: employerA.token });
    expect(list.status).toBe(200);
    const jobs = list.body.jobs as Array<{ id: string }>;
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.some((job) => job.id === id)).toBe(true);
    const bList = await call('/employer/jobs', { token: employerB.token });
    expect(bList.body.jobs).toEqual([]);

    const one = await call(`/employer/jobs/${id}`, { token: employerA.token });
    expect(one.status).toBe(200);
    expect(one.body.description).toBe(NEW_JOB.description);
    expect(JSON.stringify(one.body)).not.toContain(employerA.id);
  });

  it('edits the draft; the status and dates do not change', async () => {
    const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'PUT', body: { ...NEW_JOB, title: 'Senior home health aide', payMax: 30 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Senior home health aide', payMax: 30, status: 'draft' });
    expect(await row(id)).toMatchObject({ title: 'Senior home health aide', status: 'draft', payment_id: null });
  });

  it('refuses edits that name status, payment, dates or owner, and changes nothing', async () => {
    const before = await row(id);
    for (const extra of [{ status: 'published' }, { payment_id: 'x' }, { published_at: '2026-01-01T00:00:00Z' }, { expiresAt: '2099-01-01T00:00:00Z' }, { employer_id: employerB.id }]) {
      const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'PUT', body: { ...NEW_JOB, ...extra } });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(await row(id)).toEqual(before);
  });

  it('deletes the draft', async () => {
    const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await row(id)).toBeUndefined();
  });
});

describe('a stranger is refused', () => {
  let id = '';

  beforeAll(async () => {
    id = await insertJob(employerA.id, 'draft');
  });

  it('employer B cannot read, edit, delete, close, reopen or cancel checkout of employer A’s job', async () => {
    const before = await row(id);
    expect((await call(`/employer/jobs/${id}`, { token: employerB.token })).status).toBe(404);
    expect((await call(`/employer/jobs/${id}`, { token: employerB.token, method: 'PUT', body: { ...NEW_JOB, title: 'Hijacked' } })).status).toBe(404);
    expect((await call(`/employer/jobs/${id}`, { token: employerB.token, method: 'DELETE' })).status).toBe(404);
    for (const action of ['close', 'reopen', 'cancel-checkout']) {
      expect((await call(`/employer/jobs/${id}/${action}`, { token: employerB.token, method: 'POST' })).status, action).toBe(404);
    }
    expect(await row(id)).toEqual(before);
  });

  it('it answers exactly like a job that does not exist', async () => {
    const stranger = await call(`/employer/jobs/${id}`, { token: employerB.token });
    const missing = await call('/employer/jobs/00000000-0000-4000-8000-000000000000', { token: employerB.token });
    expect(stranger.status).toBe(404);
    expect(stranger.body.error).toMatchObject({ code: (missing.body.error as { code: string }).code, message: (missing.body.error as { message: string }).message });
  });
});

describe('delete rules', () => {
  it.each(['pending_payment', 'published', 'closed', 'expired'] as const)('a %s job cannot be deleted', async (status) => {
    const id = await insertJob(employerA.id, status, status === 'expired' ? -2 : 30);
    const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'job_not_deletable' });
    expect(await row(id)).toBeDefined();
  });

  it('a draft with payment history (a cancelled checkout) cannot be deleted', async () => {
    const id = await insertJob(employerA.id, 'draft');
    await db.query(`insert into public.payments (employer_id, job_id, amount_cents, status) values ($1, $2, 250, 'canceled')`, [employerA.id, id]);
    const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(await row(id)).toBeDefined();
  });
});

describe('required fields are locked while a job waits for payment', () => {
  it('editing is refused with a clear message, nothing changes, and cancelling checkout unlocks it', async () => {
    const id = await insertJob(employerA.id, 'pending_payment');
    const payment = await db.query(`insert into public.payments (employer_id, job_id, amount_cents, status) values ($1, $2, 250, 'pending') returning id`, [employerA.id, id]);
    const paymentId = (payment.rows[0] as { id: string }).id;

    const locked = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'PUT', body: { ...NEW_JOB, title: 'Changed while waiting' } });
    expect(locked.status).toBe(409);
    expect(locked.body.error).toMatchObject({ code: 'job_locked', message: 'Cancel checkout before editing this job.' });
    expect((await row(id))!.title).toBe('Seeded job');

    const cancelled = await call(`/employer/jobs/${id}/cancel-checkout`, { token: employerA.token, method: 'POST' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('draft');
    expect((await row(id))!.status).toBe('draft');
    expect((await db.query('select status from public.payments where id = $1', [paymentId])).rows[0]).toEqual({ status: 'canceled' });

    const edited = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'PUT', body: { ...NEW_JOB, title: 'Editable again' } });
    expect(edited.status).toBe(200);
    expect((await row(id))!.title).toBe('Editable again');
  });

  it('cancel checkout is refused for a job that is not waiting for payment, and once the payment has gone through', async () => {
    const draft = await insertJob(employerA.id, 'draft');
    const res = await call(`/employer/jobs/${draft}/cancel-checkout`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'not_waiting_for_payment' });

    const paid = await insertJob(employerA.id, 'pending_payment');
    await db.query(`insert into public.payments (employer_id, job_id, amount_cents, status) values ($1, $2, 250, 'succeeded')`, [employerA.id, paid]);
    const refused = await call(`/employer/jobs/${paid}/cancel-checkout`, { token: employerA.token, method: 'POST' });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'payment_succeeded' });
    expect((await row(paid))!.status).toBe('pending_payment');
  });
});

describe('close', () => {
  it('closes a published job', async () => {
    const id = await insertJob(employerA.id, 'published');
    const res = await call(`/employer/jobs/${id}/close`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect((await row(id))!.status).toBe('closed');
  });

  it.each(['draft', 'pending_payment', 'closed', 'expired'] as const)('a %s job cannot be closed', async (status) => {
    const id = await insertJob(employerA.id, status, status === 'expired' ? -2 : 30);
    const res = await call(`/employer/jobs/${id}/close`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'job_not_published' });
    expect((await row(id))!.status).toBe(status);
  });
});

describe('reopen', () => {
  it('a closed job whose end date is ahead goes back to published: no payment, same end date', async () => {
    const id = await insertJob(employerA.id, 'closed', 10);
    const before = (await row(id))!;
    const res = await call(`/employer/jobs/${id}/reopen`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    const after = (await row(id))!;
    expect(after.status).toBe('published');
    expect(after.expires_at).toEqual(before.expires_at);
    expect(after.payment_id).toBe(before.payment_id);
    expect(after.published_at).toEqual(before.published_at);
    const payments = await db.query('select count(*)::int n from public.payments where job_id = $1', [id]);
    expect(payments.rows[0]).toEqual({ n: 1 }); // no new payment was made
  });

  it('an expired job goes back to a draft that needs a new payment', async () => {
    const id = await insertJob(employerA.id, 'expired', -3);
    const res = await call(`/employer/jobs/${id}/reopen`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'draft', publishedAt: null, expiresAt: null });
    expect(await row(id)).toMatchObject({ status: 'draft', payment_id: null, published_at: null, expires_at: null });
  });

  it('a closed job past its end date goes back to a draft that needs a new payment', async () => {
    const id = await insertJob(employerA.id, 'closed', -1);
    const res = await call(`/employer/jobs/${id}/reopen`, { token: employerA.token, method: 'POST' });
    expect(res.body).toMatchObject({ status: 'draft', publishedAt: null, expiresAt: null });
    expect(await row(id)).toMatchObject({ status: 'draft', payment_id: null });
  });

  it.each(['draft', 'pending_payment', 'published'] as const)('a %s job cannot be reopened', async (status) => {
    const id = await insertJob(employerA.id, status);
    const res = await call(`/employer/jobs/${id}/reopen`, { token: employerA.token, method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'job_not_reopenable' });
    expect((await row(id))!.status).toBe(status);
  });

  it('the status cannot be changed to published or draft by editing', async () => {
    const id = await insertJob(employerA.id, 'closed', 10);
    const res = await call(`/employer/jobs/${id}`, { token: employerA.token, method: 'PUT', body: { ...NEW_JOB, status: 'published' } });
    expect(res.status).toBe(400);
    expect((await row(id))!.status).toBe('closed');
  });
});
