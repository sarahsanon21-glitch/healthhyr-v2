// The employer's company profile (signed in, employers only) and the public company page
// (anyone). Uses the harness stand-in database, which answers the way row-level security would and
// records every query. The same flows against the real Data API are in tests/integration.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { COMPANY_SIZES, PUBLIC_COMPANY_FIELDS } from '@healthhyr/shared';
import { expectNoLeak, makeApp, v1 } from './helpers/harness';

const OWN = '/employer/company';
const publicPath = (slug: string) => `/public/companies/${slug}`;

const EDIT = {
  companyName: 'Sunrise Home Care',
  description: 'Home care across the valley.',
  website: 'https://sunrise.example.org',
  industry: 'Home health',
  companySize: '11-50',
  city: 'Fresno',
  state: 'CA',
};

describe('employer company profile: who may call it', () => {
  it('needs a token', async () => {
    const t = await makeApp();
    expect((await request(t.app).get(v1(OWN))).status).toBe(401);
    expect((await request(t.app).put(v1(OWN)).send(EDIT)).status).toBe(401);
  });

  it.each(['seeker', 'admin'])('refuses a %s on both methods, and touches no company data', async (role) => {
    const t = await makeApp();
    const { authorization } = await t.login(role);
    const get = await request(t.app).get(v1(OWN)).set('Authorization', authorization);
    const put = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    expect(get.status).toBe(403);
    expect(put.status).toBe(403);
    expect(t.recorder.queries).toEqual([]);
  });
});

describe('employer company profile: reading', () => {
  it('returns the signed-in employer’s own company, in the agreed shape, without the id', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    t.addCompany(userId, { company_name: 'Sunrise Home Care', city: 'Fresno' });

    const res = await request(t.app).get(v1(OWN)).set('Authorization', authorization);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companyName: 'Sunrise Home Care',
      description: null,
      website: null,
      logoUrl: null,
      industry: null,
      companySize: null,
      city: 'Fresno',
      state: null,
      isListed: true,
      slug: expect.stringMatching(/^sunrise-home-care-[0-9a-f]{6}$/),
    });
    expect(JSON.stringify(res.body)).not.toContain(userId);
  });

  it('a new employer starts on the default name and is not listed', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    const res = await request(t.app).get(v1(OWN)).set('Authorization', authorization);
    expect(res.body).toMatchObject({ companyName: 'My company', isListed: false, slug: null });
  });

  it('asks the database for the caller’s own id (from the verified token) and for named columns only', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    await request(t.app).get(v1(OWN)).set('Authorization', authorization);
    const [query] = t.recorder.queries;
    expect(t.recorder.queries).toHaveLength(1);
    expect(query).toMatchObject({ client: 'user', table: 'employer_profiles', op: 'select', filters: [['id', userId]] });
    expect(query!.columns).toBeDefined();
    expect(query!.columns).not.toMatch(/\*/);
    expect(query!.columns).not.toMatch(/(^|,\s*)id(\s*,|$)/);
  });

  it('is 404 when the employer has no company row', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    t.companies.delete(userId);
    expect((await request(t.app).get(v1(OWN)).set('Authorization', authorization)).status).toBe(404);
  });

  it('a database failure is a generic 500 that leaks nothing', async () => {
    const t = await makeApp({ db: { companyError: { message: 'relation "employer_profiles" does not exist', code: '42P01' } } });
    const { authorization } = await t.login('employer');
    const res = await request(t.app).get(v1(OWN)).set('Authorization', authorization);
    expect(res.status).toBe(500);
    expectNoLeak(res.body, ['employer_profiles']);
  });
});

describe('employer company profile: saving', () => {
  it('saves the fields and returns the saved profile', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...EDIT, logoUrl: null, isListed: true });
    expect(t.companies.get(userId)).toMatchObject({
      company_name: 'Sunrise Home Care',
      company_size: '11-50',
      website: 'https://sunrise.example.org',
    });
  });

  it('sends only the seven editable columns to the database, filtered to the caller’s own row', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    const update = t.recorder.queries.find((q) => q.op === 'update')!;
    expect(Object.keys(update.values!).sort()).toEqual(
      ['city', 'company_name', 'company_size', 'description', 'industry', 'state', 'website'].sort(),
    );
    expect(update.filters).toEqual([['id', userId]]);
    expect(update.client).toBe('user');
  });

  it('renaming from the default makes the page public with a slug, and later renames keep the slug', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    const first = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    expect(first.body.isListed).toBe(true);
    const slug = first.body.slug as string;
    expect(slug).toMatch(/^sunrise-home-care-[0-9a-f]{6}$/);

    const second = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ ...EDIT, companyName: 'Sunrise Care Group' });
    expect(second.body.slug).toBe(slug);
    expect(second.body.companyName).toBe('Sunrise Care Group');
  });

  it('saving with the default name keeps the page unlisted', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ companyName: 'My company' });
    expect(res.body).toMatchObject({ isListed: false, slug: null });
  });

  it('turns empty boxes into null, and trims text', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    const res = await request(t.app)
      .put(v1(OWN))
      .set('Authorization', authorization)
      .send({ companyName: '  Sunrise  ', description: '   ', website: '', industry: '', companySize: '', city: ' Fresno ', state: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ companyName: 'Sunrise', description: null, website: null, industry: null, companySize: null, city: 'Fresno', state: null });
  });

  it('fields left out are cleared, because a save replaces the whole profile', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ companyName: 'Sunrise Home Care' });
    expect(res.body).toMatchObject({ description: null, website: null, city: null });
  });

  it.each([
    ['an empty name', { companyName: '   ' }, 'companyName'],
    ['no name', {}, 'companyName'],
    ['a name that is too long', { companyName: 'x'.repeat(121) }, 'companyName'],
    ['a javascript: web address', { companyName: 'Sunrise', website: 'javascript:alert(1)' }, 'website'],
    ['an ftp web address', { companyName: 'Sunrise', website: 'ftp://example.org' }, 'website'],
    ['a web address with no scheme', { companyName: 'Sunrise', website: 'example.org' }, 'website'],
    ['a description that is too long', { companyName: 'Sunrise', description: 'x'.repeat(5001) }, 'description'],
    ['a size not on the list', { companyName: 'Sunrise', companySize: '12 people' }, 'companySize'],
    ['text where a string is expected', { companyName: 'Sunrise', city: { a: 1 } }, 'city'],
  ])('refuses %s with a friendly message and saves nothing', async (_name, body, field) => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.issues.map((i: { path: string }) => i.path)).toContain(field);
    expect(t.recorder.queries.filter((q) => q.op === 'update')).toEqual([]);
  });

  it('accepts every size on the list', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    for (const size of COMPANY_SIZES) {
      const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ companyName: 'Sunrise', companySize: size });
      expect(res.status, size).toBe(200);
      expect(res.body.companySize).toBe(size);
    }
  });

  it.each([
    ['is_listed', { is_listed: true }],
    ['isListed', { isListed: true }],
    ['slug', { slug: 'chosen-by-me' }],
    ['id', { id: randomUUID() }],
    ['employer_id', { employer_id: randomUUID() }],
    ['the logo', { logoUrl: 'https://example.org/logo.png' }],
    ['logo_url', { logo_url: 'https://example.org/logo.png' }],
    ['role', { role: 'admin' }],
    ['stripe_customer_id', { stripe_customer_id: 'cus_1' }],
    ['an unknown field', { favoriteColor: 'green' }],
  ])('refuses %s in the body, because the server decides it', async (_name, extra) => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ companyName: 'Sunrise', ...extra });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(t.recorder.queries.filter((q) => q.op === 'update')).toEqual([]);
    expect(t.companies.get(userId)).toMatchObject({ company_name: 'My company', slug: null, is_listed: false });
  });

  it('refuses a body that is not an object', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('employer');
    for (const body of [[], 'text', 5, null]) {
      const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).set('Content-Type', 'application/json').send(JSON.stringify(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('when the database saves nothing (it refused the change), the answer is 404 and nothing was created', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    t.companies.delete(userId);
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    expect(res.status).toBe(404);
    expect(t.companies.size).toBe(0);
  });

  it('a database failure is a generic 500 that leaks nothing', async () => {
    const t = await makeApp({ db: { companyError: { message: 'permission denied for table employer_profiles', code: '42501' } } });
    const { authorization } = await t.login('employer');
    const res = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
    expect(res.status).toBe(500);
    expectNoLeak(res.body, ['employer_profiles']);
  });
});

describe('an employer can change only their own profile; a stranger is refused', () => {
  it('employer B saving never changes employer A’s company', async () => {
    const t = await makeApp();
    const a = await t.login('employer');
    const b = await t.login('employer');
    t.addCompany(a.userId, { company_name: 'Alpha Care', city: 'Fresno' });

    const res = await request(t.app).put(v1(OWN)).set('Authorization', b.authorization).send({ ...EDIT, companyName: 'Hijacked' });
    expect(res.status).toBe(200);
    expect(t.companies.get(a.userId)).toMatchObject({ company_name: 'Alpha Care', city: 'Fresno' });
    expect(t.companies.get(b.userId)).toMatchObject({ company_name: 'Hijacked' });
  });

  it('naming A’s id in the body does not help: the field is refused and nothing changes', async () => {
    const t = await makeApp();
    const a = await t.login('employer');
    const b = await t.login('employer');
    t.addCompany(a.userId, { company_name: 'Alpha Care' });
    for (const extra of [{ id: a.userId }, { employer_id: a.userId }, { employerId: a.userId }]) {
      const res = await request(t.app).put(v1(OWN)).set('Authorization', b.authorization).send({ companyName: 'Hijacked', ...extra });
      expect(res.status).toBe(400);
    }
    expect(t.companies.get(a.userId)).toMatchObject({ company_name: 'Alpha Care' });
  });

  it('naming A’s id in the URL or query does not help: there is no such parameter', async () => {
    const t = await makeApp();
    const a = await t.login('employer');
    const b = await t.login('employer');
    t.addCompany(a.userId, { company_name: 'Alpha Care' });

    const get = await request(t.app).get(`${v1(OWN)}?id=${a.userId}`).set('Authorization', b.authorization);
    expect(get.body.companyName).toBe('My company');
    const other = await request(t.app).put(`${v1(OWN)}/${a.userId}`).set('Authorization', b.authorization).send(EDIT);
    expect(other.status).toBe(404);
    expect(t.companies.get(a.userId)).toMatchObject({ company_name: 'Alpha Care' });
  });

  it('every query is filtered by the caller’s own id, never anyone else’s', async () => {
    const t = await makeApp();
    const a = await t.login('employer');
    const b = await t.login('employer');
    await request(t.app).get(v1(OWN)).set('Authorization', b.authorization);
    await request(t.app).put(v1(OWN)).set('Authorization', b.authorization).send(EDIT);
    expect(t.recorder.queries.length).toBeGreaterThan(0);
    for (const query of t.recorder.queries) expect(query.filters).toEqual([['id', b.userId]]);
    expect(JSON.stringify(t.recorder.queries)).not.toContain(a.userId);
  });

  it('holds even if the database stopped enforcing row-level security: the code still scopes to the caller', async () => {
    const t = await makeApp({ db: { rls: false } });
    const a = await t.login('employer');
    const b = await t.login('employer');
    t.addCompany(a.userId, { company_name: 'Alpha Care' });

    const get = await request(t.app).get(v1(OWN)).set('Authorization', b.authorization);
    expect(get.body.companyName).toBe('My company');
    await request(t.app).put(v1(OWN)).set('Authorization', b.authorization).send({ ...EDIT, companyName: 'Hijacked' });
    expect(t.companies.get(a.userId)).toMatchObject({ company_name: 'Alpha Care' });
  });

  it('uses the per-request client carrying the caller’s own token, never a shared one', async () => {
    const t = await makeApp();
    const b = await t.login('employer');
    await request(t.app).put(v1(OWN)).set('Authorization', b.authorization).send(EDIT);
    expect(t.recorder.queries.every((q) => q.client === 'user')).toBe(true);
    expect(new Set(t.recorder.clientTokens)).toEqual(new Set([b.token]));
  });
});

describe('public company page', () => {
  const listed = (t: Awaited<ReturnType<typeof makeApp>>, fields = {}) => t.addCompany(randomUUID(), { company_name: 'Sunrise Home Care', city: 'Fresno', state: 'CA', ...fields });

  it('returns a listed company with no sign-in', async () => {
    const t = await makeApp();
    const row = listed(t, { description: 'Home care.', website: 'https://sunrise.example.org', industry: 'Home health', company_size: '11-50' });
    const res = await request(t.app).get(v1(publicPath(row.slug!)));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companyName: 'Sunrise Home Care',
      description: 'Home care.',
      website: 'https://sunrise.example.org/',
      logoUrl: null,
      industry: 'Home health',
      companySize: '11-50',
      city: 'Fresno',
      state: 'CA',
    });
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('works the same for a signed-in person, and ignores a bad token', async () => {
    const t = await makeApp();
    const row = listed(t);
    const { authorization } = await t.login('seeker');
    expect((await request(t.app).get(v1(publicPath(row.slug!))).set('Authorization', authorization)).status).toBe(200);
    expect((await request(t.app).get(v1(publicPath(row.slug!))).set('Authorization', 'Bearer not-a-token')).status).toBe(200);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://example.org', 'not a url', 'vbscript:x'])(
    'drops a website value that is not an http or https address (%s)',
    async (website) => {
      // An employer can write this column directly through the Data API, so the page does not trust it.
      const t = await makeApp();
      const row = listed(t, { website });
      const res = await request(t.app).get(v1(publicPath(row.slug!)));
      expect(res.status).toBe(200);
      expect(res.body.website).toBeNull();
    },
  );

  describe('returns only the allowlist and nothing else', () => {
    it('the response has exactly the eight allowed fields, never the id, slug, listing flag or dates', async () => {
      const t = await makeApp();
      const row = listed(t, { description: 'd', website: 'https://e.org', logo_url: 'https://e.org/l.png', industry: 'i', company_size: '1-10' });
      const res = await request(t.app).get(v1(publicPath(row.slug!)));
      expect(Object.keys(res.body).sort()).toEqual([...PUBLIC_COMPANY_FIELDS].sort());

      const text = JSON.stringify(res.body);
      for (const secret of [row.id, row.slug!, 'is_listed', 'isListed', 'created_at', 'updated_at', 'slug', '"id"']) {
        expect(text, secret).not.toContain(secret);
      }
    });

    it('a column added to the table later does not appear until someone adds it on purpose', async () => {
      const t = await makeApp();
      const row = listed(t);
      const employerRef = randomUUID();
      // The stand-in returns the whole row, so these extra columns reach the route.
      Object.assign(row, {
        owner_email: 'owner@example.org',
        stripe_customer_id: 'cus_123',
        internal_notes: 'do not show',
        employer_id: employerRef,
        phone: '555-0100',
      });
      const res = await request(t.app).get(v1(publicPath(row.slug!)));
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([...PUBLIC_COMPANY_FIELDS].sort());
      const text = JSON.stringify(res.body);
      for (const leaked of ['owner@example.org', 'cus_123', 'do not show', '555-0100', employerRef]) {
        expect(text).not.toContain(leaked);
      }
    });

    it('asks the database for named columns only (no star, no id, no slug, no flags)', async () => {
      const t = await makeApp();
      const row = listed(t);
      await request(t.app).get(v1(publicPath(row.slug!)));
      const query = t.recorder.queries[0]!;
      expect(query.client).toBe('anon');
      const columns = query.columns!.split(',').map((c) => c.trim());
      expect(columns.sort()).toEqual(['city', 'company_name', 'company_size', 'description', 'industry', 'logo_url', 'state', 'website'].sort());
    });
  });

  describe('is a 404 until the company name is changed from the default', () => {
    it('a company still on the default name (no slug yet) is not found by any address', async () => {
      const t = await makeApp();
      const id = randomUUID();
      t.addCompany(id); // default name, unlisted, no slug
      for (const slug of ['my-company', `my-company-${id.slice(0, 6)}`, 'null']) {
        expect((await request(t.app).get(v1(publicPath(slug)))).status, slug).toBe(404);
      }
    });

    it('a company renamed back to the default (it keeps its slug, but is no longer listed) is a 404', async () => {
      const t = await makeApp();
      const row = listed(t);
      const slug = row.slug!;
      expect((await request(t.app).get(v1(publicPath(slug)))).status).toBe(200);
      Object.assign(row, { company_name: 'My company', is_listed: false });
      expect((await request(t.app).get(v1(publicPath(slug)))).status).toBe(404);
    });

    it('also holds if the database stopped hiding unlisted rows: the route asks for listed companies itself', async () => {
      const t = await makeApp({ db: { rls: false } });
      const row = listed(t);
      Object.assign(row, { company_name: 'My company', is_listed: false });
      expect((await request(t.app).get(v1(publicPath(row.slug!)))).status).toBe(404);
      expect(t.recorder.queries[0]!.filters).toContainEqual(['is_listed', true]);
    });

    it('a missing company and an unlisted one give the identical answer', async () => {
      const t = await makeApp();
      const row = listed(t);
      Object.assign(row, { is_listed: false });
      const unlisted = await request(t.app).get(v1(publicPath(row.slug!)));
      const missing = await request(t.app).get(v1(publicPath('no-such-company-abc123')));
      expect(unlisted.status).toBe(404);
      expect(unlisted.body.error.code).toBe(missing.body.error.code);
      expect(unlisted.body.error.message).toBe(missing.body.error.message);
    });
  });

  describe('the slug stays stable after later renames', () => {
    it('the page keeps its address when the employer renames the company', async () => {
      const t = await makeApp();
      const { authorization } = await t.login('employer');
      const first = await request(t.app).put(v1(OWN)).set('Authorization', authorization).send(EDIT);
      const slug = first.body.slug as string;

      await request(t.app).put(v1(OWN)).set('Authorization', authorization).send({ ...EDIT, companyName: 'A Completely New Name' });
      const res = await request(t.app).get(v1(publicPath(slug)));
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('A Completely New Name');
    });
  });

  describe('bad addresses', () => {
    it.each(['UPPER-case', 'has space', 'a_b', 'a--b', '-lead', 'trail-', 'dots.dots', '%2e%2e', '%00', 'sunrise%2Fx', 'x'.repeat(161), 'ünï'])(
      'rejects %j as a plain 404 without asking the database',
      async (slug) => {
        const t = await makeApp();
        const res = await request(t.app).get(v1(`/public/companies/${slug}`));
        expect(res.status).toBe(404);
        expect(t.recorder.queries).toEqual([]);
      },
    );
  });

  it('a database failure is a generic 500 that leaks nothing', async () => {
    const t = await makeApp({ db: { companyError: { message: 'relation "employer_profiles" does not exist', code: '42P01' } } });
    const res = await request(t.app).get(v1(publicPath('sunrise-home-care-abc123')));
    expect(res.status).toBe(500);
    expectNoLeak(res.body, ['employer_profiles']);
  });

  it('only GET is allowed', async () => {
    const t = await makeApp();
    const row = listed(t);
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      expect((await request(t.app)[method](v1(publicPath(row.slug!)))).status, method).toBe(404);
    }
  });

  it('an unknown path under /public is a 404, not a 401', async () => {
    const t = await makeApp();
    for (const path of ['/public', '/public/', '/public/jobs', '/public/companies', '/public/companies/a/b']) {
      expect((await request(t.app).get(v1(path))).status, path).toBe(404);
    }
  });

  it('is throttled by the per-IP limit like every other route', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 2 } });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await request(t.app).get(v1(publicPath('no-such-company-abc123')))).status);
    expect(statuses).toEqual([404, 404, 429]);
  });
});
