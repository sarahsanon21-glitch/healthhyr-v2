import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../errors';

/**
 * CORS allowlist. A browser request from an origin that is not listed is refused outright (403),
 * not just left without CORS headers. Requests with no Origin header (the Stripe webhook, curl,
 * server-to-server calls) are not browser cross-origin requests and pass through.
 * Credentials are off: the API uses bearer tokens, never cookies.
 */
export function corsAllowlist(origins: string[]): RequestHandler[] {
  const allowed = new Set(origins);
  const guard: RequestHandler = (req, _res, next) => {
    const origin = req.get('origin');
    if (origin !== undefined && !allowed.has(origin)) {
      return next(new HttpError(403, 'origin_not_allowed', 'This origin is not allowed.'));
    }
    next();
  };
  const headers = cors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  });
  return [guard, headers];
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/** Per-IP request limit. Use `strictLimiter` for expensive or abusable endpoints later. */
export function rateLimiter({ windowMs, max }: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', 'Too many requests. Please slow down and try again shortly.')),
  });
}

export const strictLimiter = (options: RateLimitOptions): RequestHandler => rateLimiter(options);
