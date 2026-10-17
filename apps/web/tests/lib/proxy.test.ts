import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '../../src/proxy';

const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://healthhyr.example.test');
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

describe('proxy', () => {
  it('sends a nonce Content-Security-Policy on the response', () => {
    const response = proxy(new NextRequest('https://healthhyr.example.test/sign-in'));
    const policy = response.headers.get('content-security-policy');
    expect(nonceOf(policy)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(policy).toContain('connect-src');
    expect(policy).toContain('https://api.example.test');
    expect(policy).toContain('https://auth.example.test');
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('passes the same policy and nonce to Next.js on the request, so it can attach the nonce to its scripts', () => {
    const response = proxy(new NextRequest('https://healthhyr.example.test/'));
    const policy = response.headers.get('content-security-policy');
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(policy));
  });

  it('uses a different nonce for every request', () => {
    const nonces = new Set(
      Array.from({ length: 50 }, () => nonceOf(proxy(new NextRequest('https://healthhyr.example.test/')).headers.get('content-security-policy'))),
    );
    expect(nonces.size).toBe(50);
  });

  it('overwrites a policy or nonce the visitor sends instead of trusting it', () => {
    const request = new NextRequest('https://healthhyr.example.test/', {
      headers: { 'content-security-policy': "script-src 'unsafe-inline'", 'x-nonce': 'attacker' },
    });
    const response = proxy(request);
    const policy = response.headers.get('content-security-policy')!;
    expect(policy).not.toContain('unsafe-inline');
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(policy));
  });

  it('does not ask for https upgrades when the site address is http (local runs)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(proxy(new NextRequest('http://localhost:3000/')).headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests');
  });
});

describe('proxy matcher', () => {
  const matcher = config.matcher[0]!;
  const regex = new RegExp(`^${matcher.source}$`);

  it.each(['/', '/sign-in', '/dashboard/jobs/new', '/companies/some-company', '/does-not-exist'])('runs on the page %s', (path) => {
    expect(regex.test(path)).toBe(true);
  });

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image',
    '/brand/healthhyr-logo.png',
    '/favicon.ico',
    '/icon.png',
    '/apple-icon.png',
    '/opengraph-image.png',
    '/twitter-image.png',
  ])('skips the file %s', (path) => {
    expect(regex.test(path)).toBe(false);
  });

  it('skips link prefetches, which do not render a document', () => {
    expect(matcher.missing).toEqual(
      expect.arrayContaining([
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ]),
    );
  });
});
