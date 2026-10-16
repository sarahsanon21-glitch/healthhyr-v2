// The website's real auth code against the REAL local Supabase Auth (GoTrue), its real mail catcher,
// the real Data API (PostgREST, so row-level security applies) and the real HealthHyr API app
// listening on a local port.
//
// This proves what the component tests cannot: that sign-up, emailed codes, sign-in, password reset
// and the role from GET /api/v1/me work end to end, and that asking for admin gets nobody admin.
// It lives with the other real-Supabase tests so they share one setup and one project.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearMailFor, waitForCode } from '../../../../tests/support/mailpit';
import { createApiClient } from '../../../web/src/lib/api/client';
import { createBrowserSupabase, createSupabaseBackend } from '../../../web/src/lib/auth/backend';
import { createAuthService } from '../../../web/src/lib/auth/service';
import { parsePublicEnv } from '../../../web/src/lib/public-env';
import { startApi, type RunningApi } from './app';
import { supabaseEnv } from './env';

const { url, anonKey, databaseUrl } = supabaseEnv();
const db = new pg.Client({ connectionString: databaseUrl });
const createdEmails: string[] = [];
let api: RunningApi;

const newEmail = (label: string): string => {
  const email = `web-integration-${label}-${randomUUID()}@example.test`;
  createdEmails.push(email);
  return email;
};
const password = () => `Pw-${randomUUID()}`;

/** A fresh browser: its own Supabase client and auth service, signed out. */
function newBrowser() {
  const env = parsePublicEnv({
    NEXT_PUBLIC_API_BASE_URL: api.url,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  });
  const backend = createSupabaseBackend(createBrowserSupabase(env));
  const client = createApiClient({ baseUrl: env.apiBaseUrl, getAccessToken: () => backend.accessToken() });
  const service = createAuthService({ backend, api: client });
  return { backend, service };
}

beforeAll(async () => {
  await db.connect();
  api = await startApi();
});

afterAll(async () => {
  await api?.close();
  // Deleting the auth user cascades to the profile and everything under it.
  for (const email of createdEmails) {
    await db.query('delete from auth.users where email = $1', [email]);
    await clearMailFor(email);
  }
  await db.end();
});

describe('signed-out visitor', () => {
  it('starts signed out and no one is identified', async () => {
    const { service } = newBrowser();
    await service.start();
    expect(service.getState()).toMatchObject({ status: 'signedOut', user: null });
  });
});

describe('sign-up with an emailed code', () => {
  it.each(['employer', 'seeker'] as const)('a %s signs up, confirms the code, and the API reports that role', async (role) => {
    const email = newEmail(role);
    const pass = password();
    const { service } = newBrowser();
    await service.start();

    const signUp = await service.signUp({ fullName: 'Web Integration', email, password: pass, role });
    expect(signUp).toEqual({ ok: true, next: 'confirm_email' });
    expect(service.getState().status).toBe('signedOut'); // no session until the code is confirmed

    const code = await waitForCode(email, { subjectIncludes: 'confirm' });
    expect(code).toMatch(/^\d{6}$/);
    expect(await service.confirmSignUp({ email, code })).toEqual({ ok: true });

    expect(service.getState()).toMatchObject({ status: 'signedIn', user: { role } });
  });

  it('a wrong code is refused with a friendly result and leaves the person signed out', async () => {
    const email = newEmail('wrongcode');
    const { service } = newBrowser();
    await service.start();
    await service.signUp({ fullName: 'Web Integration', email, password: password(), role: 'seeker' });
    const result = await service.confirmSignUp({ email, code: '000000' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_code' });
    expect(service.getState().status).toBe('signedOut');
  });

  it('asking for admin does not make anyone an admin', async () => {
    const email = newEmail('admin');
    const { service, backend } = newBrowser();
    await service.start();
    // The form never offers admin, and the service refuses it...
    const refused = await service.signUp({ fullName: 'Web Integration', email, password: password(), role: 'admin' });
    expect(refused).toMatchObject({ ok: false, code: 'validation' });

    // ...and even a request that skips the service and goes straight to Supabase gets no admin.
    const sent = await backend.signUp({ email, password: password(), fullName: 'Web Integration', role: 'admin' as never });
    expect(sent.ok).toBe(true);
    const code = await waitForCode(email, { subjectIncludes: 'confirm' });
    await backend.confirmSignUp(email, code);
    const profile = await db.query('select role from public.profiles where id = (select id from auth.users where email = $1)', [email]);
    expect(profile.rows[0]).toEqual({ role: 'seeker' });
  });
});

describe('sign-in', () => {
  const email = newEmail('signin');
  const pass = password();

  beforeAll(async () => {
    const { service } = newBrowser();
    await service.start();
    await service.signUp({ fullName: 'Web Integration', email, password: pass, role: 'employer' });
    await service.confirmSignUp({ email, code: await waitForCode(email, { subjectIncludes: 'confirm' }) });
  });

  it('a new browser signs in and gets the role from the API', async () => {
    const { service } = newBrowser();
    await service.start();
    expect(await service.signIn({ email, password: pass })).toEqual({ ok: true });
    expect(service.getState()).toMatchObject({ status: 'signedIn', user: { role: 'employer' } });
  });

  it('wrong credentials give one friendly result and no session', async () => {
    const { service } = newBrowser();
    await service.start();
    const result = await service.signIn({ email, password: 'not-the-password-1' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_credentials' });
    expect(service.getState().status).toBe('signedOut');
  });

  it('an unknown address gets the same result as a wrong password', async () => {
    const { service } = newBrowser();
    await service.start();
    const result = await service.signIn({ email: newEmail('nobody'), password: 'not-the-password-1' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_credentials' });
  });

  it('signing out ends the session', async () => {
    const { service } = newBrowser();
    await service.start();
    await service.signIn({ email, password: pass });
    await service.signOut();
    expect(service.getState()).toMatchObject({ status: 'signedOut', user: null });
  });
});

describe('password reset with an emailed code', () => {
  it('sets a new password with the code; the new one works and the old one does not', async () => {
    const email = newEmail('reset');
    const oldPassword = password();
    const newPassword = password();

    const first = newBrowser();
    await first.service.start();
    await first.service.signUp({ fullName: 'Web Integration', email, password: oldPassword, role: 'seeker' });
    await first.service.confirmSignUp({ email, code: await waitForCode(email, { subjectIncludes: 'confirm' }) });
    await first.service.signOut();

    const { service } = newBrowser();
    await service.start();
    const since = new Date();
    expect(await service.requestPasswordReset(email)).toEqual({ ok: true });
    const code = await waitForCode(email, { subjectIncludes: 'reset', since });
    expect(await service.resetPassword({ email, code, newPassword })).toEqual({ ok: true });
    expect(service.getState()).toMatchObject({ status: 'signedIn', user: { role: 'seeker' } });
    await service.signOut();

    const second = newBrowser();
    await second.service.start();
    expect(await second.service.signIn({ email, password: oldPassword })).toMatchObject({ ok: false, code: 'invalid_credentials' });
    expect(await second.service.signIn({ email, password: newPassword })).toEqual({ ok: true });
  });

  it('asking for a code for an address with no account looks exactly like asking for a real one', async () => {
    const { service } = newBrowser();
    await service.start();
    expect(await service.requestPasswordReset(newEmail('ghost'))).toEqual({ ok: true });
  });

  it('a wrong code does not change the password', async () => {
    const email = newEmail('resetbad');
    const pass = password();
    const setup = newBrowser();
    await setup.service.start();
    await setup.service.signUp({ fullName: 'Web Integration', email, password: pass, role: 'seeker' });
    await setup.service.confirmSignUp({ email, code: await waitForCode(email, { subjectIncludes: 'confirm' }) });
    await setup.service.signOut();

    const { service } = newBrowser();
    await service.start();
    await service.requestPasswordReset(email);
    expect(await service.resetPassword({ email, code: '000000', newPassword: password() })).toMatchObject({ ok: false, code: 'invalid_code' });
    expect(await service.signIn({ email, password: pass })).toEqual({ ok: true });
  });
});
