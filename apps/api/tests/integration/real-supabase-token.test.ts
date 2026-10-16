// A token issued by the REAL local Supabase (GoTrue), verified by OUR verifier against the real
// published keys. This is what mock tokens cannot prove: that the issuer, audience and signing
// algorithm we expect are the ones Supabase actually uses.
//
// Local Supabase requires email confirmation (as production must), so the test signs up, reads the
// emailed 6-digit code from the mail catcher, and confirms it to get a session.
import { randomUUID } from 'node:crypto';
import { decodeProtectedHeader, decodeJwt } from 'jose';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearMailFor, waitForCode } from '../../../../tests/support/mailpit';
import { createApp } from '../../src/app';
import { TokenError, createTokenVerifier, remoteKeys } from '../../src/auth/verifyToken';
import { createAnonClient } from '../../src/lib/anonClient';
import { silentLogger } from '../../src/logger';
import { supabaseEnv } from './env';
import type { SupabaseClient } from '@supabase/supabase-js';

const { url, anonKey, databaseUrl } = supabaseEnv();
const issuer = `${url}/auth/v1`;
const jwksUrl = `${issuer}/.well-known/jwks.json`;

const db = new pg.Client({ connectionString: databaseUrl });
const email = `api-integration-${randomUUID()}@example.test`;
let accessToken = '';
let userId = '';
let signUpSessionWasNull = false;

const verifier = createTokenVerifier({ keys: remoteKeys(jwksUrl), issuer, audience: 'authenticated' });

const headers = { 'Content-Type': 'application/json', apikey: anonKey };

async function signUpAndConfirm(): Promise<{ accessToken: string; userId: string }> {
  const signUp = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: `Pw-${randomUUID()}`,
      data: { full_name: 'API Integration Test', role: 'admin' },
    }),
  });
  const signUpBody = (await signUp.json()) as { access_token?: string; id?: string; msg?: string };
  if (!signUp.ok) throw new Error(`signup failed (${signUp.status}): ${signUpBody.msg ?? 'unknown'}`);
  signUpSessionWasNull = !signUpBody.access_token;

  const code = await waitForCode(email, { subjectIncludes: 'confirmation' });
  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'signup', email, token: code }),
  });
  const verified = (await verify.json()) as { access_token?: string; user?: { id: string }; msg?: string };
  if (!verify.ok || !verified.access_token || !verified.user) {
    throw new Error(`code confirmation failed (${verify.status}): ${verified.msg ?? 'no access token returned'}`);
  }
  return { accessToken: verified.access_token, userId: verified.user.id };
}

beforeAll(async () => {
  await db.connect();
  await clearMailFor(email);
  ({ accessToken, userId } = await signUpAndConfirm());
});

afterAll(async () => {
  // Deleting the auth user cascades to the profile and everything under it.
  if (userId) await db.query('delete from auth.users where id = $1', [userId]);
  await clearMailFor(email);
  await db.end();
});

describe('local Supabase requires email confirmation', () => {
  it('sign-up alone gives no session; the emailed code is needed', () => {
    expect(signUpSessionWasNull).toBe(true);
  });
});

describe('a real Supabase access token', () => {
  it('is signed with an asymmetric key published at the JWKS URL, which is what the verifier expects', () => {
    const header = decodeProtectedHeader(accessToken);
    expect(['ES256', 'RS256']).toContain(header.alg);
    expect(header.kid).toBeTruthy();
    const claims = decodeJwt(accessToken);
    expect(claims.iss).toBe(issuer);
    expect(claims.aud).toBe('authenticated');
    expect(claims.role).toBe('authenticated');
    expect(claims.sub).toBe(userId);
  });

  it('is accepted by our verifier, and yields the user id', async () => {
    expect(await verifier(accessToken)).toEqual({ userId });
  });

  it('is refused if the signature is altered', async () => {
    const [header, payload, signature] = accessToken.split('.');
    const flipped = `${header}.${payload}.${signature!.slice(0, -4)}${signature!.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
    await expect(verifier(flipped)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('is refused if the payload is altered', async () => {
    const [header, payload, signature] = accessToken.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
    claims.sub = randomUUID();
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    await expect(verifier(forged)).rejects.toBeInstanceOf(TokenError);
  });

  it('is refused when we expect a different issuer or audience', async () => {
    const wrongIssuer = createTokenVerifier({ keys: remoteKeys(jwksUrl), issuer: 'https://other.example.test/auth/v1', audience: 'authenticated' });
    const wrongAudience = createTokenVerifier({ keys: remoteKeys(jwksUrl), issuer, audience: 'not-authenticated' });
    await expect(wrongIssuer(accessToken)).rejects.toMatchObject({ reason: 'invalid' });
    await expect(wrongAudience(accessToken)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('the project’s own anon key is not a user token and is refused', async () => {
    await expect(verifier(anonKey)).rejects.toBeInstanceOf(TokenError);
  });
});

describe('the real token through the whole app', () => {
  // The user's Supabase client is a stand-in that answers from the REAL profiles table, read
  // below with a separate database connection, so this checks the signup trigger and the API agree.
  // (The same flow through the real Data API, with row-level security, is in data-api.test.ts.)
  async function profileRole(): Promise<string | null> {
    const result = await db.query('select role from public.profiles where id = $1', [userId]);
    return (result.rows[0] as { role: string } | undefined)?.role ?? null;
  }

  function appWithRealVerifier() {
    return createApp({
      corsOrigins: ['http://localhost:3000'],
      trustProxy: 0,
      rateLimit: { windowMs: 60_000, max: 1000 },
      userRateLimit: { windowMs: 60_000, max: 1000 },
      verifyToken: verifier,
      anonClient: createAnonClient({ url, anonKey }),
      logger: silentLogger,
      createUserClient: () =>
        ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  const role = await profileRole();
                  return { data: role ? { id: userId, role } : null, error: null };
                },
              }),
            }),
          }),
        }) as unknown as SupabaseClient,
    });
  }

  it('signup created a profile, and a client asking for admin in the signup metadata did not get it', async () => {
    expect(await profileRole()).toBe('seeker');
  });

  it('GET /api/v1/me with the real token returns the database role, not anything the token or signup said', async () => {
    const res = await request(appWithRealVerifier()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: userId, role: 'seeker' });
  });

  it('the same app refuses a request with no token, and the old /api/me path does not exist', async () => {
    expect((await request(appWithRealVerifier()).get('/api/v1/me')).status).toBe(401);
    expect((await request(appWithRealVerifier()).get('/api/me').set('Authorization', `Bearer ${accessToken}`)).status).toBe(404);
  });
});
