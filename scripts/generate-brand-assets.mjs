// Generates the website's brand files from the owner's logo, assets/brand/healthhyr-logo.png.
//
//   node scripts/generate-brand-assets.mjs
//
// The logo is never redrawn or recolored. Every output is the owner's artwork, cropped, scaled or
// placed on a plain background taken from packages/shared/src/tokens.ts. The one derived variant
// that leaves something out is the compact logo, which drops the tagline line and the icon row
// under the name, because they cannot be read at header size. Outputs (all committed, so the site
// needs no image tool at build or run time):
//
//   apps/web/public/brand/healthhyr-logo.png          the full logo, with the empty margin trimmed
//   apps/web/public/brand/healthhyr-logo-compact.png  symbol and name only, for headers
//   apps/web/src/app/icon.png                         512x512 symbol, for the browser tab
//   apps/web/src/app/favicon.ico                      16, 32 and 48 pixel symbol (PNG inside ICO)
//   apps/web/src/app/apple-icon.png                   180x180 symbol on white (iPhone home screen)
//   apps/web/src/app/opengraph-image.png              1200x630 share image (full logo on the page color)
//   apps/web/src/app/twitter-image.png                the same image
//
// It uses `sharp`, which Next.js already installs for image optimization (nothing new is installed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { colors } from '../packages/shared/src/tokens.ts';

const root = resolve(import.meta.dirname, '..');
const sharp = createRequire(resolve(root, 'apps/web/package.json'))('sharp');

const source = resolve(root, 'assets/brand/healthhyr-logo.png');
const publicBrand = resolve(root, 'apps/web/public/brand');
const appDir = resolve(root, 'apps/web/src/app');
mkdirSync(publicBrand, { recursive: true });

const ALPHA_VISIBLE = 10;
const MARGIN = 8;

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
const visible = (x, y) => alphaAt(x, y) > ALPHA_VISIBLE;

/** The bounding box of the visible pixels inside a region. */
function boundsOf(region) {
  const box = { minX: width, maxX: -1, minY: height, maxY: -1 };
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      if (!visible(x, y)) continue;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return box;
}

const everything = { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 };
const box = boundsOf(everything);

// The symbol is the artwork up to the first empty column after it starts.
let symbolRight = box.minX;
const columnHasArtwork = (x) => {
  for (let y = 0; y < height; y += 1) if (visible(x, y)) return true;
  return false;
};
while (symbolRight < width && columnHasArtwork(symbolRight)) symbolRight += 1;
const symbol = boundsOf({ minX: box.minX, maxX: symbolRight - 1, minY: 0, maxY: height - 1 });

// To the right of the symbol: the name, then a gap, then the tagline and the icon row. Find the gap.
const textLeft = symbolRight + 20;
const rowHasText = (y) => {
  for (let x = textLeft; x < width; x += 1) if (visible(x, y)) return true;
  return false;
};
let y = Math.round(box.minY + (box.maxY - box.minY) * 0.3); // inside the name
while (y < height && rowHasText(y)) y += 1; // walk down to the first empty row under the name
const nameBottom = y; // first empty row: the tagline starts after this gap

const toRgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), alpha: 1 });

const crop = (region) => {
  const left = Math.max(0, region.minX - MARGIN);
  const top = Math.max(0, region.minY - MARGIN);
  return {
    left,
    top,
    width: Math.min(width, region.maxX + MARGIN + 1) - left,
    height: Math.min(height, region.maxY + MARGIN + 1) - top,
  };
};

// 1. The full logo, trimmed.
const full = await sharp(source).extract(crop(box)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(resolve(publicBrand, 'healthhyr-logo.png'), full);

// 2. The compact logo: the same artwork with everything to the right of the symbol and below the
// name made transparent (the tagline and the icon row), then trimmed and scaled so it stays sharp
// up to 64 CSS pixels tall on a 3x screen, and no larger.
const erased = Buffer.from(data);
for (let row = nameBottom; row < height; row += 1) {
  for (let column = textLeft; column < width; column += 1) erased[(row * width + column) * 4 + 3] = 0;
}
const compactSource = await sharp(erased, { raw: { width, height, channels: 4 } }).png().toBuffer();
const compactBox = (() => {
  const result = { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: Math.max(symbol.maxY, nameBottom - 1) };
  return result;
})();
const compact = await sharp(compactSource).extract(crop(compactBox)).resize({ height: 192 }).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(resolve(publicBrand, 'healthhyr-logo-compact.png'), compact);
const compactMeta = await sharp(compact).metadata();

// 3. The symbol, squared with padding, for icons.
const symbolCrop = await sharp(source).extract(crop(symbol)).png().toBuffer();
const squareSymbol = async (size, background, paddingRatio) => {
  const inner = Math.round(size * (1 - 2 * paddingRatio));
  const resized = await sharp(symbolCrop).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
writeFileSync(resolve(appDir, 'icon.png'), await squareSymbol(512, clear, 0.06));
writeFileSync(resolve(appDir, 'apple-icon.png'), await squareSymbol(180, toRgb(colors.surface), 0.14));

// 4. favicon.ico: an ICO file can hold PNG images, so the three sizes are written directly.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((size) => squareSymbol(size, clear, 0.04)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, index) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngs[index].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[index].length;
  return entry;
});
writeFileSync(resolve(appDir, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));

// 5. The share image: the full logo, centered on the page color, 1200x630.
const OG = { width: 1200, height: 630 };
const ogLogo = await sharp(full).resize({ width: 960, height: 400, fit: 'inside' }).png().toBuffer();
const og = await sharp({ create: { ...OG, channels: 4, background: toRgb(colors.paper) } })
  .composite([{ input: ogLogo, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(resolve(appDir, 'opengraph-image.png'), og);
writeFileSync(resolve(appDir, 'twitter-image.png'), og);
const ALT = 'HealthHyr: careers that care';
writeFileSync(resolve(appDir, 'opengraph-image.alt.txt'), `${ALT}\n`);
writeFileSync(resolve(appDir, 'twitter-image.alt.txt'), `${ALT}\n`);

console.log(JSON.stringify({ artworkBox: box, symbol, nameBottom, compact: { width: compactMeta.width, height: compactMeta.height } }, null, 2));
