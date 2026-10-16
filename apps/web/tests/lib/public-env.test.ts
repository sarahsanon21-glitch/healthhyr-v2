import { describe, expect, it } from 'vitest';
import { PublicEnvError, looksLikeSecretKey, parsePublicEnv } from '../../src/lib/public-env';

// Fake keys are assembled at runtime so nothing key-looking is committed.
const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (role: string) => [b64url({ alg: 'ES256' }), b64url({ role }), 'signature'].join('.');
const publishable = ['sb', 'publishable', 'a'.repeat(30)].join('_');
const secret = ['sb', 'secret', 'b'.repeat(30)].join('_');

const valid = {
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321/',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
};

function problems(source: Record<string, string | undefined>): string[] {
  try {
    parsePublicEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(PublicEnvError);
    return (error as PublicEnvError).problems;
  }
  throw new Error('expected parsePublicEnv to throw');
}

describe('parsePublicEnv', () => {
  it('reads the three public values and trims trailing slashes', () => {
    expect(parsePublicEnv(valid)).toEqual({
      apiBaseUrl: 'http://localhost:4000',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: publishable,
    });
  });

  it('names each missing variable', () => {
    const found = problems({});
    for (const name of ['NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
      expect(found.some((p) => p.startsWith(name)), name).toBe(true);
    }
  });

  it('treats blank values as missing', () => {
    expect(problems({ ...valid, NEXT_PUBLIC_SUPABASE_URL: '   ' }).join(' ')).toContain('NEXT_PUBLIC_SUPABASE_URL is not set');
  });

  it('rejects URLs that are not http(s)', () => {
    expect(problems({ ...valid, NEXT_PUBLIC_API_BASE_URL: 'ftp://example.test' }).join(' ')).toContain('NEXT_PUBLIC_API_BASE_URL must be an http(s) URL');
    expect(problems({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'nonsense' }).join(' ')).toContain('NEXT_PUBLIC_SUPABASE_URL must be an http(s) URL');
  });

  it('refuses a secret key where the publishable key belongs', () => {
    for (const key of [secret, jwt('service_role')]) {
      expect(problems({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }).join(' ')).toContain('must be the publishable key');
    }
  });

  it('accepts the publishable key in either format', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable })).not.toThrow();
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).not.toThrow();
  });

  it('never repeats a value in its message', () => {
    const error = (() => {
      try {
        parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret, NEXT_PUBLIC_API_BASE_URL: 'ftp://leaky.example.test' });
      } catch (e) {
        return e as PublicEnvError;
      }
      throw new Error('expected an error');
    })();
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('leaky.example.test');
  });
});

describe('looksLikeSecretKey', () => {
  it('recognizes secret and service-role keys, and nothing else', () => {
    expect(looksLikeSecretKey(secret)).toBe(true);
    expect(looksLikeSecretKey(jwt('service_role'))).toBe(true);
    expect(looksLikeSecretKey(jwt('anon'))).toBe(false);
    expect(looksLikeSecretKey(publishable)).toBe(false);
    expect(looksLikeSecretKey('not-a-key')).toBe(false);
    expect(looksLikeSecretKey('a.b.c')).toBe(false);
  });
});
