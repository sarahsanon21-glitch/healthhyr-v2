import { Router } from 'express';
import { unauthorized } from '../../errors';

/**
 * Who am I? The smallest authenticated route, and the one place the web app and the mobile app
 * learn their role. The role is read from the database on every request (middleware/auth.ts).
 * A signed-in user with no profile never gets here: they receive 403 no_profile first.
 */
export const meRouter = Router().get('/me', (req, res) => {
  if (!req.auth) throw unauthorized();
  res.json({ id: req.auth.userId, role: req.auth.role });
});
