// Row-level security through the REAL Data API (PostgREST), with REAL Supabase Auth tokens.
//
// Unit tests use a stand-in database. This file proves the part a stand-in cannot: that a
// per-request client carrying the user's own token really is run by Postgres as that user, so the
// policies and column privileges apply, from the HTTP request all the way to the table. It also
// runs the employer company profile and the public company page against the real thing.
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_COMPANY_FIELDS } from '@healthhyr/shared';
import { clearMailFor, waitForCode } from '../../../../tests/support/mailpit';
import { createApp } from '../../src/app';
import { createTokenVerifier, remoteKeys } from '../../src/auth/verifyToken';
import { createAnonClient } from '../../src/lib/anonClient';
import { createUserClientFactory } from '../../src/lib/userClient';
import { silentLogger } from '../../src/logger';
import { supabaseEnv } from './env';

const { url, anonKey, databaseUrl } = supabaseEnv();
const db = new pg.Client({ connectionString: databaseUrl });
const emails: string[] = [];
const authHeaders = { 'Content-Type': 'application/json', apikey: anonKey };

interface Person {
  email: string;
  id: string;
  token: string;
}

let server: Server;
let apiUrl = '';
let employerA: Person;
let employerB: Person;
let seeker: Person;

async function createPerson(label: string, role: 'employer' | 'seeker'): Promise<Person> {
  const email = `data-api-${label}-${randomUUID()}@example.test`;
  emails.push(email);
  await clearMailFor(email);
  const signUp = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password: `Pw-${randomUUID()}`, data: { full_name: `Data API ${label}`, role } }),
  });
  if (!signUp.ok) throw new Error(`signup failed (${signUp.status})`);
  const code = await waitForCode(email, { subjectIncludes: 'confirmation' });
  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'signup', email, token: code }),
  });
  const body = (await verify.json()) as { access_token?: string; user?: { id: string } };
  if (!verify.ok || !body.access_token || !body.user) throw new Error(`confirmation failed (${verify.status})`);
  return { email, id: body.user.id, token: body.access_token };
}

/** A request straight to the Data API, as the given token (or as anon when there is none). */
async function rest(path: string, options: { token?: string; method?: string; body?: unknown } = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${options.token ?? anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as unknown) : null };
}

/** A request to the HealthHyr API. */
async function api(path: string, options: { token?: string; method?: string; body?: unknown } = {}) {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token && { Authorization: `Bearer ${options.token}` }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

const errorOf = (body: Record<string, unknown>) => body.error as { code: string; message: string };

beforeAll(async () => {
  await db.connect();
  const issuer = `${url}/auth/v1`;
  const app = createApp({
    corsOrigins: ['http://localhost:3000'],
    trustProxy: 0,
    rateLimit: { windowMs: 60_000, max: 10_000 },
    userRateLimit: { windowMs: 60_000, max: 10_000 },
    verifyToken: createTokenVerifier({ keys: remoteKeys(`${issuer}/.well-known/jwks.json`), issuer, audience: 'authenticated' }),
    createUserClient: createUserClientFactory({ url, anonKey }),
    anonClient: createAnonClient({ url, anonKey }),
    logger: silentLogger,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  employerA = await createPerson('employer-a', 'employer');
  employerB = await createPerson('employer-b', 'employer');
  seeker = await createPerson('seeker', 'seeker');
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  // Deleting the auth user cascades to the profile and everything under it.
  for (const email of emails) {
    await db.query('delete from auth.users where email = $1', [email]);
    await clearMailFor(email);
  }
  await db.end();
});

describe('the Data API applies row-level security to the user’s own token', () => {
  it('the project’s anon key alone can read nothing private: profiles are closed to anon', async () => {
    const res = await rest('profiles?select=id');
    expect([401, 403]).toContain(res.status);
  });

  it('a signed-in user sees only their own profile row, not anyone else’s', async () => {
    const res = await rest('profiles?select=id,role', { token: employerA.token });
    expect(res.status).toBe(200);
    expect(res.json).toEqual([{ id: employerA.id, role: 'employer' }]);
  });

  it('asking for another user’s profile by id returns nothing', async () => {
    const res = await rest(`profiles?select=id&id=eq.${employerB.id}`, { token: employerA.token });
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]);
  });

  it('a company still on the default name is visible to its owner but not to others or to anon', async () => {
    const own = await rest(`employer_profiles?select=id&id=eq.${employerA.id}`, { token: employerA.token });
    expect(own.json).toHaveLength(1);
    const asB = await rest(`employer_profiles?select=id&id=eq.${employerA.id}`, { token: employerB.token });
    expect(asB.json).toEqual([]);
    const asSeeker = await rest(`employer_profiles?select=id&id=eq.${employerA.id}`, { token: seeker.token });
    expect(asSeeker.json).toEqual([]);
    const asAnon = await rest(`employer_profiles?select=id&id=eq.${employerA.id}`);
    expect(asAnon.json).toEqual([]);
  });

  it('a user cannot change another user’s company, even by calling the Data API directly', async () => {
    const res = await rest(`employer_profiles?id=eq.${employerA.id}`, {
      token: employerB.token,
      method: 'PATCH',
      body: { company_name: 'Hijacked by B' },
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]); // no row was visible to change
    const row = await db.query('select company_name from public.employer_profiles where id = $1', [employerA.id]);
    expect(row.rows[0]).toEqual({ company_name: 'My company' });
  });

  it('a user cannot set the columns the server decides, even on their own row', async () => {
    for (const body of [{ is_listed: true }, { slug: 'my-own-slug' }, { id: randomUUID() }]) {
      const res = await rest(`employer_profiles?id=eq.${employerA.id}`, { token: employerA.token, method: 'PATCH', body });
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
    }
    const row = await db.query('select is_listed, slug from public.employer_profiles where id = $1', [employerA.id]);
    expect(row.rows[0]).toEqual({ is_listed: false, slug: null });
  });

  it('a user cannot make themselves an admin through the Data API', async () => {
    const res = await rest(`profiles?id=eq.${employerA.id}`, { token: employerA.token, method: 'PATCH', body: { role: 'admin' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const row = await db.query('select role from public.profiles where id = $1', [employerA.id]);
    expect(row.rows[0]).toEqual({ role: 'employer' });
  });

  it('the private schema is not reachable through the Data API', async () => {
    const res = await rest('rpc/is_admin', { token: employerA.token, method: 'POST', body: {} });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('a forged or altered token is refused by the Data API itself', async () => {
    const [header, payload, signature] = employerA.token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
    claims.sub = employerB.id;
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    const res = await rest('profiles?select=id', { token: forged });
    expect(res.status).toBe(401);
  });
});

describe('the API’s per-request client is the user, so RLS applies through the API too', () => {
  it('GET /me reads the profile through the real Data API as the caller', async () => {
    const res = await api('/me', { token: employerA.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: employerA.id, role: 'employer' });
  });

  it('each person gets their own role, read as themselves', async () => {
    const res = await api('/me', { token: seeker.token });
    expect(res.body).toEqual({ id: seeker.id, role: 'seeker' });
  });
});

describe('employer company profile, end to end', () => {
  it('refuses no token, a seeker, and a forged token', async () => {
    expect((await api('/employer/company')).status).toBe(401);
    expect((await api('/employer/company', { token: seeker.token })).status).toBe(403);
    expect((await api('/employer/company', { token: `${employerA.token}x` })).status).toBe(401);
  });

  it('a new employer starts on the default name and is not listed', async () => {
    const res = await api('/employer/company', { token: employerA.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ companyName: 'My company', isListed: false, slug: null });
  });

  it('refuses fields the server decides, and saves nothing', async () => {
    for (const extra of [{ is_listed: true }, { slug: 'mine' }, { id: employerB.id }, { logoUrl: 'https://example.org/l.png' }]) {
      const res = await api('/employer/company', { token: employerA.token, method: 'PUT', body: { companyName: 'Alpha Care', ...extra } });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    const row = await db.query('select company_name from public.employer_profiles where id = $1', [employerA.id]);
    expect(row.rows[0]).toEqual({ company_name: 'My company' });
  });

  it('A saves a profile; the page becomes public with a slug; B’s company is untouched', async () => {
    const saved = await api('/employer/company', {
      token: employerA.token,
      method: 'PUT',
      body: { companyName: 'Alpha Care Test', description: 'Care at home.', website: 'https://alpha.example.org', industry: 'Home health', companySize: '11-50', city: 'Fresno', state: 'CA' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ companyName: 'Alpha Care Test', isListed: true, companySize: '11-50' });
    expect(saved.body.slug).toMatch(/^alpha-care-test-[0-9a-f]{6}$/);

    const b = await api('/employer/company', { token: employerB.token });
    expect(b.body).toMatchObject({ companyName: 'My company', isListed: false });
  });

  it('B saving changes only B’s company, never A’s', async () => {
    const before = await db.query('select company_name, city from public.employer_profiles where id = $1', [employerA.id]);
    const res = await api('/employer/company', { token: employerB.token, method: 'PUT', body: { companyName: 'Beta Care Test', city: 'Oakland' } });
    expect(res.status).toBe(200);
    const after = await db.query('select company_name, city from public.employer_profiles where id = $1', [employerA.id]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const b = await db.query('select company_name, city from public.employer_profiles where id = $1', [employerB.id]);
    expect(b.rows[0]).toEqual({ company_name: 'Beta Care Test', city: 'Oakland' });
  });
});

describe('public company page, end to end', () => {
  it('a company still on the default name is a 404, exactly like one that does not exist', async () => {
    const fresh = await createPerson('employer-fresh', 'employer');
    const row = await db.query('select slug, is_listed from public.employer_profiles where id = $1', [fresh.id]);
    expect(row.rows[0]).toEqual({ slug: null, is_listed: false });

    const missing = await api('/public/companies/no-such-company-abc123');
    const guess = await api(`/public/companies/my-company-${fresh.id.slice(0, 6)}`);
    expect(missing.status).toBe(404);
    expect(guess.status).toBe(404);
    expect(errorOf(guess.body).code).toBe(errorOf(missing.body).code);
    expect(errorOf(guess.body).message).toBe(errorOf(missing.body).message);
  });

  it('shows a listed company to anyone, and only the allowed fields', async () => {
    const own = await api('/employer/company', { token: employerA.token });
    const slug = own.body.slug as string;

    const res = await api(`/public/companies/${slug}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...PUBLIC_COMPANY_FIELDS].sort());
    expect(res.body).toEqual({
      companyName: 'Alpha Care Test',
      description: 'Care at home.',
      website: 'https://alpha.example.org/',
      logoUrl: null,
      industry: 'Home health',
      companySize: '11-50',
      city: 'Fresno',
      state: 'CA',
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(employerA.id);
    expect(text).not.toContain(slug);
  });

  it('a website written straight to the Data API that is not an http(s) address never reaches the page', async () => {
    const own = await api('/employer/company', { token: employerA.token });
    const slug = own.body.slug as string;
    const write = await rest(`employer_profiles?id=eq.${employerA.id}`, {
      token: employerA.token,
      method: 'PATCH',
      body: { website: 'javascript:alert(1)' },
    });
    expect(write.status).toBe(200); // the database accepts it: this is why the page cannot trust the column
    const page = await api(`/public/companies/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body.website).toBeNull();
  });

  it('the slug stays the same after renames, and the page follows the new name', async () => {
    const own = await api('/employer/company', { token: employerA.token });
    const slug = own.body.slug as string;

    await api('/employer/company', { token: employerA.token, method: 'PUT', body: { companyName: 'Alpha Care Group Test' } });
    const again = await api('/employer/company', { token: employerA.token });
    expect(again.body.slug).toBe(slug);
    const page = await api(`/public/companies/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body.companyName).toBe('Alpha Care Group Test');
  });

  it('changing the name back to the default hides the page again, and a new name brings it back at the same address', async () => {
    const own = await api('/employer/company', { token: employerA.token });
    const slug = own.body.slug as string;

    await api('/employer/company', { token: employerA.token, method: 'PUT', body: { companyName: 'My company' } });
    expect((await api(`/public/companies/${slug}`)).status).toBe(404);

    await api('/employer/company', { token: employerA.token, method: 'PUT', body: { companyName: 'Alpha Again Test' } });
    const back = await api(`/public/companies/${slug}`);
    expect(back.status).toBe(200);
    expect(back.body.companyName).toBe('Alpha Again Test');
  });

  it('the anon client reads only listed companies, and cannot write', async () => {
    const own = await api('/employer/company', { token: employerA.token });
    const listed = await rest(`employer_profiles?select=company_name&slug=eq.${own.body.slug as string}`);
    expect(listed.json).toHaveLength(1);
    const all = (await rest('employer_profiles?select=id,is_listed')).json as Array<{ is_listed: boolean }>;
    expect(all.every((row) => row.is_listed)).toBe(true);
    const write = await rest(`employer_profiles?id=eq.${employerA.id}`, { method: 'PATCH', body: { company_name: 'Anon wrote this' } });
    expect(write.status).toBeGreaterThanOrEqual(400);
  });
});
