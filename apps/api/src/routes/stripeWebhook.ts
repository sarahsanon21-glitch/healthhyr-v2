import type { RequestHandler } from 'express';

/** The path Stripe posts to. The route is mounted before the JSON parser (see app.ts). */
export const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';

/**
 * Reserved. Until the webhook is built (signature check, idempotency, publish), it answers 501.
 * When it is built, `req.body` is the raw Buffer, which is what signature verification needs.
 */
export const reservedStripeWebhook: RequestHandler = (req, res) => {
  res.status(501).json({
    error: { code: 'not_implemented', message: 'Stripe webhooks are not enabled yet.', requestId: req.id },
  });
};
