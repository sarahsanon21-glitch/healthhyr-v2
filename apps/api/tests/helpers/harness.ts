// Test harness for the API. Tokens are signed with keys generated here, and the "database" is a
// stand-in for the user's Supabase client, so no network and no real Supabase are involved.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, Router } from 'express';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { z } from 'zod';
import { createApp, type AppOptions } from '../../src/app';
import { createTokenVerifier } from '../../src/auth/verifyToken';
import { HttpError } from '../../src/errors';
import type { Logger } from '../../src/logger';
import { requireRole } from '../../src/middleware/requireRole';
import { API_V1 } from '../../src/routes/paths';

export const ISSUER = 'https://project.example.test/auth/v1';
export const AUDIENCE = 'authenticated';
export const ALLOWED_ORIGIN = 'https://app.example.test';

/** A path under the versioned prefix: v1('/me') is '/api/v1/me'. */
export const v1 = (path: string): string => `${API_V1}${path}`;

export interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

export async function makeKey(kid: string, alg = 'ES256'): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { kid, privateKey, publicJwk: { ...jwk, kid, alg, use: 'sig' } };
}

export interface TokenOptions {
  sub?: string;
  /** Leave the subject claim out entirely. */
  omitSub?: boolean;
  /** Extra claims. They replace the defaults (role: "authenticated"). */
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  alg?: string;
  /** Seconds relative to now. Negative is in the past. Omit exp entirely with `false`. */
  expiresIn?: number | false;
  /** Seconds relative to now. */
  notBefore?: number;
  kid?: string;
}

export async function signToken(key: TestKey, options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({ role: 'authenticated', ...options.claims })
    .setProtectedHeader({ alg: options.alg ?? 'ES256', kid: options.kid ?? key.kid, typ: 'JWT' })
    .setIssuedAt(now - 10)
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE);
  if (!options.omitSub) builder.setSubject(options.sub ?? randomUUID());
  if (options.expiresIn !== false) builder.setExpirationTime(now + (options.expiresIn ?? 3600));
  if (options.notBefore !== undefined) builder.setNotBefore(now + options.notBefore);
  return builder.sign(key.privateKey);
}

export interface ProfileRow {
  id: string;
  role: string;
}

export interface FakeDbOptions {
  /** What the profiles query returns as an error. */
  error?: { message: string; code?: string };
}

export interface Recorder {
  /** Tokens passed to the per-request client factory, in order. */
  clientTokens: string[];
  /** Every profiles lookup: which column and value it filtered on. */
  lookups: Array<{ table: string; column: string; value: unknown }>;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  fields: Record<string, unknown>;
}

export interface TestApp {
  app: Express;
  signingKey: TestKey;
  otherKey: TestKey;
  /** profiles table stand-in: user id -> row (null means no row). */
  profiles: Map<string, ProfileRow | null>;
  recorder: Recorder;
  logs: LogEntry[];
  /** A valid token for a user. With a role, also creates the profile row. */
  login: (role?: string | null, options?: TokenOptions) => Promise<{ token: string; userId: string; authorization: string }>;
}

export interface MakeAppOptions
  extends Partial<Pick<AppOptions, 'corsOrigins' | 'rateLimit' | 'userRateLimit' | 'stripeWebhook' | 'jsonLimit'>> {
  db?: FakeDbOptions;
  registerRoutes?: (api: Router) => void;
}

/** Routes that exist only for tests, mounted under /api/v1 after authentication. */
function testRoutes(api: Router): void {
  api.get('/seeker-only', requireRole('seeker'), (_req, res) => void res.json({ ok: true }));
  api.get('/employer-or-admin', requireRole('employer', 'admin'), (_req, res) => void res.json({ ok: true }));
  api.get('/admin-only', requireRole('admin'), (_req, res) => void res.json({ ok: true }));
  api.get('/boom', () => {
    throw new Error('SELECT * FROM payments WHERE secret = 1 failed: password authentication failed for user "postgres" at C:\\dev\\app\\db.ts:42');
  });
  api.get('/boom-async', async () => {
    await Promise.resolve();
    throw Object.assign(new Error('relation "seeker_private" does not exist'), { code: '42P01', details: 'internal detail', hint: 'internal hint' });
  });
  api.get('/boom-string', () => {
    throw 'a plain string with secret-token-value';
  });
  api.get('/http-error', () => {
    throw new HttpError(409, 'already_applied', 'You already applied to this job.');
  });
  api.post('/validate', (req) => {
    z.object({ title: z.string().min(5), payMin: z.number() }).strict().parse(req.body);
  });
  api.post('/echo', (req, res) => void res.json({ received: req.body }));
}

function fakeUserClient(profiles: Map<string, ProfileRow | null>, recorder: Recorder, dbOptions: FakeDbOptions): (token: string) => SupabaseClient {
  return (token) => {
    recorder.clientTokens.push(token);
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: async () => {
              recorder.lookups.push({ table, column, value });
              if (dbOptions.error) return { data: null, error: dbOptions.error };
              return { data: profiles.get(String(value)) ?? null, error: null };
            },
          }),
        }),
      }),
    };
    return client as unknown as SupabaseClient;
  };
}

export async function makeApp(options: MakeAppOptions = {}): Promise<TestApp> {
  const signingKey = await makeKey('test-key-1');
  const otherKey = await makeKey('attacker-key');
  const profiles = new Map<string, ProfileRow | null>();
  const recorder: Recorder = { clientTokens: [], lookups: [] };
  const logs: LogEntry[] = [];

  const logger: Logger = {
    info: (fields, message) => void logs.push({ level: 'info', message, fields }),
    warn: (fields, message) => void logs.push({ level: 'warn', message, fields }),
    error: (fields, message) => void logs.push({ level: 'error', message, fields }),
  };

  const app = createApp({
    corsOrigins: options.corsOrigins ?? [ALLOWED_ORIGIN],
    trustProxy: 0,
    rateLimit: options.rateLimit ?? { windowMs: 60_000, max: 1000 },
    userRateLimit: options.userRateLimit ?? { windowMs: 60_000, max: 1000 },
    verifyToken: createTokenVerifier({ keys: createLocalJWKSet({ keys: [signingKey.publicJwk] }), issuer: ISSUER, audience: AUDIENCE }),
    createUserClient: fakeUserClient(profiles, recorder, options.db ?? {}),
    logger,
    ...(options.stripeWebhook && { stripeWebhook: options.stripeWebhook }),
    ...(options.jsonLimit && { jsonLimit: options.jsonLimit }),
    registerRoutes: (api) => {
      testRoutes(api);
      options.registerRoutes?.(api);
    },
  });

  return {
    app,
    signingKey,
    otherKey,
    profiles,
    recorder,
    logs,
    login: async (role = 'seeker', tokenOptions = {}) => {
      const userId = tokenOptions.sub ?? randomUUID();
      if (role !== null) profiles.set(userId, { id: userId, role });
      const token = await signToken(signingKey, { ...tokenOptions, sub: userId });
      return { token, userId, authorization: `Bearer ${token}` };
    },
  };
}

/** Strings that must never appear in an error response body. */
export const LEAKY = [
  'stack',
  'node_modules',
  'at Object',
  'at async',
  'C:\\',
  '/src/',
  '.ts:',
  'SELECT ',
  'postgres',
  'relation "',
  'password',
  '42P01',
  'internal detail',
  'internal hint',
  'secret-token-value',
];

export function expectNoLeak(body: unknown, extra: string[] = []): string {
  const text = JSON.stringify(body);
  const found = [...LEAKY, ...extra].filter((needle) => text.toLowerCase().includes(needle.toLowerCase()));
  if (found.length > 0) throw new Error(`response leaked ${JSON.stringify(found)}: ${text}`);
  return text;
}
