// Real people for the integration tests: sign up against the real local Supabase Auth, confirm the
// emailed code from the mail catcher, and get a real session token. Also small helpers to call the
// Data API and the HealthHyr API as one of them, and to clean up afterwards.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { clearMailFor, waitForCode } from '../../../../tests/support/mailpit';
import { supabaseEnv } from './env';

export interface Person {
  email: string;
  id: string;
  token: string;
}

/** Email addresses created so far, so a test can delete those users afterwards. */
export const createdEmails: string[] = [];

export async function createPerson(label: string, role: 'employer' | 'seeker'): Promise<Person> {
  const { url, anonKey } = supabaseEnv();
  const headers = { 'Content-Type': 'application/json', apikey: anonKey };
  const email = `integration-${label}-${randomUUID()}@example.test`;
  createdEmails.push(email);
  await clearMailFor(email);

  const signUp = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: `Pw-${randomUUID()}`, data: { full_name: `Integration ${label}`, role } }),
  });
  if (!signUp.ok) throw new Error(`signup failed (${signUp.status})`);
  const code = await waitForCode(email, { subjectIncludes: 'confirmation' });
  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'signup', email, token: code }),
  });
  const body = (await verify.json()) as { access_token?: string; user?: { id: string } };
  if (!verify.ok || !body.access_token || !body.user) throw new Error(`confirmation failed (${verify.status})`);
  return { email, id: body.user.id, token: body.access_token };
}

/**
 * Deletes the people created in this test file and everything under them. Payment history is never
 * deleted by the product (payments.employer_id and payments.job_id restrict, and a live job points
 * at its payment), so a test that made payments detaches and removes them here first, as the
 * database owner acting as the service role.
 */
export async function deleteCreatedPeople(db: pg.Client, only?: string): Promise<void> {
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  for (const email of createdEmails.filter((e) => !only || e.includes(only))) {
    const owner = 'select id from auth.users where email = $1';
    await db.query(`update public.jobs set payment_id = null where employer_id in (${owner})`, [email]);
    await db.query(`delete from public.payments where employer_id in (${owner})`, [email]);
    await db.query('delete from auth.users where email = $1', [email]);
    await clearMailFor(email);
  }
}

export interface CallOptions {
  token?: string;
  method?: string;
  body?: unknown;
  /** Extra request headers (for example Prefer). */
  headers?: Record<string, string>;
}

/** A request straight to the Data API, as the given token (or as anon when there is none). */
export async function rest(path: string, options: CallOptions = {}) {
  const { url, anonKey } = supabaseEnv();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${options.token ?? anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as unknown) : null };
}

/** A request to the HealthHyr API at `apiUrl`. */
export async function callApi(apiUrl: string, path: string, options: CallOptions = {}) {
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
