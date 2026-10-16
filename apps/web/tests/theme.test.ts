import { compile } from '@tailwindcss/node';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, fontFallback, fontSizes, fonts, spacing } from '@healthhyr/shared/tokens';
import config from '../tailwind.config';

const appDir = resolve(import.meta.dirname, '../src/app');
const css = readFileSync(resolve(appDir, 'globals.css'), 'utf8');

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(css, { base: appDir, onDependency() {} });
  return compiler.build(candidates);
}

const has = (output: string, selector: string) => output.includes(selector);

describe('tailwind theme comes from tokens', () => {
  it('uses exactly the token colors (plus transparent and current)', () => {
    expect(Object.keys(config.theme.colors).sort()).toEqual([...Object.keys(colors), 'current', 'transparent'].sort());
    for (const [name, value] of Object.entries(colors)) {
      expect(config.theme.colors[name as keyof typeof colors]).toBe(value);
    }
  });

  it('uses the token spacing, type scale and fonts', () => {
    expect(config.theme.spacing).toEqual(spacing);
    expect(Object.keys(config.theme.fontSize)).toEqual(Object.keys(fontSizes));
    expect(config.theme.fontFamily.heading).toEqual([`var(${fonts.heading.cssVar})`, 'Manrope', ...fontFallback]);
    expect(config.theme.fontFamily.body).toEqual([`var(${fonts.body.cssVar})`, 'DM Sans', ...fontFallback]);
  });
});

describe('tailwind output', () => {
  it('generates token utilities with the token values', async () => {
    const out = await build(['bg-ink', 'text-primary', 'bg-lime', 'border-line', 'bg-surface', 'text-danger', 'p-4', 'text-xs']);
    expect(out).toMatch(/\.bg-ink\s*{\s*background-color:\s*#123E38/i);
    expect(out).toMatch(/\.text-primary\s*{\s*color:\s*#145B4E/i);
    expect(out).toMatch(/\.bg-lime\s*{\s*background-color:\s*#D6ED9B/i);
    expect(out).toMatch(/\.bg-surface\s*{\s*background-color:\s*#FFFFFF/i);
    expect(out).toMatch(/\.p-4\s*{\s*padding:\s*16px/);
    expect(out).toMatch(/\.text-xs\s*{\s*font-size:\s*12px/);
  });

  it('does not generate the default Tailwind palette, white/black, or off-scale spacing', async () => {
    const out = await build(['bg-red-500', 'text-gray-700', 'bg-white', 'text-black', 'p-7', 'm-9']);
    for (const selector of ['.bg-red-500', '.text-gray-700', '.bg-white', '.text-black', '.p-7', '.m-9']) {
      expect(has(out, selector), selector).toBe(false);
    }
    expect(out).not.toMatch(/--color-(red|gray|blue|green)-/);
  });

  it('generates every token text size, and none is under 12px', async () => {
    const out = await build(Object.keys(fontSizes).map((name) => `text-${name}`));
    const sizes = [...out.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    for (const { size } of Object.values(fontSizes)) expect(sizes).toContain(Number.parseFloat(size));
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
  });

  it('applies the paper background, ink text and body font to the page', async () => {
    const out = await build([]);
    expect(out).toMatch(/html\s*{[^}]*background-color:\s*#F7F8F3/i);
    expect(out).toMatch(/html\s*{[^}]*color:\s*#123E38/i);
    expect(out).toMatch(/html\s*{[^}]*font-family:\s*var\(--font-body\)/);
    expect(out).toMatch(/h1, h2, h3, h4, h5, h6\s*{[^}]*font-family:\s*var\(--font-heading\)/);
  });
});

describe('fonts in layout.tsx match the tokens', () => {
  const layout = readFileSync(resolve(import.meta.dirname, '../src/app/layout.tsx'), 'utf8');

  function loader(name: string) {
    const match = new RegExp(`${name}\\(\\{([\\s\\S]*?)\\}\\)`).exec(layout);
    if (!match) throw new Error(`${name} loader not found in layout.tsx`);
    const body = match[1]!;
    return {
      weights: [...(/weight:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? '').matchAll(/'(\d+)'/g)].map((m) => Number(m[1])),
      variable: /variable:\s*'([^']+)'/.exec(body)?.[1],
    };
  }

  it('Manrope for headings', () => {
    expect(fonts.heading.family).toBe('Manrope');
    expect(loader('Manrope')).toEqual({ weights: [...fonts.heading.weights], variable: fonts.heading.cssVar });
  });

  it('DM Sans for body', () => {
    expect(fonts.body.family).toBe('DM Sans');
    expect(loader('DM_Sans')).toEqual({ weights: [...fonts.body.weights], variable: fonts.body.cssVar });
  });

  it('puts both font variables on the html element', () => {
    expect(layout).toContain('${heading.variable} ${body.variable}');
  });
});
