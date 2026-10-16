import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Only well-formed incoming ids are kept, so a caller cannot inject odd characters into the logs.
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
