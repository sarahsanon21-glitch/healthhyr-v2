// Employer jobs: draft create, edit and delete, the list, and close, reopen and cancel checkout.
// Uses the harness stand-in database, which emulates row-level security and the database guard and
// records every query. The same flows against the real Data API and the real database functions are
// in tests/integration/jobs.test.ts.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expectNoLeak, makeApp, v1, type TestApp } from './helpers/harness';

const JOBS = '/employer/jobs';

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

const employer = async (t: TestApp) => t.login('employer');

describe('who may use the jobs routes', () => {
  const calls: Array<[string, string, object | undefined]> = [
    ['get', JOBS, undefined],
    ['post', JOBS, NEW_JOB],
    ['get', `${JOBS}/${randomUUID()}`, undefined],
    ['put', `${JOBS}/${randomUUID()}`, NEW_JOB],
    ['delete', `${JOBS}/${randomUUID()}`, undefined],
    ['post', `${JOBS}/${randomUUID()}/close`, undefined],
    ['post', `${JOBS}/${randomUUID()}/reopen`, undefined],
    ['post', `${JOBS}/${randomUUID()}/cancel-checkout`, undefined],
  ];

  it.each(calls)('%s %s needs a token', async (method, path, body) => {
    const t = await makeApp();
    const res = await (request(t.app) as never as Record<string, (p: string) => request.Test>)[method]!(v1(path)).send(body);
    expect(res.status).toBe(401);
  });

  it.each(['seeker', 'admin'])('refuses a %s on every route, touching no job and changing nothing', async (role) => {
    const t = await makeApp();
    const owner = await employer(t);
    const job = t.addJob(owner.userId, { status: 'published' });
    const { authorization } = await t.login(role);
    for (const [method, path, body] of calls) {
      const real = path.replace(/[0-9a-f-]{36}/, job.id);
      const res = await (request(t.app) as never as Record<string, (p: string) => request.Test>)[method]!(v1(real)).set('Authorization', authorization).send(body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect(t.recorder.queries).toEqual([]);
    expect(t.recorder.transitions).toEqual([]);
    expect(t.jobs.get(job.id)!.status).toBe('published');
  });
});

describe('listing my jobs (the employer dashboard)', () => {
  it('returns only my jobs, newest change first, as summaries without the description, owner or payment', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const other = await employer(t);
    const older = t.addJob(me.userId, { title: 'Older', updated_at: '2026-01-01T00:00:00Z' });
    const newer = t.addJob(me.userId, { title: 'Newer', status: 'published', updated_at: '2026-03-01T00:00:00Z' });
    t.addJob(other.userId, { title: 'Not mine' });

    const res = await request(t.app).get(v1(JOBS)).set('Authorization', me.authorization);
    expect(res.status).toBe(200);
    expect(res.body.jobs.map((job: { id: string }) => job.id)).toEqual([newer.id, older.id]);
    for (const job of res.body.jobs) {
      expect(Object.keys(job).sort()).toEqual(
        ['careRole', 'city', 'createdAt', 'employmentType', 'expiresAt', 'id', 'publishedAt', 'state', 'status', 'title', 'updatedAt'].sort(),
      );
    }
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(me.userId);
    expect(text).not.toContain(newer.payment_id!);
    expect(text).not.toContain('Not mine');
  });

  it('is an empty list, not an error, when there are no jobs', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app).get(v1(JOBS)).set('Authorization', me.authorization);
    expect(res.body).toEqual({ jobs: [] });
  });

  it('asks the database for my own id, named columns, newest first, and at most 100', async () => {
    const t = await makeApp();
    const me = await employer(t);
    await request(t.app).get(v1(JOBS)).set('Authorization', me.authorization);
    const [query] = t.recorder.queries;
    expect(query).toMatchObject({ client: 'user', table: 'jobs', op: 'select', filters: [['employer_id', me.userId]], order: { column: 'updated_at', ascending: false }, limit: 100 });
    expect(query!.columns).not.toMatch(/\*|employer_id|payment_id/);
  });

  it('still lists only my jobs if the database stopped enforcing row-level security', async () => {
    const t = await makeApp({ db: { rls: false } });
    const me = await employer(t);
    const other = await employer(t);
    t.addJob(other.userId, { title: 'Not mine' });
    const mine = t.addJob(me.userId);
    const res = await request(t.app).get(v1(JOBS)).set('Authorization', me.authorization);
    expect(res.body.jobs.map((job: { id: string }) => job.id)).toEqual([mine.id]);
  });
});

describe('reading one job', () => {
  it('returns my job in full, with what is still missing before it could be published', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId, { title: 'Aide', description: 'Too short', pay_min: 20, pay_period: null });
    const res = await request(t.app).get(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: job.id,
      title: 'Aide',
      description: 'Too short',
      status: 'draft',
      payMin: 20,
      payMax: null,
      payPeriod: null,
      easyApply: true,
    });
    expect(res.body.missingFields.sort()).toEqual(['description', 'pay_period', 'title']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(me.userId);
    expect(text).not.toMatch(/employer_id|employerId|payment/);
  });

  it('a complete job has nothing missing', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    const res = await request(t.app).get(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization);
    expect(res.body.missingFields).toEqual([]);
  });

  it('another employer’s job is a 404, exactly like one that does not exist', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const other = await employer(t);
    const theirs = t.addJob(other.userId);
    const stranger = await request(t.app).get(v1(`${JOBS}/${theirs.id}`)).set('Authorization', me.authorization);
    const missing = await request(t.app).get(v1(`${JOBS}/${randomUUID()}`)).set('Authorization', me.authorization);
    expect(stranger.status).toBe(404);
    expect(stranger.body.error.code).toBe(missing.body.error.code);
    expect(stranger.body.error.message).toBe(missing.body.error.message);
  });

  it('also holds when the database stops enforcing row-level security: the code filters by my own id', async () => {
    const t = await makeApp({ db: { rls: false } });
    const me = await employer(t);
    const other = await employer(t);
    const theirs = t.addJob(other.userId);
    expect((await request(t.app).get(v1(`${JOBS}/${theirs.id}`)).set('Authorization', me.authorization)).status).toBe(404);
    expect(t.recorder.queries[0]!.filters).toEqual([
      ['id', theirs.id],
      ['employer_id', me.userId],
    ]);
  });

  it.each(['not-a-uuid', '123', '../me', 'null', '%00'])('an address that is not a job id (%s) is a 404 without asking the database', async (id) => {
    const t = await makeApp();
    const me = await employer(t);
    expect((await request(t.app).get(v1(`${JOBS}/${id}`)).set('Authorization', me.authorization)).status).toBe(404);
    expect(t.recorder.queries).toEqual([]);
  });

  it('a database failure is a generic 500 that leaks nothing', async () => {
    const t = await makeApp({ db: { jobError: { message: 'relation "jobs" does not exist', code: '42P01' } } });
    const me = await employer(t);
    const res = await request(t.app).get(v1(`${JOBS}/${randomUUID()}`)).set('Authorization', me.authorization);
    expect(res.status).toBe(500);
    expectNoLeak(res.body, ['"jobs"']);
  });
});

describe('creating a draft', () => {
  it('creates a draft owned by me and returns it', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send(NEW_JOB);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...NEW_JOB, status: 'draft', publishedAt: null, expiresAt: null });
    expect(res.body.missingFields).toEqual([]);
    const stored = t.jobs.get(res.body.id)!;
    expect(stored).toMatchObject({ employer_id: me.userId, status: 'draft', payment_id: null, published_at: null, expires_at: null });
  });

  it('sends only the content columns and my own id, never a status, payment or date', async () => {
    const t = await makeApp();
    const me = await employer(t);
    await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send(NEW_JOB);
    const insert = t.recorder.queries.find((q) => q.op === 'insert')!;
    expect(insert.client).toBe('user');
    expect(Object.keys(insert.values!).sort()).toEqual(
      ['care_role', 'city', 'description', 'easy_apply', 'employer_id', 'employment_type', 'pay_max', 'pay_min', 'pay_period', 'state', 'title', 'zip'].sort(),
    );
    expect(insert.values!.employer_id).toBe(me.userId);
  });

  it('optional fields left out or empty become null, text is trimmed, and easy apply defaults to on', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app)
      .post(v1(JOBS))
      .set('Authorization', me.authorization)
      .send({ title: '  Aide  ', description: ' Help. ', careRole: 'pca', employmentType: 'full_time', city: ' Fresno ', state: 'CA', zip: '', payMin: '', payPeriod: '' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Aide', description: 'Help.', city: 'Fresno', zip: null, payMin: null, payMax: null, payPeriod: null, easyApply: true });
    expect(res.body.missingFields.sort()).toEqual(['description', 'title']);
  });

  it('a draft may be unfinished: it is saved, and the response says what is missing', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: 'Aide', description: 'Short', payPeriod: null });
    expect(res.status).toBe(201);
    expect(res.body.missingFields.sort()).toEqual(['description', 'pay_period', 'title']);
  });

  it.each([
    ['no title', { title: '' }, 'title'],
    ['a whitespace title', { title: '   ' }, 'title'],
    ['a title over 120 characters', { title: 'x'.repeat(121) }, 'title'],
    ['a title with a line break', { title: 'Aide\nNurse' }, 'title'],
    ['a title with a control character', { title: 'Aide\u0001' }, 'title'],
    ['no description', { description: '' }, 'description'],
    ['a description over 10,000 characters', { description: 'x'.repeat(10001) }, 'description'],
    ['a description with a control character', { description: 'a\u0007b' }, 'description'],
    ['a role that does not exist', { careRole: 'surgeon' }, 'careRole'],
    ['no role', { careRole: undefined }, 'careRole'],
    ['an employment type that does not exist', { employmentType: 'gig' }, 'employmentType'],
    ['no city', { city: '' }, 'city'],
    ['a city over 100 characters', { city: 'x'.repeat(101) }, 'city'],
    ['no state', { state: '' }, 'state'],
    ['a state over 50 characters', { state: 'x'.repeat(51) }, 'state'],
    ['a bad ZIP code', { zip: '123' }, 'zip'],
    ['negative pay', { payMin: -1 }, 'payMin'],
    ['pay too large', { payMax: 100_000_000 }, 'payMax'],
    ['maximum pay below the minimum', { payMin: 30, payMax: 20 }, 'payMax'],
    ['a pay period that does not exist', { payPeriod: 'fortnight' }, 'payPeriod'],
    ['easy apply that is not true or false', { easyApply: 'yes' }, 'easyApply'],
  ])('refuses %s with a friendly message and saves nothing', async (_name, change, field) => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send({ ...NEW_JOB, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.issues.map((i: { path: string }) => i.path)).toContain(field);
    expect(t.recorder.queries.filter((q) => q.op === 'insert')).toEqual([]);
    expect(t.jobs.size).toBe(0);
  });

  it('accepts text exactly at its limits', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app)
      .post(v1(JOBS))
      .set('Authorization', me.authorization)
      .send({ ...NEW_JOB, title: 'x'.repeat(120), description: 'y'.repeat(10000), city: 'c'.repeat(100), state: 's'.repeat(50) });
    expect(res.status).toBe(201);
  });

  it('keeps line breaks and tabs in the description', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send({ ...NEW_JOB, description: 'Duties:\n- one\n\t- two' });
    expect(res.body.description).toBe('Duties:\n- one\n\t- two');
  });

  describe('an employer cannot set status, payment, dates or owner', () => {
    it.each([
      ['status', { status: 'published' }],
      ['status draft', { status: 'draft' }],
      ['payment_id', { payment_id: randomUUID() }],
      ['paymentId', { paymentId: randomUUID() }],
      ['published_at', { published_at: '2026-01-01T00:00:00Z' }],
      ['publishedAt', { publishedAt: '2026-01-01T00:00:00Z' }],
      ['expires_at', { expires_at: '2099-01-01T00:00:00Z' }],
      ['expiresAt', { expiresAt: '2099-01-01T00:00:00Z' }],
      ['employer_id', { employer_id: randomUUID() }],
      ['employerId', { employerId: randomUUID() }],
      ['id', { id: randomUUID() }],
      ['createdAt', { createdAt: '2020-01-01T00:00:00Z' }],
      ['an unknown field', { featured: true }],
    ])('refuses %s in the body and creates nothing', async (_name, extra) => {
      const t = await makeApp();
      const me = await employer(t);
      const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send({ ...NEW_JOB, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(t.recorder.queries.filter((q) => q.op === 'insert')).toEqual([]);
      expect(t.jobs.size).toBe(0);
    });
  });

  it('a value the database refuses despite the checks above is a friendly 400, not a 500', async () => {
    const t = await makeApp({ db: { jobError: { message: 'new row for relation "jobs" violates check constraint "jobs_title_ok"', code: '23514' } } });
    const me = await employer(t);
    const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).send(NEW_JOB);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expectNoLeak(res.body, ['jobs_title_ok', 'check constraint']);
  });

  it('a body that is not an object is refused', async () => {
    const t = await makeApp();
    const me = await employer(t);
    for (const body of [[], 'text', 5, null]) {
      const res = await request(t.app).post(v1(JOBS)).set('Authorization', me.authorization).set('Content-Type', 'application/json').send(JSON.stringify(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('editing a job', () => {
  it('saves the changes, keeps the status, and returns the saved job', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: 'Senior home health aide', payMax: 30 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: job.id, title: 'Senior home health aide', payMax: 30, status: 'draft' });
    expect(t.jobs.get(job.id)!.title).toBe('Senior home health aide');
  });

  it('sends only the content columns, filtered to the job and to my own id, never status, payment or dates', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send(NEW_JOB);
    const update = t.recorder.queries.find((q) => q.op === 'update')!;
    expect(Object.keys(update.values!).sort()).toEqual(
      ['care_role', 'city', 'description', 'easy_apply', 'employment_type', 'pay_max', 'pay_min', 'pay_period', 'state', 'title', 'zip'].sort(),
    );
    expect(update.filters).toEqual([
      ['id', job.id],
      ['employer_id', me.userId],
    ]);
  });

  it('a published job can be edited while it is live, and stays published with the same dates', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId, { status: 'published' });
    const before = { published_at: job.published_at, expires_at: job.expires_at, payment_id: job.payment_id };
    const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: 'Updated title' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(t.jobs.get(job.id)).toMatchObject(before);
  });

  it('another employer’s job is a 404 and nothing changes', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const other = await employer(t);
    const theirs = t.addJob(other.userId, { title: 'Theirs' });
    const res = await request(t.app).put(v1(`${JOBS}/${theirs.id}`)).set('Authorization', me.authorization).send(NEW_JOB);
    expect(res.status).toBe(404);
    expect(t.jobs.get(theirs.id)!.title).toBe('Theirs');
    expect(t.recorder.queries.some((q) => q.op === 'update')).toBe(false);
  });

  it('with row-level security off, the code still never touches another employer’s job', async () => {
    const t = await makeApp({ db: { rls: false } });
    const me = await employer(t);
    const other = await employer(t);
    const theirs = t.addJob(other.userId, { title: 'Theirs' });
    const res = await request(t.app).put(v1(`${JOBS}/${theirs.id}`)).set('Authorization', me.authorization).send(NEW_JOB);
    expect(res.status).toBe(404);
    expect(t.jobs.get(theirs.id)!.title).toBe('Theirs');
  });

  describe('required fields are locked while the job waits for payment', () => {
    it('refuses every edit with a clear message, and does not even try to write', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'pending_payment' });
      const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: 'Changed' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'job_locked', message: 'Cancel checkout before editing this job.' });
      expect(t.jobs.get(job.id)!.title).toBe('Home health aide');
      expect(t.recorder.queries.some((q) => q.op === 'update')).toBe(false);
    });

    it('is still a clear 409 if the database guard is what refuses (the job changed state between the check and the save)', async () => {
      const t = await makeApp({ db: { jobUpdateError: { message: 'cancel checkout before editing this job', code: 'P0001' } } });
      const me = await employer(t);
      const job = t.addJob(me.userId);
      const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send(NEW_JOB);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('job_locked');
    });

    it('editing works again once checkout is cancelled', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'pending_payment' });
      expect((await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send(NEW_JOB)).status).toBe(409);
      expect((await request(t.app).post(v1(`${JOBS}/${job.id}/cancel-checkout`)).set('Authorization', me.authorization)).status).toBe(200);
      expect((await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: 'Now editable' })).status).toBe(200);
    });
  });

  describe('an employer cannot set status, payment, dates or owner', () => {
    it.each([
      ['status', { status: 'published' }],
      ['payment_id', { payment_id: randomUUID() }],
      ['paymentId', { paymentId: randomUUID() }],
      ['published_at', { published_at: '2026-01-01T00:00:00Z' }],
      ['publishedAt', { publishedAt: '2026-01-01T00:00:00Z' }],
      ['expires_at', { expires_at: '2099-01-01T00:00:00Z' }],
      ['expiresAt', { expiresAt: '2099-01-01T00:00:00Z' }],
      ['employer_id', { employer_id: randomUUID() }],
    ])('refuses %s in the body and changes nothing', async (_name, extra) => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'published' });
      const before = { ...job };
      const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(t.recorder.queries.some((q) => q.op === 'update')).toBe(false);
      expect(t.jobs.get(job.id)).toEqual(before);
    });
  });

  it('invalid content is refused with a friendly message and the job is unchanged', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send({ ...NEW_JOB, title: '' });
    expect(res.status).toBe(400);
    expect(t.jobs.get(job.id)!.title).toBe('Home health aide');
  });

  it('a value the database refuses despite the checks is a friendly 400', async () => {
    const t = await makeApp({ db: { jobUpdateError: { message: 'violates check constraint "jobs_description_ok"', code: '23514' } } });
    const me = await employer(t);
    const job = t.addJob(me.userId);
    const res = await request(t.app).put(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization).send(NEW_JOB);
    expect(res.status).toBe(400);
    expectNoLeak(res.body, ['jobs_description_ok']);
  });
});

describe('deleting a draft', () => {
  it('deletes my draft', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    const res = await request(t.app).delete(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization);
    expect(res.status).toBe(204);
    expect(t.jobs.has(job.id)).toBe(false);
  });

  it.each(['pending_payment', 'published', 'closed', 'expired'] as const)('refuses to delete a %s job: close it instead', async (status) => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId, { status });
    const res = await request(t.app).delete(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('job_not_deletable');
    expect(t.jobs.has(job.id)).toBe(true);
    expect(t.recorder.queries.some((q) => q.op === 'delete')).toBe(false);
  });

  it('keeps a draft that has payment history (payment history is never deleted)', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId);
    t.paymentHistory.add(job.id);
    const res = await request(t.app).delete(v1(`${JOBS}/${job.id}`)).set('Authorization', me.authorization);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('This job has payment history, so it cannot be deleted.');
    expect(t.jobs.has(job.id)).toBe(true);
  });

  it('another employer’s draft is a 404 and is not deleted, even with row-level security off', async () => {
    for (const rls of [true, false]) {
      const t = await makeApp({ db: { rls } });
      const me = await employer(t);
      const other = await employer(t);
      const theirs = t.addJob(other.userId);
      const res = await request(t.app).delete(v1(`${JOBS}/${theirs.id}`)).set('Authorization', me.authorization);
      expect(res.status, `rls ${rls}`).toBe(404);
      expect(t.jobs.has(theirs.id)).toBe(true);
    }
  });
});

describe('closing, reopening and cancelling checkout (server-only operations)', () => {
  const act = (t: TestApp, authorization: string, id: string, action: 'close' | 'reopen' | 'cancel-checkout') =>
    request(t.app).post(v1(`${JOBS}/${id}/${action}`)).set('Authorization', authorization);

  it('closes a published job and returns it', async () => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId, { status: 'published' });
    const res = await act(t, me.authorization, job.id, 'close');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(t.recorder.transitions).toEqual([{ action: 'close', employerId: me.userId, jobId: job.id }]);
  });

  it.each(['draft', 'pending_payment', 'closed', 'expired'] as const)('refuses to close a %s job', async (status) => {
    const t = await makeApp();
    const me = await employer(t);
    const job = t.addJob(me.userId, { status });
    const res = await act(t, me.authorization, job.id, 'close');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('job_not_published');
    expect(t.jobs.get(job.id)!.status).toBe(status);
  });

  describe('reopen', () => {
    it('a closed job whose end date is still ahead goes back to published, with no payment and the same end date', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'closed' });
      const before = { expires_at: job.expires_at, payment_id: job.payment_id, published_at: job.published_at };
      const res = await act(t, me.authorization, job.id, 'reopen');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');
      expect(res.body.expiresAt).toBe(before.expires_at);
      expect(t.jobs.get(job.id)).toMatchObject(before);
    });

    it('a closed job past its end date goes back to a draft that needs a new payment', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'closed', expires_at: new Date(Date.now() - 86_400_000).toISOString() });
      const res = await act(t, me.authorization, job.id, 'reopen');
      expect(res.body).toMatchObject({ status: 'draft', publishedAt: null, expiresAt: null });
      expect(t.jobs.get(job.id)).toMatchObject({ payment_id: null, published_at: null, expires_at: null });
    });

    it('an expired job goes back to a draft that needs a new payment', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'expired', expires_at: new Date(Date.now() - 86_400_000).toISOString() });
      const res = await act(t, me.authorization, job.id, 'reopen');
      expect(res.body).toMatchObject({ status: 'draft', publishedAt: null, expiresAt: null });
      expect(t.jobs.get(job.id)!.payment_id).toBeNull();
    });

    it.each(['draft', 'pending_payment', 'published'] as const)('a %s job cannot be reopened', async (status) => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status });
      const res = await act(t, me.authorization, job.id, 'reopen');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('job_not_reopenable');
      expect(t.jobs.get(job.id)!.status).toBe(status);
    });
  });

  describe('cancel checkout', () => {
    it('returns a job that is waiting for payment to a draft', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status: 'pending_payment' });
      const res = await act(t, me.authorization, job.id, 'cancel-checkout');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('draft');
    });

    it.each(['draft', 'published', 'closed', 'expired'] as const)('a %s job is not waiting for payment', async (status) => {
      const t = await makeApp();
      const me = await employer(t);
      const job = t.addJob(me.userId, { status });
      const res = await act(t, me.authorization, job.id, 'cancel-checkout');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('not_waiting_for_payment');
    });
  });

  describe('a stranger is refused', () => {
    it.each(['close', 'reopen', 'cancel-checkout'] as const)('%s on another employer’s job is a 404 and changes nothing', async (action) => {
      const t = await makeApp();
      const me = await employer(t);
      const other = await employer(t);
      const status = action === 'cancel-checkout' ? 'pending_payment' : action === 'close' ? 'published' : 'closed';
      const theirs = t.addJob(other.userId, { status });
      const res = await act(t, me.authorization, theirs.id, action);
      expect(res.status).toBe(404);
      expect(t.jobs.get(theirs.id)!.status).toBe(status);
    });

    it('the operation always runs as the caller’s own id from the verified token, never an id from the request', async () => {
      const t = await makeApp();
      const me = await employer(t);
      const other = await employer(t);
      const job = t.addJob(me.userId, { status: 'published' });
      await request(t.app).post(v1(`${JOBS}/${job.id}/close`)).set('Authorization', me.authorization).send({ employerId: other.userId, employer_id: other.userId });
      expect(t.recorder.transitions).toEqual([{ action: 'close', employerId: me.userId, jobId: job.id }]);
    });

    it.each(['not-a-uuid', '123'])('a job id of %s is a 404 and no operation runs', async (id) => {
      const t = await makeApp();
      const me = await employer(t);
      for (const action of ['close', 'reopen', 'cancel-checkout'] as const) {
        expect((await act(t, me.authorization, id, action)).status).toBe(404);
      }
      expect(t.recorder.transitions).toEqual([]);
    });
  });
});
