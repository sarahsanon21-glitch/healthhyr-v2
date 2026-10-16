// Test harness for the API. Tokens are signed with keys generated here, and the "database" is a
// stand-in for the Supabase clients, so no network and no real Supabase are involved.
//
// The stand-in answers the way the real database would for the tables the API touches, including
// what row-level security and the guard triggers allow, and it records every query so tests can
// check what the code asked for. It returns whole rows on purpose, so a route that forgets to pick
// fields gets caught. Real RLS through the real Data API is tested separately in tests/integration.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, Router } from 'express';
import { SignJWT, createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { z } from 'zod';
import { createApp, type AppOptions } from '../../src/app';
import { createTokenVerifier } from '../../src/auth/verifyToken';
import { HttpError, notFound } from '../../src/errors';
import type { Logger } from '../../src/logger';
import { requireRole } from '../../src/middleware/requireRole';
import { API_V1 } from '../../src/routes/paths';
import type { JobTransitions, ReopenOutcome } from '../../src/services/jobTransitions';

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

/** A whole jobs row, including the columns no response may show (employer_id, payment_id). */
export interface JobRow {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  care_role: string;
  employment_type: string;
  city: string;
  state: string;
  zip: string | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: string | null;
  easy_apply: boolean;
  status: 'draft' | 'pending_payment' | 'published' | 'expired' | 'closed';
  payment_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FakeDbOptions {
  /** What the profiles query returns as an error. */
  error?: { message: string; code?: string };
  /** What any employer_profiles query returns as an error. */
  companyError?: { message: string; code?: string };
  /** What any jobs query returns as an error. */
  jobError?: { message: string; code?: string };
  /** What a jobs UPDATE returns as an error (after the route's own checks have passed). */
  jobUpdateError?: { message: string; code?: string };
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
  op: 'select' | 'insert' | 'update' | 'delete';
  columns?: string;
  values?: Record<string, unknown>;
  filters: Array<[column: string, value: unknown]>;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export interface Recorder {
  /** Tokens passed to the per-request client factory, in order. */
  clientTokens: string[];
  /** Every profiles lookup: which column and value it filtered on. */
  lookups: Array<{ table: string; column: string; value: unknown }>;
  /** Every query to a table other than profiles, by either client. */
  queries: QueryRecord[];
  /** Every call to the server-only job transitions: what, for whom, on which job. */
  transitions: Array<{ action: 'close' | 'reopen' | 'cancelCheckout'; employerId: string; jobId: string }>;
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
  /** jobs table stand-in: job id -> row. */
  jobs: Map<string, JobRow>;
  /** Jobs that have payment history (a payments row), so they can never be deleted. */
  paymentHistory: Set<string>;
  recorder: Recorder;
  logs: LogEntry[];
  /** A valid token for a user. With a role, also creates the profile row (and a company row for an employer). */
  login: (role?: string | null, options?: TokenOptions) => Promise<{ token: string; userId: string; authorization: string }>;
  /** Puts a company row in the stand-in, as the signup trigger and later edits would. */
  addCompany: (id: string, fields?: Partial<CompanyRow>) => CompanyRow;
  /** Puts a job row in the stand-in. */
  addJob: (employerId: string, fields?: Partial<JobRow>) => JobRow;
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

export function makeJobRow(employerId: string, fields: Partial<JobRow> = {}): JobRow {
  const now = new Date().toISOString();
  const status = fields.status ?? 'draft';
  const live = status === 'published' || status === 'closed' || status === 'expired';
  return {
    id: randomUUID(),
    employer_id: employerId,
    title: 'Home health aide',
    description: 'Support clients with daily living activities in their homes across the county, including meals.',
    care_role: 'hha',
    employment_type: 'part_time',
    city: 'Austin',
    state: 'TX',
    zip: null,
    pay_min: null,
    pay_max: null,
    pay_period: null,
    easy_apply: true,
    status,
    payment_id: live ? randomUUID() : null,
    published_at: live ? '2026-01-01T00:00:00Z' : null,
    expires_at: live ? new Date(Date.now() + 10 * 86_400_000).toISOString() : null,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}

interface Stores {
  profiles: Map<string, ProfileRow | null>;
  companies: Map<string, CompanyRow>;
  jobs: Map<string, JobRow>;
  paymentHistory: Set<string>;
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

type DbResult = { data: unknown; error: { message: string; code?: string } | null };

/** A Supabase client stand-in. `token` is null for the anon client. */
function fakeClient(stores: Stores, token: string | null): SupabaseClient {
  const { profiles, companies, jobs, paymentHistory, recorder, dbOptions } = stores;
  const user = tokenUser(token);
  const rls = dbOptions.rls ?? true;
  const client: QueryRecord['client'] = token ? 'user' : 'anon';

  const matches = (row: object, filters: QueryRecord['filters']) =>
    filters.every(([column, value]) => (row as Record<string, unknown>)[column] === value);

  function runCompanies(query: QueryRecord): DbResult {
    if (dbOptions.companyError) return { data: null, error: dbOptions.companyError };
    const matching = [...companies.values()].filter((row) => matches(row, query.filters));

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
  }

  function runJobs(query: QueryRecord): DbResult {
    if (dbOptions.jobError) return { data: null, error: dbOptions.jobError };
    const now = Date.now();
    const isPublic = (row: JobRow) =>
      row.status === 'published' && row.expires_at !== null && Date.parse(row.expires_at) > now && !!companies.get(row.employer_id)?.is_listed;
    // policies jobs_public_read + jobs_owner_read
    const canSee = (row: JobRow) => !rls || isPublic(row) || (client === 'user' && row.employer_id === user);
    const matching = [...jobs.values()].filter((row) => matches(row, query.filters));

    if (query.op === 'select') {
      let rows = matching.filter(canSee).map((row) => ({ ...row }));
      if (query.order) {
        const { column, ascending } = query.order;
        rows = rows.sort((a, b) => {
          const left = String((a as unknown as Record<string, unknown>)[column]);
          const right = String((b as unknown as Record<string, unknown>)[column]);
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (query.limit !== undefined) rows = rows.slice(0, query.limit);
      return { data: rows, error: null };
    }

    if (client === 'anon') return { data: null, error: { message: 'permission denied for table jobs', code: '42501' } };

    if (query.op === 'insert') {
      const values = (query.values ?? {}) as Partial<JobRow>;
      // policy jobs_owner_insert
      if (rls && values.employer_id !== user) {
        return { data: null, error: { message: 'new row violates row-level security policy for table "jobs"', code: '42501' } };
      }
      // jobs_guard: new jobs must be drafts, with no payment or dates
      const guarded = ['status', 'payment_id', 'published_at', 'expires_at'] as const;
      if (guarded.some((key) => key in values)) {
        return { data: null, error: { message: 'new jobs must be drafts', code: 'P0001' } };
      }
      const row = makeJobRow(values.employer_id as string, values);
      jobs.set(row.id, row);
      return { data: { ...row }, error: null };
    }

    if (query.op === 'update') {
      const row = matching.find((candidate) => !rls || candidate.employer_id === user);
      if (!row) return { data: null, error: null };
      const values = (query.values ?? {}) as Partial<JobRow>;
      // jobs_guard: status, payment, dates and owner are server-managed; content is locked while waiting for payment
      if (['status', 'payment_id', 'published_at', 'expires_at', 'employer_id'].some((key) => key in values)) {
        return { data: null, error: { message: 'status, payment and dates are server-managed', code: 'P0001' } };
      }
      if (row.status === 'pending_payment') return { data: null, error: { message: 'cancel checkout before editing this job', code: 'P0001' } };
      if (dbOptions.jobUpdateError) return { data: null, error: dbOptions.jobUpdateError };
      Object.assign(row, values, { updated_at: new Date().toISOString() });
      return { data: { ...row }, error: null };
    }

    // delete: policy jobs_owner_delete (own, draft, no payment history)
    const deletable = matching.filter(
      (row) => (!rls || (row.employer_id === user && row.status === 'draft')) && !paymentHistory.has(row.id),
    );
    for (const row of deletable) jobs.delete(row.id);
    return { data: deletable.map((row) => ({ ...row })), error: null };
  }

  const from = (table: string) => {
    const query: QueryRecord = { client, table, op: 'select', filters: [] };
    let wantsOne = false;

    const execute = (): DbResult => {
      if (table === 'profiles') {
        const filter = query.filters[0];
        recorder.lookups.push({ table, column: filter?.[0] ?? '', value: filter?.[1] });
        if (dbOptions.error) return { data: null, error: dbOptions.error };
        return { data: profiles.get(String(filter?.[1])) ?? null, error: null };
      }
      recorder.queries.push(query);
      if (table === 'employer_profiles') return runCompanies(query);
      if (table === 'jobs') return runJobs(query);
      return { data: null, error: null };
    };

    const builder = {
      select(columns?: string) {
        if (columns !== undefined && query.op === 'select') query.columns = columns;
        return builder;
      },
      insert(values: Record<string, unknown>) {
        query.op = 'insert';
        query.values = values;
        return builder;
      },
      update(values: Record<string, unknown>) {
        query.op = 'update';
        query.values = values;
        return builder;
      },
      delete() {
        query.op = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        query.filters.push([column, value]);
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        query.order = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      limit(count: number) {
        query.limit = count;
        return builder;
      },
      async maybeSingle() {
        wantsOne = true;
        const result = execute();
        // A real client returns one row (or null) for maybeSingle; the stand-in's runners return a
        // row for update and insert, and a list for select and delete.
        if (wantsOne && Array.isArray(result.data)) {
          if (result.data.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } };
          return { data: result.data[0] ?? null, error: result.error };
        }
        return result;
      },
      // `await builder` runs the query and returns every row, as the real client does.
      then(resolve: (value: DbResult) => unknown, reject?: (reason: unknown) => unknown) {
        try {
          const result = execute();
          const data = result.data === null || Array.isArray(result.data) ? result.data : [result.data];
          return Promise.resolve({ data, error: result.error }).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return builder;
  };

  return { from } as unknown as SupabaseClient;
}

/**
 * A stand-in for the server-only job transitions, following the same rules as the SQL functions
 * (close_job, reopen_job, cancel_checkout) and the same ownership check, and recording each call.
 */
function fakeTransitions(stores: Stores): JobTransitions {
  const { jobs, recorder } = stores;
  const own = (employerId: string, jobId: string): JobRow => {
    const job = jobs.get(jobId);
    if (!job || job.employer_id !== employerId) throw notFound();
    return job;
  };
  return {
    async close(employerId, jobId) {
      recorder.transitions.push({ action: 'close', employerId, jobId });
      const job = own(employerId, jobId);
      if (job.status !== 'published') throw new HttpError(409, 'job_not_published', 'Only a published job can be closed.');
      job.status = 'closed';
    },
    async reopen(employerId, jobId): Promise<ReopenOutcome> {
      recorder.transitions.push({ action: 'reopen', employerId, jobId });
      const job = own(employerId, jobId);
      if (job.status === 'closed' && job.expires_at !== null && Date.parse(job.expires_at) > Date.now()) {
        job.status = 'published';
        return 'published';
      }
      if (job.status === 'expired' || job.status === 'closed') {
        Object.assign(job, { status: 'draft', payment_id: null, published_at: null, expires_at: null });
        return 'draft';
      }
      throw new HttpError(409, 'job_not_reopenable', 'Only a closed or expired job can be reopened.');
    },
    async cancelCheckout(employerId, jobId) {
      recorder.transitions.push({ action: 'cancelCheckout', employerId, jobId });
      const job = own(employerId, jobId);
      if (job.status !== 'pending_payment') throw new HttpError(409, 'not_waiting_for_payment', 'This job is not waiting for payment.');
      job.status = 'draft';
    },
  };
}

export async function makeApp(options: MakeAppOptions = {}): Promise<TestApp> {
  const signingKey = await makeKey('test-key-1');
  const otherKey = await makeKey('attacker-key');
  const profiles = new Map<string, ProfileRow | null>();
  const companies = new Map<string, CompanyRow>();
  const jobs = new Map<string, JobRow>();
  const paymentHistory = new Set<string>();
  const recorder: Recorder = { clientTokens: [], lookups: [], queries: [], transitions: [] };
  const logs: LogEntry[] = [];
  const stores: Stores = { profiles, companies, jobs, paymentHistory, recorder, dbOptions: options.db ?? {} };

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
    jobTransitions: fakeTransitions(stores),
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
    jobs,
    paymentHistory,
    recorder,
    logs,
    addCompany: (id, fields = {}) => {
      const row = makeCompanyRow(id, fields);
      companies.set(id, row);
      return row;
    },
    addJob: (employerId, fields = {}) => {
      const row = makeJobRow(employerId, fields);
      jobs.set(row.id, row);
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
