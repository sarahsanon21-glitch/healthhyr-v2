import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, expectNoLeak, makeApp, makeKey, signToken } from './helpers/harness';

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('authentication: the token', () => {
  it('401 with no Authorization header', async () => {
    const { app, recorder } = await makeApp();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(recorder.clientTokens).toEqual([]);
    expectNoLeak(res.body);
  });

  it.each([
    ['a Basic scheme', 'Basic dXNlcjpwYXNz'],
    ['an empty Bearer', 'Bearer'],
    ['Bearer with nothing after it', 'Bearer '],
    ['two tokens', 'Bearer aaa bbb'],
    ['no scheme', 'justatoken'],
    ['an oversized token', `Bearer ${'a'.repeat(9000)}`],
  ])('401 for %s', async (_name, header) => {
    const { app, recorder } = await makeApp();
    const res = await request(app).get('/api/me').set('Authorization', header);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(recorder.clientTokens).toEqual([]);
  });

  it('401 invalid_token for a string that is not a JWT', async () => {
    const { app, recorder } = await makeApp();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
    expect(recorder.clientTokens).toEqual([]);
  });

  it('401 token_expired for an expired token', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker', { expiresIn: -3600 });
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('token_expired');
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('accepts a token that expired a moment ago, within the clock tolerance', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker', { expiresIn: -2 });
    expect((await request(t.app).get('/api/me').set('Authorization', authorization)).status).toBe(200);
  });

  it('401 for a token signed with the wrong key, even with the right key id', async () => {
    const t = await makeApp();
    const userId = randomUUID();
    t.profiles.set(userId, { id: userId, role: 'admin' });
    const forged = await signToken({ ...t.otherKey, kid: t.signingKey.kid }, { sub: userId });
    const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('401 for a token signed by an unknown key id', async () => {
    const t = await makeApp();
    const userId = randomUUID();
    t.profiles.set(userId, { id: userId, role: 'admin' });
    const forged = await signToken(t.otherKey, { sub: userId });
    const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('401 for a token whose payload was changed after signing', async () => {
    const t = await makeApp();
    const victim = randomUUID();
    t.profiles.set(victim, { id: victim, role: 'admin' });
    const { token } = await t.login('seeker');
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${b64url({ sub: victim, role: 'authenticated', iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 3600, iat: 1 })}.${signature}`;
    const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('401 for the wrong audience and the wrong issuer', async () => {
    const t = await makeApp();
    const wrongAudience = await t.login('seeker', { audience: 'something-else' });
    const wrongIssuer = await t.login('seeker', { issuer: 'https://evil.example.test/auth/v1' });
    for (const { authorization } of [wrongAudience, wrongIssuer]) {
      const res = await request(t.app).get('/api/me').set('Authorization', authorization);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('invalid_token');
    }
  });

  it('401 for a token with no expiry', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker', { expiresIn: false });
    expect((await request(t.app).get('/api/me').set('Authorization', authorization)).status).toBe(401);
  });

  it('401 for a token that is not valid yet', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker', { notBefore: 3600 });
    expect((await request(t.app).get('/api/me').set('Authorization', authorization)).status).toBe(401);
  });

  it('401 for an unsigned token (alg: none)', async () => {
    const t = await makeApp();
    const userId = randomUUID();
    t.profiles.set(userId, { id: userId, role: 'admin' });
    const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: userId, role: 'authenticated', iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 3600, iat: 1 })}.`;
    const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  it('401 for an HMAC token signed with the public key as the secret (algorithm confusion)', async () => {
    const t = await makeApp();
    const userId = randomUUID();
    t.profiles.set(userId, { id: userId, role: 'admin' });
    const secret = new TextEncoder().encode(JSON.stringify(t.signingKey.publicJwk));
    const confused = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', kid: t.signingKey.kid })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);
    const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${confused}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('401 for tokens that are not signed-in user tokens: anon, service role, anonymous user, no subject, bad subject', async () => {
    const t = await makeApp();
    const sub = randomUUID();
    t.profiles.set(sub, { id: sub, role: 'seeker' });
    const bad = [
      await signToken(t.signingKey, { sub, claims: { role: 'anon' } }),
      await signToken(t.signingKey, { sub, claims: { role: 'service_role' } }),
      await signToken(t.signingKey, { sub, claims: { role: 'authenticated', is_anonymous: true } }),
      await signToken(t.signingKey, { omitSub: true }),
      await signToken(t.signingKey, { sub: 'not-a-uuid' }),
    ];
    for (const token of bad) {
      const res = await request(t.app).get('/api/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('a valid token reaches the route', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('seeker');
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: userId, role: 'seeker' });
  });

  it('accepts the Bearer scheme in any letter case', async () => {
    const t = await makeApp();
    const { token } = await t.login('seeker');
    expect((await request(t.app).get('/api/me').set('Authorization', `bearer ${token}`)).status).toBe(200);
  });
});

describe('authentication: the role comes from the database, never from the token or the client', () => {
  it('ignores every role claim in the token and every role the client sends', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('seeker', {
      claims: {
        role: 'authenticated',
        user_role: 'admin',
        app_metadata: { role: 'admin', roles: ['admin'] },
        user_metadata: { role: 'admin' },
      },
    });
    const me = await request(t.app)
      .get('/api/me')
      .set('Authorization', authorization)
      .set('X-Role', 'admin')
      .set('X-User-Role', 'admin')
      .query({ role: 'admin' });
    expect(me.body).toEqual({ id: userId, role: 'seeker' });

    const adminRoute = await request(t.app).get('/api/admin-only').set('Authorization', authorization).set('X-Role', 'admin');
    expect(adminRoute.status).toBe(403);
  });

  it('ignores a role in the request body', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).post('/api/echo').set('Authorization', authorization).send({ role: 'admin' });
    expect(res.status).toBe(200);
    const me = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(me.body.role).toBe('seeker');
  });

  it('reads the role again on every request, so a change in the database applies to the same token at once', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('seeker');
    expect((await request(t.app).get('/api/admin-only').set('Authorization', authorization)).status).toBe(403);

    t.profiles.set(userId, { id: userId, role: 'admin' });
    expect((await request(t.app).get('/api/admin-only').set('Authorization', authorization)).status).toBe(200);

    t.profiles.set(userId, { id: userId, role: 'employer' });
    const me = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(me.body.role).toBe('employer');
    expect((await request(t.app).get('/api/admin-only').set('Authorization', authorization)).status).toBe(403);
  });

  it('looks the profile up by the verified token subject, in the profiles table', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    await request(t.app).get('/api/me').set('Authorization', authorization).set('X-User-Id', randomUUID());
    expect(t.recorder.lookups).toEqual([{ table: 'profiles', column: 'id', value: userId }]);
  });

  it('403 no_profile for a valid token whose user has no profile row', async () => {
    const t = await makeApp();
    const { authorization } = await t.login(null);
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('no_profile');
    expectNoLeak(res.body);
  });

  it('403 for a profile with a role that does not exist', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('superuser');
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('401 when the database itself rejects the token', async () => {
    const t = await makeApp({ db: { error: { message: 'JWT expired', code: 'PGRST301' } } });
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('500 with nothing leaked when the profile lookup fails for any other reason', async () => {
    const t = await makeApp({ db: { error: { message: 'relation "profiles" does not exist: password authentication failed', code: '42P01' } } });
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/me').set('Authorization', authorization);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expectNoLeak(res.body);
    // The real error is in the server log, with the request id.
    const logged = t.logs.find((entry) => entry.level === 'error');
    expect(JSON.stringify(logged)).toContain('profiles');
    expect(logged?.fields.requestId).toBe(res.body.error.requestId);
  });
});

describe('authentication: the per-request client carries the user’s own token', () => {
  it('creates a client from the caller’s token, once per request, after the token is verified', async () => {
    const t = await makeApp();
    const a = await t.login('seeker');
    const b = await t.login('employer');
    await request(t.app).get('/api/me').set('Authorization', a.authorization);
    await request(t.app).get('/api/me').set('Authorization', b.authorization);
    await request(t.app).get('/api/me').set('Authorization', a.authorization);
    expect(t.recorder.clientTokens).toEqual([a.token, b.token, a.token]);
  });

  it('never creates a client for a request that failed authentication', async () => {
    const t = await makeApp();
    await request(t.app).get('/api/me');
    await request(t.app).get('/api/me').set('Authorization', 'Bearer garbage');
    const wrongKey = await signToken(await makeKey('x'), {});
    await request(t.app).get('/api/me').set('Authorization', `Bearer ${wrongKey}`);
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('guards the whole /api prefix: unknown routes ask for a token first', async () => {
    const t = await makeApp();
    expect((await request(t.app).get('/api/does-not-exist')).status).toBe(401);
    expect((await request(t.app).post('/api/anything').send({})).status).toBe(401);
  });
});
