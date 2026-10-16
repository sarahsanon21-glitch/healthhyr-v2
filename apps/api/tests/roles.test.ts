import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler';
import { requireRole } from '../src/middleware/requireRole';
import { silentLogger } from '../src/logger';
import { expectNoLeak, makeApp, v1 } from './helpers/harness';

describe('requireRole', () => {
  it('lets the allowed role through', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get(v1('/seeker-only')).set('Authorization', authorization);
    expect(res.status).toBe(200);
  });

  it.each([
    ['employer', 'employer'],
    ['admin', 'admin'],
  ])('403 for a %s on a seeker-only route', async (role) => {
    const t = await makeApp();
    const { authorization } = await t.login(role);
    const res = await request(t.app).get(v1('/seeker-only')).set('Authorization', authorization);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
    expectNoLeak(res.body);
  });

  it('403 for a seeker on an admin-only route, and 200 for an admin', async () => {
    const t = await makeApp();
    const seeker = await t.login('seeker');
    const admin = await t.login('admin');
    expect((await request(t.app).get(v1('/admin-only')).set('Authorization', seeker.authorization)).status).toBe(403);
    expect((await request(t.app).get(v1('/admin-only')).set('Authorization', admin.authorization)).status).toBe(200);
  });

  it('accepts any of several listed roles, and refuses the rest', async () => {
    const t = await makeApp();
    for (const [role, expected] of [
      ['employer', 200],
      ['admin', 200],
      ['seeker', 403],
    ] as const) {
      const { authorization } = await t.login(role);
      const res = await request(t.app).get(v1('/employer-or-admin')).set('Authorization', authorization);
      expect(res.status, role).toBe(expected);
    }
  });

  it('401, not 403, when there is no token at all', async () => {
    const t = await makeApp();
    const res = await request(t.app).get(v1('/admin-only'));
    expect(res.status).toBe(401);
  });

  it('fails closed with 401 if it is ever mounted without authenticate in front of it', async () => {
    const app = express();
    app.get('/oops', requireRole('seeker', 'employer', 'admin'), (_req, res) => void res.json({ leaked: true }));
    app.use(errorHandler(silentLogger));
    const res = await request(app).get('/oops');
    expect(res.status).toBe(401);
    expect(res.body.leaked).toBeUndefined();
  });

  it('the denial has the same shape everywhere: no hints about what exists', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const real = await request(t.app).get(v1('/admin-only')).set('Authorization', authorization);
    expect(Object.keys(real.body.error).sort()).toEqual(['code', 'message', 'requestId']);
  });
});
