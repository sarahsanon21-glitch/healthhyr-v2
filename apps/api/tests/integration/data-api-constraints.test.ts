// Direct PATCH and POST requests to the REAL Data API with REAL user tokens, sending oversized and
// dangerous values and values the server decides. This is the attack the HealthHyr API cannot stop,
// because a signed-in person holding their own token can skip the API entirely. The database itself
// must refuse (migration 0002 CHECK constraints, column privileges, the jobs guard), and each test
// then reads the row back to prove nothing was written.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseEnv } from './env';
import { createPerson, deleteCreatedPeople, rest, type Person } from './people';

const { databaseUrl } = supabaseEnv();
const db = new pg.Client({ connectionString: databaseUrl });

let employer: Person;
let seeker: Person;
let jobId = '';

const x = (n: number) => 'x'.repeat(n);

/** The database's answer when a CHECK constraint refuses a value. */
const CHECK_VIOLATION = '23514';
const code = (json: unknown): string | undefined => (json as { code?: string } | null)?.code;
const message = (json: unknown): string => (json as { message?: string } | null)?.message ?? '';

async function column(table: string, col: string, id: string, idColumn = 'id'): Promise<unknown> {
  const result = await db.query(`select ${col} as v from public.${table} where ${idColumn} = $1`, [id]);
  return (result.rows[0] as { v: unknown } | undefined)?.v;
}

async function patch(table: string, id: string, token: string, body: object, idColumn = 'id') {
  return rest(`${table}?${idColumn}=eq.${id}`, { token, method: 'PATCH', body });
}

beforeAll(async () => {
  await db.connect();
  // Setup writes act as the service role, like the API's own server-side code would.
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  employer = await createPerson('constraints-employer', 'employer');
  seeker = await createPerson('constraints-seeker', 'seeker');
  const job = await db.query(
    `insert into public.jobs (employer_id, title, description, care_role, employment_type, city, state)
     values ($1, 'Home health aide', 'Original description', 'hha', 'part_time', 'Austin', 'TX') returning id`,
    [employer.id],
  );
  jobId = (job.rows[0] as { id: string }).id;
});

afterAll(async () => {
  await deleteCreatedPeople(db, 'constraints');
  await db.end();
});

describe('employer_profiles: direct PATCH with oversized, dangerous or malformed values', () => {
  it.each([
    ['company_name', 121, 'employer_profiles_company_name_ok'],
    ['description', 5001, 'employer_profiles_description_ok'],
    ['industry', 101, 'employer_profiles_industry_ok'],
    ['city', 101, 'employer_profiles_city_ok'],
    ['state', 51, 'employer_profiles_state_ok'],
  ])('%s with %d characters is refused by the database, and nothing is written', async (col, length, constraint) => {
    const before = await column('employer_profiles', col, employer.id);
    const res = await patch('employer_profiles', employer.id, employer.token, { [col]: x(length) });
    expect(res.status).toBe(400);
    expect(code(res.json)).toBe(CHECK_VIOLATION);
    expect(message(res.json)).toContain(constraint);
    expect(await column('employer_profiles', col, employer.id)).toEqual(before);
  });

  it.each(['website', 'logo_url'])('%s refuses javascript:, data:, protocol-relative, relative and spaced addresses', async (col) => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', '//evil.example', 'evil.example', 'https:// evil.example', `https://evil.example/${x(2100)}`]) {
      const res = await patch('employer_profiles', employer.id, employer.token, { [col]: bad });
      expect(res.status, bad.slice(0, 40)).toBe(400);
      expect(code(res.json), bad.slice(0, 40)).toBe(CHECK_VIOLATION);
    }
    expect(await column('employer_profiles', col, employer.id)).toBeNull();
  });

  it('control characters and line breaks are refused in single-line fields', async () => {
    for (const bad of ['a\u0001b', 'a\nb', 'a\u007fb', 'a\u001bb']) {
      const res = await patch('employer_profiles', employer.id, employer.token, { company_name: bad });
      expect(res.status).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
    expect(await column('employer_profiles', 'company_name', employer.id)).toBe('My company');
  });

  it('a company size that is not on the list is refused', async () => {
    const res = await patch('employer_profiles', employer.id, employer.token, { company_size: '5000 people' });
    expect(res.status).toBe(400);
    expect(code(res.json)).toBe(CHECK_VIOLATION);
  });

  it('good values are accepted, so the constraints are not just refusing everything', async () => {
    const res = await patch('employer_profiles', employer.id, employer.token, {
      description: 'Care at home.\nSecond line.',
      website: 'https://alpha.example.org/about?x=1',
      logo_url: 'http://alpha.example.org/logo.png',
      industry: 'Home health',
      company_size: '11-50',
      city: 'Fresno',
      state: 'CA',
    });
    expect(res.status).toBe(200);
    expect(await column('employer_profiles', 'website', employer.id)).toBe('https://alpha.example.org/about?x=1');
    // put the row back so later tests start from the same place
    await patch('employer_profiles', employer.id, employer.token, { description: null, website: null, logo_url: null, industry: null, company_size: null, city: null, state: null });
  });
});

describe('profiles and the seeker tables: direct PATCH and POST', () => {
  it('profiles.full_name over 100 characters, or with a line break, is refused', async () => {
    for (const bad of [x(101), 'a\nb']) {
      const res = await patch('profiles', seeker.id, seeker.token, { full_name: bad });
      expect(res.status).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
  });

  it.each([
    ['display_name', 101],
    ['headline', 151],
    ['summary', 3001],
    ['city', 101],
    ['state', 51],
  ])('seeker_profiles.%s with %d characters is refused', async (col, length) => {
    const before = await column('seeker_profiles', col, seeker.id);
    const res = await patch('seeker_profiles', seeker.id, seeker.token, { [col]: x(length) });
    expect(res.status).toBe(400);
    expect(code(res.json)).toBe(CHECK_VIOLATION);
    expect(await column('seeker_profiles', col, seeker.id)).toEqual(before);
  });

  it('seeker_profiles.avatar_url refuses javascript: and data: addresses', async () => {
    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'ftp://x.org/a.png']) {
      const res = await patch('seeker_profiles', seeker.id, seeker.token, { avatar_url: bad });
      expect(res.status, bad).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
    expect(await column('seeker_profiles', 'avatar_url', seeker.id)).toBeNull();
  });

  it('seeker_private: a malformed phone or ZIP, and a resume path that is an address or script, are refused', async () => {
    for (const body of [{ phone: 'call me maybe' }, { phone: x(21) }, { zip: 'ABCDE' }, { zip: '123456' }, { resume_url: 'javascript:alert(1)' }, { resume_url: 'https://evil.example/cv.pdf' }, { resume_url: x(513) }]) {
      const res = await patch('seeker_private', seeker.id, seeker.token, body);
      expect(res.status, JSON.stringify(body).slice(0, 50)).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
    const row = await db.query('select phone, zip, resume_url from public.seeker_private where id = $1', [seeker.id]);
    expect(row.rows[0]).toEqual({ phone: null, zip: null, resume_url: null });
  });

  it('seeker_experience POST: oversized title, employer, city, state and description are each refused', async () => {
    const ok = { seeker_id: seeker.id, title: 'Aide', employer: 'Sunrise', start_date: '2020-01-01' };
    for (const [col, length] of [['title', 121], ['employer', 121], ['city', 101], ['state', 51], ['description', 2001]] as const) {
      const res = await rest('seeker_experience', { token: seeker.token, method: 'POST', body: { ...ok, [col]: x(length) } });
      expect(res.status, col).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
    const count = await db.query('select count(*)::int n from public.seeker_experience where seeker_id = $1', [seeker.id]);
    expect(count.rows[0]).toEqual({ n: 0 });
    // and a good one goes in
    expect((await rest('seeker_experience', { token: seeker.token, method: 'POST', body: ok })).status).toBe(201);
  });

  it('seeker_certifications and seeker_languages POST: oversized or multi-line text is refused', async () => {
    for (const body of [{ seeker_id: seeker.id, name: x(121) }, { seeker_id: seeker.id, name: 'CPR', issuer: x(121) }, { seeker_id: seeker.id, name: 'a\nb' }]) {
      const res = await rest('seeker_certifications', { token: seeker.token, method: 'POST', body });
      expect(res.status).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
    for (const language of [x(61), 'Span\u0001ish']) {
      const res = await rest('seeker_languages', { token: seeker.token, method: 'POST', body: { seeker_id: seeker.id, language } });
      expect(res.status).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
  });
});

describe('jobs: direct POST and PATCH with oversized or dangerous values', () => {
  const newJob = (extra: object = {}) => ({
    employer_id: employer.id,
    title: 'Aide',
    description: 'Duties',
    care_role: 'hha',
    employment_type: 'part_time',
    city: 'Austin',
    state: 'TX',
    ...extra,
  });

  it.each([
    ['title', 121, 'jobs_title_ok'],
    ['description', 10001, 'jobs_description_ok'],
    ['city', 101, 'jobs_city_ok'],
    ['state', 51, 'jobs_state_ok'],
  ])('POST with %s of %d characters is refused', async (col, length, constraint) => {
    const res = await rest('jobs', { token: employer.token, method: 'POST', body: newJob({ [col]: x(length) }) });
    expect(res.status).toBe(400);
    expect(code(res.json)).toBe(CHECK_VIOLATION);
    expect(message(res.json)).toContain(constraint);
  });

  it.each([
    ['title', 121],
    ['description', 10001],
    ['city', 101],
    ['state', 51],
  ])('PATCH %s to %d characters is refused and the job is unchanged', async (col, length) => {
    const before = await column('jobs', col, jobId);
    const res = await patch('jobs', jobId, employer.token, { [col]: x(length) });
    expect(res.status).toBe(400);
    expect(code(res.json)).toBe(CHECK_VIOLATION);
    expect(await column('jobs', col, jobId)).toEqual(before);
  });

  it('a bad ZIP, a control character and negative pay are refused', async () => {
    for (const body of [{ zip: '<script>' }, { zip: '123' }, { title: 'a\u0001b' }, { title: 'a\nb' }, { pay_min: -5 }, { pay_max: -0.01 }]) {
      const res = await patch('jobs', jobId, employer.token, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(code(res.json)).toBe(CHECK_VIOLATION);
    }
  });

  it('a good job is accepted: line breaks are fine in the description', async () => {
    const res = await patch('jobs', jobId, employer.token, { description: 'Duties:\n- one\n- two' });
    expect(res.status).toBe(200);
    expect(await column('jobs', 'description', jobId)).toBe('Duties:\n- one\n- two');
  });
});

describe('jobs: an employer cannot set status, payment, dates or owner, even directly', () => {
  it.each([
    ['status', { status: 'published' }],
    ['status back to draft', { status: 'draft' }],
    ['payment_id', { payment_id: randomUUID() }],
    ['published_at', { published_at: '2026-01-01T00:00:00Z' }],
    ['expires_at', { expires_at: '2099-01-01T00:00:00Z' }],
    ['employer_id', { employer_id: randomUUID() }],
    ['id', { id: randomUUID() }],
  ])('PATCH %s is refused and the job is unchanged', async (_name, body) => {
    const before = await db.query('select status, payment_id, published_at, expires_at, employer_id, id from public.jobs where id = $1', [jobId]);
    const res = await patch('jobs', jobId, employer.token, body);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await db.query('select status, payment_id, published_at, expires_at, employer_id, id from public.jobs where id = $1', [jobId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it.each([
    ['status published', { status: 'published', published_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z' }],
    ['status pending_payment', { status: 'pending_payment' }],
    ['a payment id', { payment_id: randomUUID() }],
    ['dates', { published_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z' }],
  ])('POST with %s is refused and no job is created', async (_name, extra) => {
    const title = `direct-${randomUUID()}`;
    const res = await rest('jobs', {
      token: employer.token,
      method: 'POST',
      body: { employer_id: employer.id, title, description: 'd', care_role: 'hha', employment_type: 'part_time', city: 'Austin', state: 'TX', ...extra },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const found = await db.query('select count(*)::int n from public.jobs where title = $1', [title]);
    expect(found.rows[0]).toEqual({ n: 0 });
  });

  it('POST for another employer is refused by row-level security', async () => {
    const other = await createPerson('constraints-other', 'employer');
    const title = `not-mine-${randomUUID()}`;
    const res = await rest('jobs', {
      token: employer.token,
      method: 'POST',
      body: { employer_id: other.id, title, description: 'd', care_role: 'hha', employment_type: 'part_time', city: 'A', state: 'B' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const found = await db.query('select count(*)::int n from public.jobs where title = $1', [title]);
    expect(found.rows[0]).toEqual({ n: 0 });
  });
});

describe('jobs: required fields are locked while a job waits for payment', () => {
  it('a direct PATCH of any content column is refused, and the job is unchanged', async () => {
    const pending = await db.query(
      `insert into public.jobs (employer_id, title, description, care_role, employment_type, city, state, status)
       values ($1, 'Waiting job', 'Waiting description', 'hha', 'part_time', 'Austin', 'TX', 'pending_payment') returning id`,
      [employer.id],
    );
    const id = (pending.rows[0] as { id: string }).id;
    for (const body of [{ title: 'Changed' }, { description: 'Changed' }, { city: 'Dallas' }, { state: 'NY' }, { zip: '78701' }, { pay_min: 10 }, { easy_apply: false }]) {
      const res = await patch('jobs', id, employer.token, body);
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(message(res.json)).toContain('cancel checkout');
    }
    const row = await db.query('select title, description, city, state, zip, pay_min, easy_apply from public.jobs where id = $1', [id]);
    expect(row.rows[0]).toEqual({ title: 'Waiting job', description: 'Waiting description', city: 'Austin', state: 'TX', zip: null, pay_min: null, easy_apply: true });
  });

  it('it cannot be deleted while waiting for payment, and a draft with payment history cannot be deleted either', async () => {
    const waiting = await db.query(
      `insert into public.jobs (employer_id, title, description, care_role, employment_type, city, state, status)
       values ($1, 'Cannot delete me', 'd', 'hha', 'part_time', 'Austin', 'TX', 'pending_payment') returning id`,
      [employer.id],
    );
    const waitingId = (waiting.rows[0] as { id: string }).id;
    const draft = await db.query(
      `insert into public.jobs (employer_id, title, description, care_role, employment_type, city, state)
       values ($1, 'Has history', 'd', 'hha', 'part_time', 'Austin', 'TX') returning id`,
      [employer.id],
    );
    const draftId = (draft.rows[0] as { id: string }).id;
    await db.query(`insert into public.payments (employer_id, job_id, amount_cents, status) values ($1, $2, 250, 'canceled')`, [employer.id, draftId]);

    for (const id of [waitingId, draftId]) {
      const res = await rest(`jobs?id=eq.${id}`, { token: employer.token, method: 'DELETE' });
      expect(res.json).toEqual([]); // row-level security: not deletable, so no row matched
      const still = await db.query('select count(*)::int n from public.jobs where id = $1', [id]);
      expect(still.rows[0]).toEqual({ n: 1 });
    }
  });

  it('a seeker cannot delete an employer’s job', async () => {
    const res = await rest(`jobs?id=eq.${jobId}`, { token: seeker.token, method: 'DELETE' });
    expect([200, 204, 401, 403]).toContain(res.status);
    const still = await db.query('select count(*)::int n from public.jobs where id = $1', [jobId]);
    expect(still.rows[0]).toEqual({ n: 1 });
  });
});
