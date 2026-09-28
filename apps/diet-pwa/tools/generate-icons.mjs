/**
 * Generates the PWA icons without pulling in an image library.
 *
 *   node tools/generate-icons.mjs
 *
 * Writes public/icons/icon-192.png, icon-512.png, icon-512-maskable.png and
 * apple-touch-icon.png. The glyph is a simple bowl so the icons stay small and
 * the app installs cleanly on iOS/Android.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../public/icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BACKGROUND_TOP = [16, 185, 129];
const BACKGROUND_BOTTOM = [4, 108, 78];
const GLYPH = [255, 255, 255];

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** True when the point is inside the bowl glyph. */
function insideGlyph(x, y, size, scale) {
  const cx = size / 2;
  const rimY = size / 2 - 0.06 * size * scale;
  const bowlRadius = 0.30 * size * scale;
  const rimHalfWidth = 0.32 * size * scale;
  const rimThickness = 0.038 * size * scale;

  const dx = x - cx;
  const dy = y - rimY;

  // bowl: lower half of a disc
  if (dy >= 0 && Math.hypot(dx, dy) <= bowlRadius) return true;

  // rim: a rounded bar sitting on top of the bowl
  const clampedX = Math.min(Math.max(dx, -rimHalfWidth), rimHalfWidth);
  return Math.hypot(dx - clampedX, dy) <= rimThickness;
}

function render(size, scale) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (insideGlyph(px, py, size, scale)) coverage += 1;
        }
      }
      coverage /= samples * samples;

      const gradient = (x + y) / (2 * size);
      const background = mix(BACKGROUND_TOP, BACKGROUND_BOTTOM, gradient);
      const colour = mix(background, GLYPH, coverage);

      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(colour[0]);
      rgba[offset + 1] = Math.round(colour[1]);
      rgba[offset + 2] = Math.round(colour[2]);
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

mkdirSync(outputDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Maskable icons need the glyph inside the inner 80% safe zone.
  { file: 'icon-512-maskable.png', size: 512, scale: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

for (const { file, size, scale } of targets) {
  const png = encodePng(size, render(size, scale));
  writeFileSync(resolve(outputDir, file), png);
  console.log(`wrote icons/${file} (${size}x${size}, ${png.length} bytes)`);
}
