import { Router } from 'express';

/** Liveness only: answers if the process is up. It checks nothing else and exposes nothing. */
export const healthRouter = Router().get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
