import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expectNoLeak, makeApp } from './helpers/harness';

describe('error responses never leak', () => {
  it('a thrown Error becomes a generic 500: no message, stack, SQL or file path', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/boom').set('Authorization', authorization);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.', requestId: expect.any(String) },
    });
    expectNoLeak(res.body);
  });

  it('an async rejection with database-style fields leaks none of them', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/boom-async').set('Authorization', authorization);
    expect(res.status).toBe(500);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message', 'requestId']);
    expectNoLeak(res.body);
  });

  it('a thrown string or other non-Error value is handled and leaks nothing', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/boom-string').set('Authorization', authorization);
    expect(res.status).toBe(500);
    expectNoLeak(res.body);
  });

  it('the full error goes to the server log, with the request id, so support can find it', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/boom').set('Authorization', authorization);
    const entry = t.logs.find((log) => log.level === 'error');
    expect(entry?.fields.requestId).toBe(res.body.error.requestId);
    expect(JSON.stringify(entry?.fields)).toContain('password authentication failed');
    expect(JSON.stringify(entry?.fields)).not.toContain(authorization.slice(7));
  });

  it('the log never contains the caller’s token', async () => {
    const t = await makeApp();
    const { authorization, token } = await t.login('seeker');
    await request(t.app).get('/api/boom').set('Authorization', authorization);
    expect(JSON.stringify(t.logs)).not.toContain(token);
  });

  it('is identical in production and development: stack traces are never sent', async () => {
    const previous = process.env.NODE_ENV;
    try {
      for (const nodeEnv of ['production', 'development', 'test']) {
        process.env.NODE_ENV = nodeEnv;
        const t = await makeApp();
        const { authorization } = await t.login('seeker');
        const res = await request(t.app).get('/api/boom').set('Authorization', authorization);
        expectNoLeak(res.body);
        expect(res.body.error.code).toBe('internal_error');
      }
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('answers with JSON, never HTML, and never sets X-Powered-By', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/boom').set('Authorization', authorization);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('expected errors get fixed, friendly messages', () => {
  it('an HttpError keeps its status, code and message', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/http-error').set('Authorization', authorization);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'already_applied', message: 'You already applied to this job.' });
    expect(t.logs.filter((log) => log.level === 'error')).toEqual([]);
  });

  it('a validation failure is 400 with field paths and messages only, and does not echo the input', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app)
      .post('/api/validate')
      .set('Authorization', authorization)
      .send({ title: 'abc', payMin: 'a-secret-looking-input-value', extra: 'unexpected' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    const paths = res.body.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toContain('title');
    expect(paths).toContain('payMin');
    expect(JSON.stringify(res.body)).not.toContain('a-secret-looking-input-value');
    for (const issue of res.body.error.issues) expect(Object.keys(issue).sort()).toEqual(['message', 'path']);
  });

  it('malformed JSON is 400 invalid_json without a parser stack trace', async () => {
    const t = await makeApp();
    const res = await request(t.app).post('/api/echo').set('Content-Type', 'application/json').send('{"broken": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
    expectNoLeak(res.body, ['Unexpected', 'JSON at position', 'SyntaxError', 'body-parser']);
  });

  it('a body over the limit is 413 payload_too_large', async () => {
    const t = await makeApp({ jsonLimit: '1kb' });
    const res = await request(t.app).post('/api/echo').set('Content-Type', 'application/json').send({ big: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
    expectNoLeak(res.body);
  });

  it('an unknown route is a JSON 404', async () => {
    const t = await makeApp();
    const res = await request(t.app).get('/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('an unknown route behind /api is 404 for a signed-in user (after authentication)', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).get('/api/nothing-here').set('Authorization', authorization);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('request ids', () => {
  it('every response carries X-Request-Id, and errors repeat it in the body', async () => {
    const t = await makeApp();
    const res = await request(t.app).get('/api/me');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('keeps a well-formed incoming id and replaces a malformed one', async () => {
    const t = await makeApp();
    const kept = await request(t.app).get('/health').set('X-Request-Id', 'abc-12345-xyz');
    expect(kept.headers['x-request-id']).toBe('abc-12345-xyz');
    const replaced = await request(t.app).get('/health').set('X-Request-Id', 'bad id\twith spaces and "quotes"');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /health is open and reveals nothing', async () => {
    const t = await makeApp();
    const res = await request(t.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
