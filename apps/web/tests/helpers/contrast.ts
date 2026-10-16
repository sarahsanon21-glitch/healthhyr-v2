import { colors, textPairs, type ColorToken } from '@healthhyr/shared/tokens';
import { expect } from 'vitest';

const isColor = (name: string): name is ColorToken => name in colors;

/**
 * Asserts that an element's text color and background color are an allowed pair in docs/COLORS.md.
 * An element with no background class sits on whatever is behind it, so every page background
 * (`parentBackgrounds`) must allow its text color.
 */
export function expectAllowedTextPair(
  element: Element,
  parentBackgrounds: ColorToken[] = ['paper', 'surface'],
): void {
  const classes = [...element.classList];
  const text = classes.filter((name) => name.startsWith('text-')).map((name) => name.slice(5)).filter(isColor);
  const backgrounds = classes.filter((name) => name.startsWith('bg-')).map((name) => name.slice(3)).filter(isColor);

  expect(text, `text color of "${element.className}"`).toHaveLength(1);
  const [textColor] = text as [ColorToken];
  const against = backgrounds.length > 0 ? backgrounds : parentBackgrounds;

  for (const background of against) {
    const allowed = textPairs.some((pair) => pair.text === textColor && pair.on === background);
    expect(allowed, `${textColor} text on ${background} (docs/COLORS.md)`).toBe(true);
  }
}
