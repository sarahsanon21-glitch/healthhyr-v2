// The API lives under /api/v1. The old unversioned /api/... paths are gone.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_V1, STRIPE_WEBHOOK_PATH } from '../src/routes/paths';
import { makeApp, v1 } from './helpers/harness';

describe('API versioning', () => {
  it('the prefix is /api/v1', () => {
    expect(API_V1).toBe('/api/v1');
    expect(v1('/me')).toBe('/api/v1/me');
  });

  it('GET /api/v1/me works', async () => {
    const t = await makeApp();
    const { authorization, userId } = await t.login('employer');
    const res = await request(t.app).get('/api/v1/me').set('Authorization', authorization);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: userId, role: 'employer' });
  });

  it('the old GET /api/me is a 404, with and without a token', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    for (const headers of [{}, { Authorization: authorization }]) {
      const res = await request(t.app).get('/api/me').set(headers);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
  });

  it('none of the old unversioned paths exist', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('admin');
    for (const path of ['/api/seeker-only', '/api/admin-only', '/api/employer-or-admin', '/api/echo', '/api/anything']) {
      const res = await request(t.app).get(path).set('Authorization', authorization);
      expect(res.status, path).toBe(404);
    }
  });

  it('other versions do not exist yet', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    for (const path of ['/api/v2/me', '/api/v0/me', '/api/v10/me', '/api/v1x/me']) {
      expect((await request(t.app).get(path).set('Authorization', authorization)).status, path).toBe(404);
    }
  });

  it('health is not versioned and needs no sign-in', async () => {
    const t = await makeApp();
    expect((await request(t.app).get('/health')).status).toBe(200);
    expect((await request(t.app).get('/api/v1/health')).status).toBe(401);
  });

  it('the Stripe webhook path is unchanged and unversioned', async () => {
    const t = await makeApp();
    expect(STRIPE_WEBHOOK_PATH).toBe('/api/webhooks/stripe');
    const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(501);
  });
});
