import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGIN, expectNoLeak, makeApp, v1 } from './helpers/harness';

const ME = v1('/me');

describe('helmet', () => {
  it('sets the standard security headers', async () => {
    const t = await makeApp();
    const res = await request(t.app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets them on error responses too', async () => {
    const t = await makeApp();
    const res = await request(t.app).get(ME);
    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS allowlist', () => {
  it('lets a listed origin read the response, and varies by origin', async () => {
    const t = await makeApp();
    const res = await request(t.app).get(ME).set('Origin', ALLOWED_ORIGIN);
    expect(res.status).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['vary']).toMatch(/Origin/i);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('refuses an origin that is not listed, with a JSON 403 and no CORS headers', async () => {
    const t = await makeApp();
    for (const origin of ['https://evil.example.test', 'http://app.example.test', 'https://app.example.test.evil.test', 'null']) {
      const res = await request(t.app).get(ME).set('Origin', origin);
      expect(res.status, origin).toBe(403);
      expect(res.body.error.code).toBe('origin_not_allowed');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expectNoLeak(res.body);
    }
  });

  it('answers a preflight from a listed origin with the methods and headers it may use', async () => {
    const t = await makeApp();
    const res = await request(t.app)
      .options(ME)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
    expect(res.headers['access-control-max-age']).toBeDefined();
  });

  it('refuses a preflight from an unlisted origin', async () => {
    const t = await makeApp();
    const res = await request(t.app)
      .options(ME)
      .set('Origin', 'https://evil.example.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard origin', async () => {
    const t = await makeApp();
    const res = await request(t.app).get(ME).set('Origin', ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('lets requests with no Origin header through (servers, curl, Stripe, the mobile app)', async () => {
    const t = await makeApp();
    const res = await request(t.app).get(ME);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('supports several allowed origins', async () => {
    const t = await makeApp({ corsOrigins: ['https://a.example.test', 'https://b.example.test'] });
    for (const origin of ['https://a.example.test', 'https://b.example.test']) {
      const res = await request(t.app).get(ME).set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
    expect((await request(t.app).get(ME).set('Origin', ALLOWED_ORIGIN)).status).toBe(403);
  });
});

describe('rate limiting (per IP)', () => {
  it('answers 429 with a JSON body and Retry-After once the limit is passed', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i += 1) expect((await request(t.app).get(ME)).status).toBe(401);
    const res = await request(t.app).get(ME);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
    expect(res.headers['ratelimit']).toBeDefined();
    expectNoLeak(res.body);
  });

  it('sends rate limit headers on normal responses so clients can back off', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 10 } });
    const res = await request(t.app).get(ME);
    expect(res.headers['ratelimit']).toBeDefined();
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('counts failed and successful requests alike, so token guessing is throttled', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 4 } });
    for (let i = 0; i < 4; i += 1) await request(t.app).get(ME).set('Authorization', 'Bearer guess');
    const { authorization } = await t.login('seeker');
    expect((await request(t.app).get(ME).set('Authorization', authorization)).status).toBe(429);
  });

  it('does not throttle the health check', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 5; i += 1) expect((await request(t.app).get('/health')).status).toBe(200);
  });

  it('is reset by a new window (separate app instance, separate counters)', async () => {
    const a = await makeApp({ rateLimit: { windowMs: 60_000, max: 1 } });
    const b = await makeApp({ rateLimit: { windowMs: 60_000, max: 1 } });
    await request(a.app).get(ME);
    expect((await request(a.app).get(ME)).status).toBe(429);
    expect((await request(b.app).get(ME)).status).toBe(401);
  });
});

describe('rate limiting (per user)', () => {
  it('answers 429 once a signed-in user passes their own limit', async () => {
    const t = await makeApp({ userRateLimit: { windowMs: 60_000, max: 3 } });
    const { authorization } = await t.login('seeker');
    for (let i = 0; i < 3; i += 1) expect((await request(t.app).get(ME).set('Authorization', authorization)).status).toBe(200);
    const res = await request(t.app).get(ME).set('Authorization', authorization);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  });

  it('gives every person their own counter, even from the same IP (many phones share a carrier address)', async () => {
    const t = await makeApp({ userRateLimit: { windowMs: 60_000, max: 2 } });
    const alice = await t.login('seeker');
    const bob = await t.login('seeker');
    for (let i = 0; i < 2; i += 1) await request(t.app).get(ME).set('Authorization', alice.authorization);
    expect((await request(t.app).get(ME).set('Authorization', alice.authorization)).status).toBe(429);
    expect((await request(t.app).get(ME).set('Authorization', bob.authorization)).status).toBe(200);
  });

  it('is not used up by requests that fail authentication', async () => {
    const t = await makeApp({ userRateLimit: { windowMs: 60_000, max: 2 } });
    for (let i = 0; i < 10; i += 1) await request(t.app).get(ME).set('Authorization', 'Bearer garbage');
    const { authorization } = await t.login('seeker');
    expect((await request(t.app).get(ME).set('Authorization', authorization)).status).toBe(200);
  });

  it('is separate from the per-IP limit', async () => {
    const t = await makeApp({ rateLimit: { windowMs: 60_000, max: 100 }, userRateLimit: { windowMs: 60_000, max: 1 } });
    const { authorization } = await t.login('seeker');
    await request(t.app).get(ME).set('Authorization', authorization);
    expect((await request(t.app).get(ME).set('Authorization', authorization)).status).toBe(429);
    expect((await request(t.app).get('/health')).status).toBe(200);
  });
});
