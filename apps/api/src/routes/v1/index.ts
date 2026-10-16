import type { Router } from 'express';
import type { JobTransitions } from '../../services/jobTransitions';
import { employerRouter } from './employer';
import { jobsRouter } from './jobs';
import { meRouter } from './me';

/** The server-only operations the signed-in routes may call. They are built in server.ts. */
export interface V1Services {
  jobTransitions: JobTransitions;
}

/**
 * Routes for signed-in users, mounted under /api/v1 after `authenticate` and the per-user rate
 * limit, so `req.auth` is always set. Every route here uses `req.auth.db` (the per-request,
 * RLS-bound client) for what the person may do themselves. Server-only operations (close, reopen,
 * cancel checkout...) come in through `services`, which check ownership in code. Do not import the
 * service-role client into a route (src/lib/serviceClient.ts).
 * Routes for people who are not signed in are in ./public.ts and are mounted before authentication.
 */
export function registerV1Routes(api: Router, services: V1Services): void {
  api.use(meRouter);
  api.use(employerRouter);
  api.use(jobsRouter(services.jobTransitions));
}
