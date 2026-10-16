import type { RequestHandler } from 'express';

/**
 * Reserved. Until the webhook is built (signature check, idempotency, publish), it answers 501.
 * When it is built, `req.body` is the raw Buffer, which is what signature verification needs.
 * The path itself lives in routes/paths.ts (STRIPE_WEBHOOK_PATH) and is not versioned.
 */
export const reservedStripeWebhook: RequestHandler = (req, res) => {
  res.status(501).json({
    error: { code: 'not_implemented', message: 'Stripe webhooks are not enabled yet.', requestId: req.id },
  });
};
