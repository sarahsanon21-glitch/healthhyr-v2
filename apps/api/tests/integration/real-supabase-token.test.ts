// A token issued by the REAL local Supabase (GoTrue), verified by OUR verifier against the real
// published keys. This is what mock tokens cannot prove: that the issuer, audience and signing
// algorithm we expect are the ones Supabase actually uses.
import { randomUUID } from 'node:crypto';
import { decodeProtectedHeader, decodeJwt } from 'jose';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { TokenError, createTokenVerifier, remoteKeys } from '../../src/auth/verifyToken';
import { silentLogger } from '../../src/logger';
import { supabaseEnv } from './env';
import type { SupabaseClient } from '@supabase/supabase-js';

const { url, anonKey, databaseUrl } = supabaseEnv();
const issuer = `${url}/auth/v1`;
const jwksUrl = `${issuer}/.well-known/jwks.json`;

const db = new pg.Client({ connectionString: databaseUrl });
let accessToken = '';
let userId = '';

const verifier = createTokenVerifier({ keys: remoteKeys(jwksUrl), issuer, audience: 'authenticated' });

async function signUp(): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({
      email: `api-integration-${randomUUID()}@example.test`,
      password: `Pw-${randomUUID()}`,
      data: { full_name: 'API Integration Test', role: 'admin' },
    }),
  });
  const body = (await response.json()) as { access_token?: string; user?: { id: string }; msg?: string };
  if (!response.ok || !body.access_token || !body.user) {
    throw new Error(`signup failed (${response.status}): ${body.msg ?? 'no access token returned'}`);
  }
  return { accessToken: body.access_token, userId: body.user.id };
}

beforeAll(async () => {
  await db.connect();
  ({ accessToken, userId } = await signUp());
});

afterAll(async () => {
  // Deleting the auth user cascades to the profile and everything under it.
  if (userId) await db.query('delete from auth.users where id = $1', [userId]);
  await db.end();
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
  async function profileRole(): Promise<string | null> {
    const result = await db.query('select role from public.profiles where id = $1', [userId]);
    return (result.rows[0] as { role: string } | undefined)?.role ?? null;
  }

  function appWithRealVerifier() {
    return createApp({
      corsOrigins: ['http://localhost:3000'],
      trustProxy: 0,
      rateLimit: { windowMs: 60_000, max: 1000 },
      verifyToken: verifier,
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

  it('GET /api/me with the real token returns the database role, not anything the token or signup said', async () => {
    const res = await request(appWithRealVerifier()).get('/api/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: userId, role: 'seeker' });
  });

  it('the same app refuses a request with no token', async () => {
    const res = await request(appWithRealVerifier()).get('/api/me');
    expect(res.status).toBe(401);
  });
});
