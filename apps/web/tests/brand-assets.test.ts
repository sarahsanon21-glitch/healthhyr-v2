// The brand files: the owner's logo, and the icons and share images made from it. Dimensions are read
// from the files themselves (a PNG states its width and height in a fixed place), so no image tool is
// needed to check them. To remake them: node scripts/generate-brand-assets.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const webRoot = resolve(import.meta.dirname, '..');
const appDir = resolve(webRoot, 'src/app');
const brandDir = resolve(webRoot, 'public/brand');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${path} is a PNG`).toBe(true);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    /** 6 means red, green, blue and alpha (a real transparent background is possible). */
    colorType: bytes.readUInt8(25),
    bytes: bytes.length,
  };
}

describe('the owner’s logo', () => {
  it('is kept as assets/brand/healthhyr-logo.png, with no space in the name, and has an alpha channel', () => {
    const logo = png(resolve(repoRoot, 'assets/brand/healthhyr-logo.png'));
    expect(logo).toMatchObject({ width: 2000, height: 620, colorType: 6 });
    expect(existsSync(resolve(repoRoot, 'assets/brand/Health Hyr.png'))).toBe(false);
  });

  it('is served by the site in two versions: the full logo and the compact one (no tagline), both with an alpha channel', () => {
    const full = png(resolve(brandDir, 'healthhyr-logo.png'));
    const compact = png(resolve(brandDir, 'healthhyr-logo-compact.png'));
    expect(full.colorType).toBe(6);
    expect(compact.colorType).toBe(6);
    expect(full.width / full.height).toBeGreaterThan(3); // wide
    expect(compact.height).toBe(192);
    expect(compact.height).toBeLessThan(full.height);
    expect(compact.bytes).toBeLessThan(150_000); // light enough for every page
  });

  it('no file or folder name under the website or the brand folder contains a space', () => {
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next') continue;
        const full = join(dir, name);
        names.push(relative(repoRoot, full));
        if (statSync(full).isDirectory()) walk(full);
      }
    };
    walk(resolve(webRoot, 'public'));
    walk(resolve(webRoot, 'src/app'));
    walk(resolve(repoRoot, 'assets'));
    expect(names.filter((name) => /\s/.test(name))).toEqual([]);
  });
});

describe('icons and share images (Next.js adds them to every page by their file names)', () => {
  it('icon.png is 512 by 512', () => {
    expect(png(resolve(appDir, 'icon.png'))).toMatchObject({ width: 512, height: 512 });
  });

  it('apple-icon.png is 180 by 180', () => {
    expect(png(resolve(appDir, 'apple-icon.png'))).toMatchObject({ width: 180, height: 180 });
  });

  it('favicon.ico holds the 16, 32 and 48 pixel images', () => {
    const ico = readFileSync(resolve(appDir, 'favicon.ico'));
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // an icon file
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + index * 16;
      sizes.push(ico.readUInt8(entry));
      const size = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + 8).equals(PNG_SIGNATURE), `image ${index} is a PNG`).toBe(true);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it.each(['opengraph-image', 'twitter-image'])('%s.png is 1200 by 630, under 300 KB, and has alt text', (name) => {
    const image = png(resolve(appDir, `${name}.png`));
    expect(image).toMatchObject({ width: 1200, height: 630 });
    expect(image.bytes).toBeLessThan(300_000);
    expect(readFileSync(resolve(appDir, `${name}.alt.txt`), 'utf8').trim()).toBe('HealthHyr: careers that care');
  });

  it('the root layout gives the metadata an absolute base address and a large share card', () => {
    const layout = readFileSync(resolve(appDir, 'layout.tsx'), 'utf8');
    expect(layout).toContain('metadataBase: new URL(readSiteUrl())');
    expect(layout).toContain("card: 'summary_large_image'");
  });
});
