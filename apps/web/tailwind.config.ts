// Tailwind's whole theme comes from the shared tokens file. Nothing is hardcoded here,
// and the default Tailwind palette, spacing and type scale are not loaded (see globals.css).
import type { Config } from 'tailwindcss';
import {
  breakpoints,
  colors,
  fontFallback,
  fontSizes,
  fontWeights,
  fonts,
  layout,
  radii,
  shadows,
  spacing,
} from '@healthhyr/shared/tokens';

const stack = (font: (typeof fonts)[keyof typeof fonts]) => [`var(${font.cssVar})`, font.family, ...fontFallback];

const config = {
  content: [],
  theme: {
    colors: { ...colors, transparent: 'transparent', current: 'currentColor' },
    fontFamily: {
      heading: stack(fonts.heading),
      body: stack(fonts.body),
      sans: stack(fonts.body),
    },
    fontWeight: Object.fromEntries(Object.entries(fontWeights).map(([name, weight]) => [name, String(weight)])),
    fontSize: Object.fromEntries(
      Object.entries(fontSizes).map(([name, { size, lineHeight }]) => [name, [size, { lineHeight }]]),
    ),
    spacing: { ...spacing },
    borderRadius: { ...radii },
    boxShadow: { ...shadows, none: 'none' },
    screens: { ...breakpoints },
    extend: {
      maxWidth: {
        container: layout.containerMax,
        'modal-sm': layout.modal.sm,
        'modal-md': layout.modal.md,
        'modal-lg': layout.modal.lg,
        toast: layout.toast,
      },
    },
  },
} satisfies Config;

export default config;
