// Verifies a Supabase access token against the project's published public keys (JWKS).
//
// Checks: signature, expiry, not-before, issuer, audience, and the presence of exp and sub.
// Only asymmetric algorithms are accepted, so "alg: none" and the classic trick of signing with the
// public key as an HMAC secret are both refused. The role claim in the token is only used to tell
// signed-in user tokens from the anon and service keys. It is never used to grant anything: the
// real role is read from the profiles table (see middleware/auth.ts).
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type TokenFailure = 'expired' | 'invalid';

export class TokenError extends Error {
  constructor(readonly reason: TokenFailure) {
    super(`token ${reason}`);
    this.name = 'TokenError';
  }
}

export interface VerifiedToken {
  userId: string;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

export interface TokenVerifierOptions {
  keys: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  clockToleranceSeconds?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGORITHMS = ['ES256', 'RS256'];

export function createTokenVerifier({ keys, issuer, audience, clockToleranceSeconds = 5 }: TokenVerifierOptions): TokenVerifier {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience,
        algorithms: ALGORITHMS,
        requiredClaims: ['exp', 'iat', 'sub'],
        clockTolerance: clockToleranceSeconds,
      });

      // Supabase user tokens have role "authenticated". The anon and service-role keys do not,
      // and anonymous sign-ins are not used here.
      if (payload.role !== 'authenticated' || payload.is_anonymous === true) throw new TokenError('invalid');
      if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new TokenError('invalid');
      return { userId: payload.sub.toLowerCase() };
    } catch (error) {
      if (error instanceof TokenError) throw error;
      if (error instanceof errors.JWTExpired) throw new TokenError('expired');
      throw new TokenError('invalid');
    }
  };
}

/** The project's public keys, fetched over HTTPS and cached. Nothing is fetched until the first token arrives. */
export function remoteKeys(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl), {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
}
