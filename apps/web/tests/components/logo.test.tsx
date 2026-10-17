import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logo } from '../../src/components/ui/Logo';
import { expectClassesGenerated } from '../helpers/tailwind';

const publicDir = resolve(import.meta.dirname, '../../public');

describe('Logo', () => {
  it('is the owner’s logo image with alt text, so it has an accessible name', () => {
    render(<Logo />);
    const image = screen.getByRole('img', { name: 'HealthHyr' });
    expect(image).toHaveAttribute('alt', 'HealthHyr');
  });

  it('is served from this site’s own public folder, never from another site', () => {
    render(<Logo />);
    const src = screen.getByRole('img').getAttribute('src')!;
    expect(src).toBe('/brand/healthhyr-logo-compact.png');
    expect(src).not.toMatch(/^(https?:)?\/\//);
    // and the file it points at exists
    expect(() => readFileSync(resolve(publicDir, src.slice(1)))).not.toThrow();
  });

  it('has the file’s real width and height, so the page does not jump while it loads', () => {
    render(<Logo />);
    const image = screen.getByRole('img');
    const png = readFileSync(resolve(publicDir, 'brand/healthhyr-logo-compact.png'));
    expect(Number(image.getAttribute('width'))).toBe(png.readUInt32BE(16));
    expect(Number(image.getAttribute('height'))).toBe(png.readUInt32BE(20));
  });

  it.each([
    ['2xl', 'h-10'],
    ['3xl', 'h-12'],
    ['4xl', 'h-16'],
  ] as const)('size %s is %s tall (never below 40px) and keeps its proportions', async (size, height) => {
    render(<Logo size={size} />);
    const image = screen.getByRole('img');
    expect(image).toHaveClass(height, 'w-auto');
    await expectClassesGenerated();
  });

  it('on the light page it is the plain image, with no plate around it', () => {
    const { container } = render(<Logo />);
    expect(container.firstElementChild?.tagName).toBe('IMG');
  });

  it('on a dark green surface it sits on a white plate, because its dark blue lettering has no contrast on dark green', async () => {
    const { container } = render(<Logo onDark />);
    const plate = container.firstElementChild!;
    expect(plate.tagName).toBe('SPAN');
    expect(plate).toHaveClass('bg-surface', 'rounded-md');
    expect(plate.querySelector('img')).toHaveAttribute('alt', 'HealthHyr');
    await expectClassesGenerated();
  });

  it('is never recolored by CSS (no filters, no color classes on the image)', () => {
    render(<Logo onDark />);
    const className = screen.getByRole('img').className;
    expect(className).not.toMatch(/filter|invert|brightness|grayscale|text-|bg-/);
  });

  it('has no text of its own, so it adds nothing under 12px', () => {
    const { container } = render(<Logo />);
    expect(container).toHaveTextContent('');
  });
});
