import type { RequestHandler } from 'express';
import type { UserRole } from '@healthhyr/shared';
import { forbidden, unauthorized } from '../errors';

/**
 * Allows only the listed roles. Place it after `authenticate`. If authentication did not run,
 * it answers 401, so a mistake in route order can never let a request through.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}
