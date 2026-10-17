import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, generateNonce, type CspOptions } from '../../src/lib/security/csp';

const options: CspOptions = {
  nonce: 'abc123NONCE==',
  development: false,
  connectOrigins: ['https://api.example.test', 'https://auth.example.test'],
  upgradeInsecureRequests: false,
};

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((part) => {
      const [name, ...values] = part.split(' ');
      return [name!, values] as [string, string[]];
    }),
  );
}

describe('generateNonce', () => {
  it('is 128 random bits in base64 (24 characters)', () => {
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('is different every time', () => {
    const nonces = new Set(Array.from({ length: 500 }, generateNonce));
    expect(nonces.size).toBe(500);
  });
});

describe('buildContentSecurityPolicy (production)', () => {
  const policy = buildContentSecurityPolicy(options);
  const d = directives(policy);

  it('puts the nonce in script-src and style-src', () => {
    expect(d.get('script-src')).toContain("'nonce-abc123NONCE=='");
    expect(d.get('style-src')).toContain("'nonce-abc123NONCE=='");
  });

  it("lets trusted scripts load their own chunks with 'strict-dynamic'", () => {
    expect(d.get('script-src')).toContain("'strict-dynamic'");
  });

  it("never allows 'unsafe-inline' or 'unsafe-eval'", () => {
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('denies everything by default and shuts off plugins, framing and foreign bases and forms', () => {
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('allows network calls only to the site, the API and Supabase Auth', () => {
    expect(d.get('connect-src')).toEqual(["'self'", 'https://api.example.test', 'https://auth.example.test']);
  });

  it('allows images and fonts only from the site (images may also be data: or blob:)', () => {
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(d.get('font-src')).toEqual(["'self'"]);
  });

  it('has no wildcard source anywhere', () => {
    expect(policy).not.toMatch(/(^|\s)\*(\s|;|$)/);
  });

  it('asks for https upgrades only when told the site is served over https', () => {
    expect(d.has('upgrade-insecure-requests')).toBe(false);
    expect(directives(buildContentSecurityPolicy({ ...options, upgradeInsecureRequests: true })).has('upgrade-insecure-requests')).toBe(true);
  });

  it('puts a different nonce into a different policy', () => {
    expect(buildContentSecurityPolicy({ ...options, nonce: 'other' })).not.toContain('abc123NONCE');
  });
});

describe('buildContentSecurityPolicy (development)', () => {
  const policy = buildContentSecurityPolicy({ ...options, development: true });
  const d = directives(policy);

  it('adds only what next dev needs: eval for scripts, inline styles and websockets', () => {
    expect(d.get('script-src')).toContain("'unsafe-eval'");
    expect(d.get('style-src')).toContain("'unsafe-inline'");
    expect(d.get('connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
  });

  it('still requires the nonce for scripts', () => {
    expect(d.get('script-src')).toContain("'nonce-abc123NONCE=='");
  });
});
