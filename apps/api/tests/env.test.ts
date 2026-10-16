import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../src/env';

// Fake secrets are assembled at runtime so no key-looking string is committed.
const fake = {
  stripeTest: ['sk', 'test', 'a'.repeat(24)].join('_'),
  stripeLive: ['sk', 'live', 'b'.repeat(24)].join('_'),
  restrictedLive: ['rk', 'live', 'c'.repeat(24)].join('_'),
  webhook: ['whsec', 'd'.repeat(24)].join('_'),
  anon: 'anon-' + 'e'.repeat(30),
  service: 'service-' + 'f'.repeat(30),
};

const valid = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'development',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: fake.anon,
  SUPABASE_SERVICE_ROLE_KEY: fake.service,
  STRIPE_SECRET_KEY: fake.stripeTest,
  STRIPE_WEBHOOK_SECRET: fake.webhook,
  ...overrides,
});

function failure(source: Record<string, string | undefined>): EnvError {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return error as EnvError;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv: a valid configuration', () => {
  it('parses and applies defaults', () => {
    const config = parseEnv(valid());
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4000);
    expect(config.supabase.audience).toBe('authenticated');
    expect(config.supabase.issuer).toBe('http://127.0.0.1:54321/auth/v1');
    expect(config.supabase.jwksUrl).toBe('http://127.0.0.1:54321/auth/v1/.well-known/jwks.json');
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
    expect(config.trustProxy).toBe(0);
    expect(config.rateLimit).toEqual({ windowMs: 900_000, max: 300 });
    expect(config.userRateLimit).toEqual({ windowMs: 900_000, max: 600 });
  });

  it('honors explicit values', () => {
    const config = parseEnv(
      valid({
        PORT: '8080',
        SUPABASE_JWKS_URL: 'https://keys.example.test/jwks.json',
        SUPABASE_JWT_ISSUER: 'https://project.example.test/auth/v1',
        CORS_ALLOWED_ORIGINS: 'https://a.example.test, https://b.example.test',
        TRUST_PROXY: '1',
        RATE_LIMIT_MAX: '50',
        USER_RATE_LIMIT_MAX: '20',
        USER_RATE_LIMIT_WINDOW_MS: '60000',
      }),
    );
    expect(config.port).toBe(8080);
    expect(config.supabase.jwksUrl).toBe('https://keys.example.test/jwks.json');
    expect(config.supabase.issuer).toBe('https://project.example.test/auth/v1');
    expect(config.corsOrigins).toEqual(['https://a.example.test', 'https://b.example.test']);
    expect(config.trustProxy).toBe(1);
    expect(config.rateLimit.max).toBe(50);
    expect(config.userRateLimit).toEqual({ windowMs: 60_000, max: 20 });
  });

  it('treats an empty value like a missing one', () => {
    const error = failure(valid({ SUPABASE_SERVICE_ROLE_KEY: '' }));
    expect(error.issues.join('\n')).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('allows a test Stripe key and a restricted test key', () => {
    expect(() => parseEnv(valid({ STRIPE_SECRET_KEY: fake.stripeTest }))).not.toThrow();
    expect(() => parseEnv(valid({ STRIPE_SECRET_KEY: ['rk', 'test', 'g'.repeat(24)].join('_') }))).not.toThrow();
  });
});

describe('parseEnv: fails fast and names every problem', () => {
  it('lists each missing required variable', () => {
    const error = failure({ NODE_ENV: 'development' });
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
      expect(error.issues.some((issue) => issue.startsWith(`${name}:`)), name).toBe(true);
    }
    expect(error.message).toMatch(/Invalid environment configuration/);
  });

  it('rejects malformed values', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['SUPABASE_URL', { SUPABASE_URL: 'not a url' }],
      ['SUPABASE_URL', { SUPABASE_URL: 'ftp://example.test' }],
      ['SUPABASE_ANON_KEY', { SUPABASE_ANON_KEY: 'short' }],
      ['STRIPE_SECRET_KEY', { STRIPE_SECRET_KEY: 'not-a-stripe-key' }],
      ['STRIPE_WEBHOOK_SECRET', { STRIPE_WEBHOOK_SECRET: 'whsec' }],
      ['PORT', { PORT: 'abc' }],
      ['PORT', { PORT: '70000' }],
      ['NODE_ENV', { NODE_ENV: 'staging' }],
      ['RATE_LIMIT_MAX', { RATE_LIMIT_MAX: '0' }],
      ['USER_RATE_LIMIT_MAX', { USER_RATE_LIMIT_MAX: '0' }],
      ['USER_RATE_LIMIT_WINDOW_MS', { USER_RATE_LIMIT_WINDOW_MS: '10' }],
      ['TRUST_PROXY', { TRUST_PROXY: '-1' }],
      ['CORS_ALLOWED_ORIGINS', { CORS_ALLOWED_ORIGINS: '*' }],
      ['CORS_ALLOWED_ORIGINS', { CORS_ALLOWED_ORIGINS: 'https://app.example.test/path' }],
      ['CORS_ALLOWED_ORIGINS', { CORS_ALLOWED_ORIGINS: 'https://ok.example.test, *.example.test' }],
    ];
    for (const [name, override] of cases) {
      const error = failure(valid(override));
      expect(error.issues.some((issue) => issue.startsWith(`${name}`)), `${name} with ${JSON.stringify(override)}`).toBe(true);
    }
  });

  it('refuses live Stripe keys outside production', () => {
    for (const nodeEnv of ['development', 'test']) {
      for (const key of [fake.stripeLive, fake.restrictedLive]) {
        const error = failure(valid({ NODE_ENV: nodeEnv, STRIPE_SECRET_KEY: key }));
        expect(error.issues.join('\n')).toMatch(/live Stripe keys are not allowed outside production/);
      }
    }
  });
});

describe('parseEnv: production rules', () => {
  const production = (overrides: Record<string, string | undefined> = {}) =>
    valid({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.example.test',
      CORS_ALLOWED_ORIGINS: 'https://app.example.test',
      ...overrides,
    });

  it('accepts a complete production configuration', () => {
    const config = parseEnv(production());
    expect(config.corsOrigins).toEqual(['https://app.example.test']);
  });

  it('requires an explicit CORS allowlist', () => {
    expect(failure(production({ CORS_ALLOWED_ORIGINS: undefined })).issues.join('\n')).toMatch(/CORS_ALLOWED_ORIGINS: required in production/);
  });

  it('requires an https Supabase URL', () => {
    expect(failure(production({ SUPABASE_URL: 'http://project.example.test' })).issues.join('\n')).toMatch(/SUPABASE_URL: must be https/);
  });

  it('requires an explicit port', () => {
    expect(failure(production({ PORT: '0' })).issues.join('\n')).toMatch(/PORT: must be set in production/);
  });
});

describe('parseEnv: never prints a value', () => {
  it('error messages contain variable names but none of the supplied values', () => {
    const secrets = ['sekret-anon-value-1234567', 'sekret-service-value-1234567', 'sk_test_NOT-VALID-FORMAT-999', 'whsec_BAD', 'ftp://leaky.example.test'];
    const error = failure({
      NODE_ENV: 'development',
      SUPABASE_URL: secrets[4],
      SUPABASE_ANON_KEY: 'x',
      SUPABASE_SERVICE_ROLE_KEY: 'y',
      STRIPE_SECRET_KEY: secrets[2],
      STRIPE_WEBHOOK_SECRET: secrets[3],
      CORS_ALLOWED_ORIGINS: 'https://evil.example.test/leaky-path',
    });
    for (const secret of [...secrets, 'leaky-path', 'evil.example.test']) {
      expect(error.message).not.toContain(secret);
    }
    expect(error.message).toContain('STRIPE_SECRET_KEY');
  });

  it('a live key that is refused is not echoed', () => {
    const error = failure(valid({ STRIPE_SECRET_KEY: fake.stripeLive }));
    expect(error.message).not.toContain(fake.stripeLive);
    expect(error.message).not.toContain('b'.repeat(24));
  });
});
