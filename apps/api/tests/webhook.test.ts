import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { STRIPE_WEBHOOK_PATH } from '../src/routes/paths';
import { expectNoLeak, makeApp, v1 } from './helpers/harness';

function capture() {
  const seen: Array<{ body: unknown; contentType: string | undefined }> = [];
  const handler: RequestHandler = (req, res) => {
    seen.push({ body: req.body, contentType: req.get('content-type') });
    res.json({ received: true });
  };
  return { seen, handler };
}

describe('Stripe webhook route', () => {
  it('keeps its unversioned path, /api/webhooks/stripe (Stripe is configured with the URL)', () => {
    expect(STRIPE_WEBHOOK_PATH).toBe('/api/webhooks/stripe');
    expect(STRIPE_WEBHOOK_PATH).not.toContain('/v1');
  });

  it('is not reachable under the versioned prefix', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const res = await request(t.app).post(v1('/webhooks/stripe')).set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('receives the RAW body, byte for byte, not parsed JSON', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    // Odd spacing, key order and a trailing newline: a re-serialized body would not match.
    const payload = '{ "type":"checkout.session.completed",  "id":"evt_1",\n "data":{"b":1,"a":2} }\n';
    const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send(payload);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(Buffer.isBuffer(seen[0]!.body)).toBe(true);
    expect((seen[0]!.body as Buffer).toString('utf8')).toBe(payload);
  });

  it('keeps exact bytes for non-ASCII payloads too', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const payload = '{"name":"Zoë Müller — 日本語 ✓"}';
    await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json; charset=utf-8').send(payload);
    expect(Buffer.compare(seen[0]!.body as Buffer, Buffer.from(payload, 'utf8'))).toBe(0);
  });

  it('contrast: every other route gets a parsed object, so the raw route really is mounted first', async () => {
    const t = await makeApp();
    const { authorization } = await t.login('seeker');
    const res = await request(t.app).post(v1('/echo')).set('Authorization', authorization).send({ a: 1 });
    expect(res.body.received).toEqual({ a: 1 });
  });

  it('needs no sign-in: the Stripe signature is its authentication', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(t.recorder.clientTokens).toEqual([]);
  });

  it('is not throttled by the per-IP limit, because Stripe retries must always get through', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler, rateLimit: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 6; i += 1) {
      const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send('{}');
      expect(res.status).toBe(200);
    }
    expect(seen).toHaveLength(6);
  });

  it('is not subject to the browser origin check, since Stripe is not a browser', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
  });

  it('only handles POST: a GET does not reach the handler', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const res = await request(t.app).get(STRIPE_WEBHOOK_PATH);
    expect(res.status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it('does not parse a body that is not JSON', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'text/plain').send('hello');
    expect(Buffer.isBuffer(seen[0]!.body)).toBe(false);
  });

  it('rejects a body over 1 MB with a generic 413', async () => {
    const { seen, handler } = capture();
    const t = await makeApp({ stripeWebhook: handler });
    const res = await request(t.app)
      .post(STRIPE_WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ big: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
    expect(seen).toHaveLength(0);
    expectNoLeak(res.body);
  });
});

describe('the reserved handler (until the webhook is built)', () => {
  it('answers 501 not_implemented as JSON with a request id', async () => {
    const t = await makeApp();
    const res = await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'application/json').send('{"x":1}');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('not_implemented');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('still answers 501 when the body is not JSON or is empty', async () => {
    const t = await makeApp();
    expect((await request(t.app).post(STRIPE_WEBHOOK_PATH).set('Content-Type', 'text/plain').send('hi')).status).toBe(501);
    expect((await request(t.app).post(STRIPE_WEBHOOK_PATH)).status).toBe(501);
  });
});
