import type { Router } from 'express';
import { meRouter } from './me';

/**
 * Routes for signed-in users. They are mounted under /api after `authenticate`, so `req.auth`
 * is always set. Every route here uses `req.auth.db` (the per-request, RLS-bound client).
 * Do not import the service-role client into a route (see src/lib/serviceClient.ts).
 */
export function registerApiRoutes(api: Router): void {
  api.use(meRouter);
}
