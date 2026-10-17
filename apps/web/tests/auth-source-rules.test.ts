// Source rules for the website's auth code. They fail the build if the code drifts from the design:
//  - the role comes from the API only (never from a token, session metadata, storage or the URL)
//  - only one file talks to Supabase Auth, and only one file reads the environment
//  - the web app holds no server secret
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '..');

interface Source {
  path: string;
  text: string;
}

function sources(dir: string): Source[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    return [{ path: relative(webRoot, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }];
  });
}

const files = sources(join(webRoot, 'src'));
const using = (pattern: RegExp) => files.filter((file) => pattern.test(file.text)).map((file) => file.path);
const file = (path: string) => files.find((f) => f.path === path)!;

describe('the role comes from the API, never from the browser', () => {
  it('no code reads role information from session or user metadata', () => {
    expect(using(/app_metadata|user_metadata/)).toEqual([]);
  });

  it('no code decodes a token to read it', () => {
    // atob appears once, in public-env.ts, to recognize a service-role key and refuse it.
    expect(using(/decodeJwt|jwt-decode|jose/)).toEqual([]);
    expect(using(/\batob\(/)).toEqual(['src/lib/public-env.ts']);
  });

  it('no code stores or reads a role in browser storage or cookies', () => {
    expect(using(/localStorage|sessionStorage|document\.cookie/)).toEqual([]);
  });

  it('the only role read from the URL just preselects a sign-up radio, and only the two sign-up roles', () => {
    expect(using(/get\(['"]role['"]\)/)).toEqual(['src/components/auth/SignUpForm.tsx']);
    expect(file('src/components/auth/SignUpForm.tsx').text).toContain('SIGN_UP_ROLES');
  });

  it('the AuthState user is built in exactly one place, from the API response', () => {
    const service = file('src/lib/auth/service.ts');
    expect(service.text).toMatch(/user: \{ id: me\.id, role: me\.role \}/);
    expect(service.text.match(/user: \{/g)?.length).toBe(1);
  });
});

describe('where the sensitive things are allowed to happen', () => {
  it('only backend.ts calls supabase.auth or imports supabase-js', () => {
    expect(using(/@supabase\/supabase-js/)).toEqual(['src/lib/auth/backend.ts']);
    expect(
      using(/\bauth\.(signIn|signUp|verifyOtp|resend|updateUser|signOut|getSession|refreshSession|resetPasswordForEmail|onAuthStateChange)/),
    ).toEqual(['src/lib/auth/backend.ts']);
  });

  it('only public-env.ts reads process.env', () => {
    expect(using(/process\.env/)).toEqual(['src/lib/public-env.ts']);
  });

  it('only the API client calls fetch', () => {
    expect(using(/\bfetch\(|fetchImpl\(/)).toEqual(['src/lib/api/client.ts']);
  });

  it('the HealthHyr API client never handles a password', () => {
    expect(file('src/lib/api/client.ts').text).not.toMatch(/password/i);
    expect(file('src/lib/public-env.ts').text).not.toMatch(/password/i);
  });

  it('nothing logs or prints tokens, passwords or codes', () => {
    expect(using(/console\.(log|info|debug|warn|error)/)).toEqual([]);
  });
});

describe('the web app holds no server secret', () => {
  it('no source mentions a service-role, secret or Stripe key by name', () => {
    expect(using(/SERVICE_ROLE|SUPABASE_SECRET|STRIPE_/)).toEqual([]);
  });

  it('the only environment variables the site reads are the four public ones', () => {
    const names = [...new Set(files.flatMap((f) => f.text.match(/NEXT_PUBLIC_[A-Z_]{3,}/g) ?? []))].sort();
    expect(names).toEqual([
      'NEXT_PUBLIC_API_BASE_URL',
      'NEXT_PUBLIC_SITE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ]);
  });
});
