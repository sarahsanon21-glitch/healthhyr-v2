import { Router } from 'express';
import { unauthorized } from '../errors';

/** Who am I? The smallest authenticated route, and a way for the web app to learn its role. */
export const meRouter = Router().get('/me', (req, res) => {
  if (!req.auth) throw unauthorized();
  res.json({ id: req.auth.userId, role: req.auth.role });
});
