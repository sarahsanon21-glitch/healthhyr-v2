import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevelopment, parseConnectOrigins, readConnectOrigins } from '../../src/lib/public-env';

describe('parseConnectOrigins', () => {
  it('keeps only the origin of each address', () => {
    expect(parseConnectOrigins(['https://api.example.test/api/v1', 'http://127.0.0.1:54321/'])).toEqual([
      'https://api.example.test',
      'http://127.0.0.1:54321',
    ]);
  });

  it('leaves out missing, empty and malformed values instead of failing', () => {
    expect(parseConnectOrigins([undefined, '', '   ', 'not a url', 'javascript:alert(1)', 'ftp://files.example.test'])).toEqual([]);
  });

  it('lists an origin once', () => {
    expect(parseConnectOrigins(['https://a.example.test/x', 'https://a.example.test/y'])).toEqual(['https://a.example.test']);
  });
});

describe('readConnectOrigins and isDevelopment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the API and Supabase addresses', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    expect(readConnectOrigins()).toEqual(['http://localhost:4000', 'http://127.0.0.1:54321']);
  });

  it('is development only when NODE_ENV is development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isDevelopment()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isDevelopment()).toBe(false);
    vi.stubEnv('NODE_ENV', 'test');
    expect(isDevelopment()).toBe(false);
  });
});
