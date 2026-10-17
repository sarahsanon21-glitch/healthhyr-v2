// Guards for the Content-Security-Policy and security headers (step 10b): the settings that make them
// work, and the code patterns that would let an injected script run despite them.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { STATIC_SECURITY_HEADERS } from '../src/lib/security/headers';

const webRoot = resolve(import.meta.dirname, '..');

function sources(dir: string): Array<{ path: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    return [{ path: relative(webRoot, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }];
  });
}

const files = sources(join(webRoot, 'src'));
const read = (path: string) => files.find((file) => file.path === path)!.text;

describe('static security headers', () => {
  const byKey = new Map(STATIC_SECURITY_HEADERS.map((header) => [header.key, header.value]));

  it('are all present', () => {
    expect([...byKey.keys()].sort()).toEqual(
      [
        'Cross-Origin-Opener-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
      ].sort(),
    );
  });

  it('say the right things', () => {
    expect(byKey.get('Strict-Transport-Security')).toBe('max-age=63072000');
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byKey.get('X-Frame-Options')).toBe('DENY');
    expect(byKey.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(byKey.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('switch off the browser features the site never uses', () => {
    const policy = byKey.get('Permissions-Policy')!;
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) expect(policy).toContain(`${feature}=()`);
  });

  it('do not promise includeSubDomains or preload before every subdomain is checked', () => {
    expect(byKey.get('Strict-Transport-Security')).not.toMatch(/includeSubDomains|preload/);
  });

  it('are applied to every path by next.config', async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: '/(.*)', headers: STATIC_SECURITY_HEADERS }]);
  });

  it('do not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe('what the nonce Content-Security-Policy needs', () => {
  it('the root layout renders every page for each request (a prebuilt page has scripts without the nonce)', () => {
    expect(read('src/app/layout.tsx')).toMatch(/^export const dynamic = 'force-dynamic';$/m);
  });

  it('the proxy file exists in src, where Next.js looks for it', () => {
    expect(files.some((file) => file.path === 'src/proxy.ts')).toBe(true);
  });

  it('no page or component styles itself with an inline style attribute (the policy would block it)', () => {
    const offenders = files.filter((file) => /\bstyle=\{|\bstyle="/.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('the site has its own 404 page, because the built-in one uses inline styles', () => {
    expect(files.some((file) => file.path === 'src/app/not-found.tsx')).toBe(true);
  });
});

describe('code that would run an injected script', () => {
  // Built from pieces so this file does not match its own rules.
  const banned: Array<[string, RegExp]> = [
    ['dangerouslySet' + 'InnerHTML', /dangerouslySetInnerHTML/],
    ['.inner' + 'HTML', /\.innerHTML\b/],
    ['.outer' + 'HTML', /\.outerHTML\b/],
    ['insertAdjacent' + 'HTML', /insertAdjacentHTML/],
    ['document.' + 'write', /document\.write(ln)?\s*\(/],
    ['ev' + 'al(', /(^|[^.\w])eval\s*\(/],
    ['new Fun' + 'ction', /new\s+Function\s*\(/],
  ];

  it.each(banned)('src never uses %s', (_name, pattern) => {
    const offenders = files.filter((file) => pattern.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('src never passes a string to setTimeout or setInterval (that is eval in disguise)', () => {
    const stringArgument = new RegExp('set(Timeout|Interval)\\(\\s*[\'"`]');
    const offenders = files.filter((file) => stringArgument.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
