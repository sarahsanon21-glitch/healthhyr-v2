import express, { Router, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { TokenVerifier } from './auth/verifyToken';
import type { UserClientFactory } from './lib/userClient';
import { consoleLogger, type Logger } from './logger';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { corsAllowlist, rateLimiter, userRateLimiter, type RateLimitOptions } from './middleware/security';
import { healthRouter } from './routes/health';
import { API_V1, STRIPE_WEBHOOK_PATH } from './routes/paths';
import { reservedStripeWebhook } from './routes/stripeWebhook';
import { registerV1Routes } from './routes/v1';

/**
 * Everything the app needs, and nothing secret: no service-role key and no Stripe key come in here.
 * server.ts builds this from the validated config.
 */
export interface AppOptions {
  corsOrigins: string[];
  trustProxy: number;
  /** Per-IP limit, applied to everything except health and the Stripe webhook. */
  rateLimit: RateLimitOptions;
  /** Per-user limit, applied to signed-in routes after authentication. */
  userRateLimit?: RateLimitOptions;
  verifyToken: TokenVerifier;
  createUserClient: UserClientFactory;
  logger?: Logger;
  /** Replaces the reserved Stripe webhook handler. It receives the raw body as a Buffer. */
  stripeWebhook?: RequestHandler;
  /** Extra signed-in routes, mounted under /api/v1 after authentication. Used by tests. */
  registerRoutes?: (api: Router) => void;
  /** Max JSON body size. */
  jsonLimit?: string;
}

const DEFAULT_USER_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, max: 600 };

export function createApp(options: AppOptions): Express {
  const logger = options.logger ?? consoleLogger;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy);

  app.use(requestId);
  app.use(helmet());

  // The Stripe webhook comes first, with a RAW body parser. Signature verification needs the exact
  // bytes Stripe sent, which the JSON parser below would destroy. It has no CORS check or
  // per-IP limit (Stripe is not a browser, and its calls must never be throttled away): the
  // Stripe signature is its authentication. Its path is not versioned.
  app.post(STRIPE_WEBHOOK_PATH, express.raw({ type: 'application/json', limit: '1mb' }), options.stripeWebhook ?? reservedStripeWebhook);

  app.use(healthRouter);
  app.use(corsAllowlist(options.corsOrigins));
  app.use(rateLimiter(options.rateLimit));
  app.use(express.json({ limit: options.jsonLimit ?? '100kb' }));

  const api = Router();
  api.use(authenticate({ verifyToken: options.verifyToken, createUserClient: options.createUserClient }));
  api.use(userRateLimiter(options.userRateLimit ?? DEFAULT_USER_LIMIT));
  registerV1Routes(api);
  options.registerRoutes?.(api);
  app.use(API_V1, api);

  // Anything else, including the old unversioned /api/... paths, is a JSON 404.
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
