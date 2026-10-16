import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';
import {
  CONTRAST_LARGE,
  CONTRAST_NORMAL,
  LARGE_TEXT_MIN_PX,
  MIN_FONT_SIZE_PX,
  colors,
  fontSizes,
  spacing,
  textPairs,
  type ColorToken,
} from '../src/tokens';

const colorsDoc = readFileSync(resolve(import.meta.dirname, '../../../docs/COLORS.md'), 'utf8');

const px = (value: string) => Number(/^(\d+(?:\.\d+)?)px$/.exec(value)?.[1]);

// Widened so tests can ask "is X in the list?" for values the list's literal types rule out.
interface Pair {
  text: string;
  on: string;
  largeOnly?: boolean;
}
const pairs: readonly Pair[] = textPairs;

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('color tokens', () => {
  it('are valid, unique uppercase hex values', () => {
    const values = Object.values(colors);
    for (const value of values) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(values).size).toBe(values.length);
  });

  it('match the palette in docs/COLORS.md exactly', () => {
    const documented = new Set((colorsDoc.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((hex) => hex.toUpperCase()));
    expect(documented).toEqual(new Set(Object.values(colors)));
  });
});

describe('allowed text pairs', () => {
  it('meet 4.5:1, or 3:1 for large-only pairs', () => {
    for (const pair of textPairs) {
      const ratio = contrastRatio(colors[pair.text], colors[pair.on]);
      const largeOnly = 'largeOnly' in pair;
      expect(ratio, `${pair.text} on ${pair.on}`).toBeGreaterThanOrEqual(largeOnly ? CONTRAST_LARGE : CONTRAST_NORMAL);
    }
  });

  it('keep olive for large text only (it fails 4.5:1)', () => {
    const olive = textPairs.filter((pair) => pair.text === 'olive');
    expect(olive.length).toBeGreaterThan(0);
    for (const pair of olive) {
      expect('largeOnly' in pair).toBe(true);
      expect(contrastRatio(colors.olive, colors[pair.on])).toBeLessThan(CONTRAST_NORMAL);
    }
    expect(LARGE_TEXT_MIN_PX).toBe(24);
  });

  it('never use lime as a text color, and allow only ink on lime', () => {
    expect(pairs.some((pair) => pair.text === 'lime')).toBe(false);
    const onLime = pairs.filter((pair) => pair.on === 'lime').map((pair) => pair.text);
    expect(onLime).toEqual(['ink']);
  });

  it('match the contrast table in docs/COLORS.md (pairs, ratios and large-only rule)', () => {
    const rows = [
      ...colorsDoc.matchAll(/^\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*(\d+\.\d+)\s*\|\s*(.+?)\s*\|$/gm),
    ].map((match) => ({
      text: match[1]!.toLowerCase() as ColorToken,
      on: match[2]!.toLowerCase() as ColorToken,
      ratio: Number(match[3]),
      largeOnly: /large headings only/i.test(match[4]!),
    }));

    expect(rows.length).toBe(textPairs.length);
    for (const row of rows) {
      const computed = contrastRatio(colors[row.text], colors[row.on]);
      expect(Math.abs(computed - row.ratio), `${row.text} on ${row.on}`).toBeLessThan(0.01);
    }

    const key = (p: Pair) => `${p.text}|${p.on}|${Boolean(p.largeOnly)}`;
    expect(new Set(rows.map(key))).toEqual(new Set(pairs.map(key)));
  });

  it('does not allow muted text on lime (the doc calls it too close to the limit)', () => {
    expect(pairs.some((pair) => pair.text === 'muted' && pair.on === 'lime')).toBe(false);
  });
});

describe('type scale', () => {
  it('has no size under 12px', () => {
    expect(MIN_FONT_SIZE_PX).toBe(12);
    for (const [name, { size }] of Object.entries(fontSizes)) {
      expect(px(size), name).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
    }
  });

  it('uses pixel values for spacing', () => {
    for (const value of Object.values(spacing)) expect(value).toMatch(/^\d+(\.\d+)?px$/);
  });
});
