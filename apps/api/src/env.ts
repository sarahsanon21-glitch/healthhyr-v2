// The only place the API reads process.env and the only place server-only secrets are read
// (the Supabase service-role key and the Stripe secret key). Everything else receives the parsed,
// typed config. tests/service-role-scan.test.ts enforces this.
//
// Fails fast: parseEnv throws an EnvError that names every problem and never prints a value.
import { z } from 'zod';

export class EnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

const isOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
};

const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().refine(isOrigin, 'every origin must look like https://example.com (no path, no wildcard)')));

const secret = (min: number) => z.string().min(min, `must be at least ${min} characters`);

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),

  SUPABASE_URL: z.url().refine((v) => /^https?:\/\//.test(v), 'must be an http(s) URL'),
  SUPABASE_ANON_KEY: secret(20),
  SUPABASE_SERVICE_ROLE_KEY: secret(20),
  SUPABASE_JWKS_URL: z.url().optional(),
  SUPABASE_JWT_ISSUER: z.string().min(1).optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),

  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, 'must look like sk_test_...'),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9]+$/, 'must look like whsec_...'),

  CORS_ALLOWED_ORIGINS: originList.optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  supabase: {
    url: string;
    anonKey: string;
    /** Server-only operations only. See src/lib/serviceClient.ts. */
    serviceRoleKey: string;
    jwksUrl: string;
    issuer: string;
    audience: string;
  };
  stripe: { secretKey: string; webhookSecret: string };
  corsOrigins: string[];
  trustProxy: number;
  rateLimit: { windowMs: number; max: number };
}

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export function parseEnv(source: Record<string, string | undefined>): Config {
  // An empty string counts as missing, so a blank line in .env cannot slip through as a value.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));

  const result = rawSchema.safeParse(cleaned);
  const issues: string[] = result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

  if (!result.success) throw new EnvError(issues);
  const env = result.data;
  const production = env.NODE_ENV === 'production';

  // Rules that depend on more than one value. Messages never include a value.
  if (!production && /_live_/.test(env.STRIPE_SECRET_KEY)) {
    issues.push('STRIPE_SECRET_KEY: live Stripe keys are not allowed outside production (use a test key)');
  }
  if (production) {
    if (!env.CORS_ALLOWED_ORIGINS || env.CORS_ALLOWED_ORIGINS.length === 0) {
      issues.push('CORS_ALLOWED_ORIGINS: required in production');
    }
    if (!env.SUPABASE_URL.startsWith('https://')) issues.push('SUPABASE_URL: must be https in production');
    if (env.PORT === 0) issues.push('PORT: must be set in production');
  }
  if (issues.length > 0) throw new EnvError(issues);

  const authBase = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    supabase: {
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      jwksUrl: env.SUPABASE_JWKS_URL ?? `${authBase}/.well-known/jwks.json`,
      issuer: env.SUPABASE_JWT_ISSUER ?? authBase,
      audience: env.SUPABASE_JWT_AUDIENCE,
    },
    stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
    corsOrigins: env.CORS_ALLOWED_ORIGINS && env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : DEV_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX },
  };
}
