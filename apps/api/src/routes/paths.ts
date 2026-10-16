/**
 * Versioned prefix for every route that serves a person (sign-in required or not).
 * Mobile apps cannot be updated instantly, so an old app version keeps calling /api/v1 while a
 * future /api/v2 is built next to it.
 */
export const API_V1 = '/api/v1';

/** Not versioned on purpose: Stripe is configured with this exact URL. */
export const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';
