// Hydration warnings are suppressed on the <html> and <body> tags of the root layout and nowhere else:
// browser extensions change those two tags before React loads, which is harmless. Anywhere else a
// hydration warning means the server and the browser really disagree, and must be fixed, not hidden.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('suppressHydrationWarning', () => {
  it('appears only in the root layout', () => {
    const using = files.filter((file) => file.text.includes('suppressHydrationWarning')).map((file) => file.path);
    expect(using).toEqual(['src/app/layout.tsx']);
  });

  it('is on <html> and on <body>, exactly once each, and explained by a comment', () => {
    const layout = files.find((file) => file.path === 'src/app/layout.tsx')!.text;
    expect(layout.match(/suppressHydrationWarning/g)).toHaveLength(3); // the comment, <html> and <body>
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
    expect(layout).toMatch(/<body[^>]*suppressHydrationWarning/);
    expect(layout).toMatch(/\/\/ suppressHydrationWarning on <html> and <body> only: browser extensions/);
  });
});
