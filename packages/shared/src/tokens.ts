// The only file in the repo allowed to contain raw color values.
// Palette and contrast rules: docs/COLORS.md (a test keeps the two in sync).

export const colors = {
  ink: '#123E38',
  primary: '#145B4E',
  lime: '#D6ED9B',
  paper: '#F7F8F3',
  surface: '#FFFFFF',
  line: '#DFE6DE',
  olive: '#749047',
  muted: '#566A63',
  danger: '#B42318',
} as const;

export type ColorToken = keyof typeof colors;

export const fonts = {
  heading: { family: 'Manrope', cssVar: '--font-heading', weights: [600, 700, 800] },
  body: { family: 'DM Sans', cssVar: '--font-body', weights: [400, 500, 700] },
} as const;

export const fontFallback = ['ui-sans-serif', 'system-ui', 'sans-serif'] as const;

/** Named weights for font-* utilities. Only weights loaded in fonts above are used by components. */
export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

/** No text under 12px, anywhere. */
export const MIN_FONT_SIZE_PX = 12;
/** Olive is allowed only for large text (24px and up). */
export const LARGE_TEXT_MIN_PX = 24;

export const fontSizes = {
  xs: { size: '12px', lineHeight: '16px' },
  sm: { size: '14px', lineHeight: '20px' },
  base: { size: '16px', lineHeight: '24px' },
  lg: { size: '18px', lineHeight: '28px' },
  xl: { size: '20px', lineHeight: '28px' },
  '2xl': { size: '24px', lineHeight: '32px' },
  '3xl': { size: '30px', lineHeight: '36px' },
  '4xl': { size: '36px', lineHeight: '40px' },
  '5xl': { size: '48px', lineHeight: '52px' },
} as const;

export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export const radii = {
  none: '0px',
  sm: '6px',
  md: '10px',
  lg: '16px',
  full: '9999px',
} as const;

// Shadow tint is the Ink color (18, 62, 56).
export const shadows = {
  card: '0 1px 3px 0 rgb(18 62 56 / 0.08), 0 1px 2px -1px rgb(18 62 56 / 0.08)',
  raised: '0 8px 24px -6px rgb(18 62 56 / 0.16)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

export const layout = {
  containerMax: '1152px',
  gutter: '16px',
  modal: { sm: '420px', md: '560px', lg: '720px' },
  toast: '380px',
} as const;

/**
 * Allowed text-on-background pairs. Every pair must meet 4.5:1, except
 * `largeOnly` pairs, which must meet 3:1 and may only be used at 24px or larger.
 * Lime is never a text color. Ink is the only text color on lime.
 */
export const textPairs = [
  { text: 'ink', on: 'paper' },
  { text: 'ink', on: 'surface' },
  { text: 'ink', on: 'lime' },
  { text: 'primary', on: 'paper' },
  { text: 'primary', on: 'surface' },
  { text: 'primary', on: 'line' },
  { text: 'surface', on: 'primary' },
  { text: 'muted', on: 'paper' },
  { text: 'muted', on: 'surface' },
  { text: 'danger', on: 'paper' },
  { text: 'danger', on: 'surface' },
  { text: 'surface', on: 'danger' },
  { text: 'olive', on: 'paper', largeOnly: true },
  { text: 'olive', on: 'surface', largeOnly: true },
] as const satisfies ReadonlyArray<{ text: ColorToken; on: ColorToken; largeOnly?: boolean }>;

export const CONTRAST_NORMAL = 4.5;
export const CONTRAST_LARGE = 3;
/** Form control borders, focus outlines and other UI boundaries (WCAG 1.4.11). */
export const CONTRAST_UI = 3;
