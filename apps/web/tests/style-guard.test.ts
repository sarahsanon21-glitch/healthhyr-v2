import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IGNORE_MARKER, scanSource } from './style-guard';

const webRoot = resolve(import.meta.dirname, '..');

const rulesFor = (code: string, file = 'src/components/Example.tsx') => scanSource(file, code).map((v) => v.rule);

describe('style guard: what it catches', () => {
  it('raw hex colors', () => {
    expect(rulesFor('<div className="bg-[#123E38]" />')).toContain('raw-hex-color');
    expect(rulesFor('const c = "#fff";')).toContain('raw-hex-color');
    expect(rulesFor('color: #12345678;')).toContain('raw-hex-color');
  });

  it('does not mistake anchors for hex colors', () => {
    expect(rulesFor('<a href="#faq">FAQ</a>')).toEqual([]);
    expect(rulesFor('<a href="#pricing">Pricing</a>')).toEqual([]);
  });

  it('raw color functions', () => {
    expect(rulesFor('background: rgb(18 62 56);')).toContain('raw-color-function');
    expect(rulesFor('color: hsl(10, 20%, 30%);')).toContain('raw-color-function');
  });

  it('text under 12px, in classes and in CSS', () => {
    expect(rulesFor('<p className="text-[11px]" />')).toContain('text-under-12px');
    expect(rulesFor('<p className="text-[0.7rem]" />')).toContain('text-under-12px');
    expect(rulesFor('p { font-size: 10px; }')).toContain('text-under-12px');
    expect(rulesFor('<p className="text-[12px]" />')).toEqual([]);
    expect(rulesFor('<p className="text-[0.75rem]" />')).toEqual([]);
    expect(rulesFor('p { font-size: 14px; }')).toEqual([]);
  });

  it('lime as a text color, including with variants', () => {
    expect(rulesFor('<p className="text-lime" />')).toContain('lime-as-text');
    expect(rulesFor('<p className="hover:text-lime" />')).toContain('lime-as-text');
    expect(rulesFor('a { color: var(--color-lime); }')).toContain('lime-as-text');
  });

  it('allows lime as a fill', () => {
    expect(rulesFor('<span className="bg-lime text-ink" />')).toEqual([]);
    expect(rulesFor('<span className="border-lime" />')).toEqual([]);
  });

  it('olive text outside the allowed components', () => {
    expect(rulesFor('<p className="text-olive" />')).toContain('olive-text-outside-allowed-components');
    expect(rulesFor('<p className="text-olive" />', 'src/components/ui/Logo.tsx')).toEqual([]);
    expect(rulesFor('<p className="text-olive text-2xl" />', 'src/components/ui/Heading.tsx')).toEqual([]);
    expect(rulesFor('<div className="bg-olive" />')).toEqual([]);
  });

  it('the default Tailwind palette and white/black utilities', () => {
    expect(rulesFor('<p className="text-gray-700" />')).toContain('default-tailwind-palette');
    expect(rulesFor('<p className="bg-red-500" />')).toContain('default-tailwind-palette');
    expect(rulesFor('<p className="bg-white" />')).toContain('white-or-black-utility');
    expect(rulesFor('<p className="text-black" />')).toContain('white-or-black-utility');
  });

  it('accepts token utilities', () => {
    expect(rulesFor('<p className="bg-surface text-ink border-line text-danger bg-paper text-muted text-primary" />')).toEqual([]);
  });

  it('honors the ignore marker', () => {
    expect(rulesFor(`<a id="bad" href="#bad"> {/* ${IGNORE_MARKER} */}`)).toEqual([]);
  });

  it('reports file and line', () => {
    const [violation] = scanSource('src\\app\\x.tsx', 'ok\n<p className="text-lime" />');
    expect(violation).toMatchObject({ file: 'src/app/x.tsx', line: 2, rule: 'lime-as-text' });
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|mdx?)$/.test(name) ? [full] : [];
  });
}

describe('style guard: the real source', () => {
  it('apps/web/src follows the design rules', () => {
    const files = sourceFiles(join(webRoot, 'src'));
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((file) =>
      scanSource(relative(webRoot, file), readFileSync(file, 'utf8')),
    );
    expect(violations).toEqual([]);
  });
});
