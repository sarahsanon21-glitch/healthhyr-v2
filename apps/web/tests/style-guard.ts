// Scans web source for design-rule violations (CLAUDE.md and docs/COLORS.md):
// no raw colors outside tokens.ts, no text under 12px, lime is never a text color,
// olive text only in the few components that guarantee large sizes, no default Tailwind palette.

export interface Violation {
  file: string;
  line: number;
  rule: string;
  match: string;
}

/** Files allowed to use olive text. They must render it at 24px or larger (tested with the components). */
export const OLIVE_TEXT_ALLOWED_FILES = ['src/components/ui/Logo.tsx', 'src/components/ui/Heading.tsx'];

/** Add this marker to a line to exempt it, e.g. an anchor id that happens to look like hex. */
export const IGNORE_MARKER = 'style-guard-ignore';

const MIN_PX = 12;

const PALETTE_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES = 'bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow|placeholder';

const rules: Array<{ rule: string; pattern: RegExp; skipFor?: (file: string) => boolean }> = [
  {
    rule: 'raw-hex-color',
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g,
  },
  {
    rule: 'raw-color-function',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g,
  },
  {
    rule: 'default-tailwind-palette',
    pattern: new RegExp(`(?<![A-Za-z0-9_])(?:${COLOR_UTILITIES})-(?:${PALETTE_NAMES})-\\d{2,3}(?![A-Za-z0-9_])`, 'g'),
  },
  {
    rule: 'white-or-black-utility',
    pattern: new RegExp(`(?<![A-Za-z0-9_])(?:${COLOR_UTILITIES})-(?:white|black)(?![A-Za-z0-9_-])`, 'g'),
  },
  {
    rule: 'lime-as-text',
    pattern: /(?<![A-Za-z0-9_])text-lime(?![A-Za-z0-9_-])|\bcolor:\s*(?:var\(--color-lime\)|theme\(colors\.lime\))/g,
  },
  {
    rule: 'olive-text-outside-allowed-components',
    pattern: /(?<![A-Za-z0-9_])text-olive(?![A-Za-z0-9_-])|\bcolor:\s*(?:var\(--color-olive\)|theme\(colors\.olive\))/g,
    skipFor: (file) => OLIVE_TEXT_ALLOWED_FILES.includes(file),
  },
];

const toPx = (value: string, unit: string) => Number(value) * (unit === 'px' ? 1 : 16);

const tinyText = [
  { rule: 'text-under-12px', pattern: /text-\[(\d*\.?\d+)(px|rem|em)\]/g },
  { rule: 'text-under-12px', pattern: /font-size:\s*(\d*\.?\d+)(px|rem|em)/g },
];

export function scanSource(file: string, text: string): Violation[] {
  const normalized = file.replace(/\\/g, '/');
  const violations: Violation[] = [];

  text.split(/\r?\n/).forEach((lineText, index) => {
    if (lineText.includes(IGNORE_MARKER)) return;
    const line = index + 1;

    for (const { rule, pattern, skipFor } of rules) {
      if (skipFor?.(normalized)) continue;
      for (const match of lineText.matchAll(pattern)) {
        violations.push({ file: normalized, line, rule, match: match[0] });
      }
    }

    for (const { rule, pattern } of tinyText) {
      for (const match of lineText.matchAll(pattern)) {
        if (toPx(match[1]!, match[2]!) < MIN_PX) violations.push({ file: normalized, line, rule, match: match[0] });
      }
    }
  });

  return violations;
}
