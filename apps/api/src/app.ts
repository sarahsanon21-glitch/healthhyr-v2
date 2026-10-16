import express, { Router, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { TokenVerifier } from './auth/verifyToken';
import type { UserClientFactory } from './lib/userClient';
import { consoleLogger, type Logger } from './logger';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { corsAllowlist, rateLimiter, type RateLimitOptions } from './middleware/security';
import { healthRouter } from './routes/health';
import { registerApiRoutes } from './routes';
import { STRIPE_WEBHOOK_PATH, reservedStripeWebhook } from './routes/stripeWebhook';

/**
 * Everything the app needs, and nothing secret: no service-role key and no Stripe key come in here.
 * server.ts builds this from the validated config.
 */
export interface AppOptions {
  corsOrigins: string[];
  trustProxy: number;
  rateLimit: RateLimitOptions;
  verifyToken: TokenVerifier;
  createUserClient: UserClientFactory;
  logger?: Logger;
  /** Replaces the reserved Stripe webhook handler. It receives the raw body as a Buffer. */
  stripeWebhook?: RequestHandler;
  /** Extra signed-in routes, mounted under /api after authentication. Used by tests. */
  registerRoutes?: (api: Router) => void;
  /** Max JSON body size. */
  jsonLimit?: string;
}

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
  // Stripe signature is its authentication.
  app.post(STRIPE_WEBHOOK_PATH, express.raw({ type: 'application/json', limit: '1mb' }), options.stripeWebhook ?? reservedStripeWebhook);

  app.use(healthRouter);
  app.use(corsAllowlist(options.corsOrigins));
  app.use(rateLimiter(options.rateLimit));
  app.use(express.json({ limit: options.jsonLimit ?? '100kb' }));

  const api = Router();
  api.use(authenticate({ verifyToken: options.verifyToken, createUserClient: options.createUserClient }));
  registerApiRoutes(api);
  options.registerRoutes?.(api);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
