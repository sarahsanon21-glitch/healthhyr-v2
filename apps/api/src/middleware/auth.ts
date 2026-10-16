// Authentication: who is this, and what are they?
//
//  1. Verify the bearer token (signature, expiry, issuer, audience) against Supabase's public keys.
//  2. Read the person's role from the profiles table, using a client that carries THEIR token, so
//     row-level security decides what that query may see.
//
// The role never comes from the token or from anything the client sends. A user without a profile
// row is refused, because the signup trigger always creates one.
import type { RequestHandler } from 'express';
import { USER_ROLES, type UserRole } from '@healthhyr/shared';
import type { TokenVerifier } from '../auth/verifyToken';
import { TokenError } from '../auth/verifyToken';
import { forbidden, unauthorized } from '../errors';
import type { UserClientFactory } from '../lib/userClient';

const MAX_TOKEN_LENGTH = 8192;

function bearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!match || match[1]!.length > MAX_TOKEN_LENGTH) throw unauthorized();
  return match[1]!;
}

const isRole = (value: unknown): value is UserRole => typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);

export interface AuthDeps {
  verifyToken: TokenVerifier;
  createUserClient: UserClientFactory;
}

export function authenticate({ verifyToken, createUserClient }: AuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req.get('authorization'));

    let userId: string;
    try {
      ({ userId } = await verifyToken(token));
    } catch (error) {
      if (error instanceof TokenError && error.reason === 'expired') {
        throw unauthorized('token_expired', 'Your session has expired. Sign in again.');
      }
      throw unauthorized('invalid_token', 'Your session is not valid. Sign in again.');
    }

    const db = createUserClient(token);
    const { data, error } = await db.from('profiles').select('id, role').eq('id', userId).maybeSingle();

    if (error) {
      // PostgREST answers PGRST301 when it rejects the token itself. Anything else is our problem,
      // not the caller's, and becomes a generic 500 through the error handler.
      if (error.code === 'PGRST301' || error.code === 'PGRST303') {
        throw unauthorized('invalid_token', 'Your session is not valid. Sign in again.');
      }
      throw new Error('Could not load the signed-in user profile', { cause: error });
    }
    if (!data) throw forbidden('no_profile', 'Your account is not set up yet.');
    if (!isRole(data.role)) throw forbidden();

    req.auth = { userId, role: data.role, db };
    next();
  };
}
