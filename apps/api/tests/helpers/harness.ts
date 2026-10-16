// Test harness for the API. Tokens are signed with keys generated here, and the "database" is a
// stand-in for the Supabase clients, so no network and no real Supabase are involved.
//
// The stand-in answers the way the real database would for the tables the API touches, including
// what row-level security allows, and it records every query so tests can check what the code asked
// for. Real RLS through the real Data API is tested separately in tests/integration.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, Router } from 'express';
import { SignJWT, createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
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

/**
 * A whole employer_profiles row, including columns no response may show. The stand-in returns all
 * of it on purpose: it is the worst case, so a route that forgets to pick fields gets caught.
 */
export interface CompanyRow {
  id: string;
  company_name: string;
  is_listed: boolean;
  slug: string | null;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface FakeDbOptions {
  /** What the profiles query returns as an error. */
  error?: { message: string; code?: string };
  /** What any employer_profiles query returns as an error. */
  companyError?: { message: string; code?: string };
  /**
   * Whether the stand-in applies row-level security. On (the default) it behaves like the real
   * database. Off, it answers any row the query asks for, which shows what the CODE would do if the
   * policies were ever loosened.
   */
  rls?: boolean;
}

export interface QueryRecord {
  client: 'user' | 'anon';
  table: string;
  op: 'select' | 'update';
  columns?: string;
  values?: Record<string, unknown>;
  filters: Array<[column: string, value: unknown]>;
}

export interface Recorder {
  /** Tokens passed to the per-request client factory, in order. */
  clientTokens: string[];
  /** Every profiles lookup: which column and value it filtered on. */
  lookups: Array<{ table: string; column: string; value: unknown }>;
  /** Every query to a table other than profiles, by either client. */
  queries: QueryRecord[];
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
  /** employer_profiles table stand-in: employer id -> row. */
  companies: Map<string, CompanyRow>;
  recorder: Recorder;
  logs: LogEntry[];
  /** A valid token for a user. With a role, also creates the profile row (and a company row for an employer). */
  login: (role?: string | null, options?: TokenOptions) => Promise<{ token: string; userId: string; authorization: string }>;
  /** Puts a company row in the stand-in, as the signup trigger and later edits would. */
  addCompany: (id: string, fields?: Partial<CompanyRow>) => CompanyRow;
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

const DEFAULT_COMPANY_NAME = 'My company';

/** Mirrors the employer_profiles_listing trigger in the schema. */
function applyListingTrigger(row: CompanyRow): void {
  row.is_listed = row.company_name.trim().length > 0 && row.company_name !== DEFAULT_COMPANY_NAME;
  if (row.is_listed && row.slug === null) {
    const base = row.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    row.slug = `${base}-${row.id.slice(0, 6)}`;
  }
}

export function makeCompanyRow(id: string, fields: Partial<CompanyRow> = {}): CompanyRow {
  const row: CompanyRow = {
    id,
    company_name: DEFAULT_COMPANY_NAME,
    is_listed: false,
    slug: null,
    description: null,
    website: null,
    logo_url: null,
    industry: null,
    company_size: null,
    city: null,
    state: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...fields,
  };
  if (fields.is_listed === undefined && fields.slug === undefined) applyListingTrigger(row);
  return row;
}

interface Stores {
  profiles: Map<string, ProfileRow | null>;
  companies: Map<string, CompanyRow>;
  recorder: Recorder;
  dbOptions: FakeDbOptions;
}

function tokenUser(token: string | null): string | null {
  if (!token) return null;
  try {
    return decodeJwt(token).sub ?? null;
  } catch {
    return null;
  }
}

/** A Supabase client stand-in. `token` is null for the anon client. */
function fakeClient(stores: Stores, token: string | null): SupabaseClient {
  const { profiles, companies, recorder, dbOptions } = stores;
  const user = tokenUser(token);
  const rls = dbOptions.rls ?? true;
  const client: QueryRecord['client'] = token ? 'user' : 'anon';

  const from = (table: string) => {
    const query: QueryRecord = { client, table, op: 'select', filters: [] };
    const builder = {
      select(columns?: string) {
        if (columns !== undefined && query.op === 'select') query.columns = columns;
        return builder;
      },
      update(values: Record<string, unknown>) {
        query.op = 'update';
        query.values = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        query.filters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        if (table === 'profiles') {
          const filter = query.filters[0];
          recorder.lookups.push({ table, column: filter?.[0] ?? '', value: filter?.[1] });
          if (dbOptions.error) return { data: null, error: dbOptions.error };
          return { data: profiles.get(String(filter?.[1])) ?? null, error: null };
        }

        recorder.queries.push(query);
        if (dbOptions.companyError) return { data: null, error: dbOptions.companyError };
        if (table !== 'employer_profiles') return { data: null, error: null };

        const matching = [...companies.values()].filter((row) =>
          query.filters.every(([column, value]) => (row as unknown as Record<string, unknown>)[column] === value),
        );

        if (query.op === 'update') {
          if (client === 'anon') return { data: null, error: { message: 'permission denied for table employer_profiles', code: '42501' } };
          const row = matching.find((candidate) => !rls || candidate.id === user);
          if (!row) return { data: null, error: null };
          Object.assign(row, query.values);
          applyListingTrigger(row);
          return { data: { ...row }, error: null };
        }

        // select: anyone sees listed companies; a signed-in owner also sees their own (policy employer_select)
        const visible = matching.filter((row) => !rls || row.is_listed || (client === 'user' && row.id === user));
        if (visible.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } };
        return { data: visible[0] ? { ...visible[0] } : null, error: null };
      },
    };
    return builder;
  };

  return { from } as unknown as SupabaseClient;
}

export async function makeApp(options: MakeAppOptions = {}): Promise<TestApp> {
  const signingKey = await makeKey('test-key-1');
  const otherKey = await makeKey('attacker-key');
  const profiles = new Map<string, ProfileRow | null>();
  const companies = new Map<string, CompanyRow>();
  const recorder: Recorder = { clientTokens: [], lookups: [], queries: [] };
  const logs: LogEntry[] = [];
  const stores: Stores = { profiles, companies, recorder, dbOptions: options.db ?? {} };

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
    createUserClient: (token) => {
      recorder.clientTokens.push(token);
      return fakeClient(stores, token);
    },
    anonClient: fakeClient(stores, null),
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
    companies,
    recorder,
    logs,
    addCompany: (id, fields = {}) => {
      const row = makeCompanyRow(id, fields);
      companies.set(id, row);
      return row;
    },
    login: async (role = 'seeker', tokenOptions = {}) => {
      const userId = tokenOptions.sub ?? randomUUID();
      if (role !== null) {
        profiles.set(userId, { id: userId, role });
        // The signup trigger gives every employer a company row, still on the default name.
        if (role === 'employer') companies.set(userId, makeCompanyRow(userId));
      }
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
