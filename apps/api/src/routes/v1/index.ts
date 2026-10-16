import type { Router } from 'express';
import { employerRouter } from './employer';
import { meRouter } from './me';

/**
 * Routes for signed-in users, mounted under /api/v1 after `authenticate` and the per-user rate
 * limit, so `req.auth` is always set. Every route here uses `req.auth.db` (the per-request,
 * RLS-bound client). Do not import the service-role client into a route (src/lib/serviceClient.ts).
 * Routes for people who are not signed in are in ./public.ts and are mounted before authentication.
 */
export function registerV1Routes(api: Router): void {
  api.use(meRouter);
  api.use(employerRouter);
}
