/**
 * MeetScribe — Icon Generator
 * Creates icons/icon16.png, icons/icon48.png, icons/icon128.png
 * using only Node.js built-in modules (no external dependencies).
 *
 * Design: dark blue (#1a237e) to indigo (#3f51b5) gradient background,
 * stylized white "M" letter, small microphone dot indicator.
 */

import { createWriteStream } from 'fs';
import { deflateRawSync } from 'zlib';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, '..', 'icons');

// ─── PNG encoding helpers ────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

/**
 * Encode pixel array (RGBA) to PNG binary.
 * @param {Uint8Array} rgba - flat RGBA array, row-major
 * @param {number} width
 * @param {number} height
 */
function encodePNG(rgba, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB (we'll use RGBA below)
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // Build raw scanlines with filter byte
  const scanlines = [];
  for (let y = 0; y < height; y++) {
    scanlines.push(0); // filter type: None
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      scanlines.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const raw = Buffer.from(scanlines);
  const compressed = deflateRawSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Drawing primitives ──────────────────────────────────────────────────────

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

/**
 * Generate RGBA pixel array for MeetScribe icon of given size.
 */
function generateIconPixels(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Color palette
  const TOP_COLOR    = [26, 35, 126];   // #1a237e deep blue
  const BOTTOM_COLOR = [63, 81, 181];   // #3f51b5 indigo
  const WHITE        = [255, 255, 255];

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    // Alpha blending over existing pixel
    const srcA = a / 255;
    const dstA = pixels[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA);
    pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
    pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
    pixels[i + 3] = Math.round(outA * 255);
  }

  function fillCircle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= radius) {
          // Anti-aliasing
          const aa = dist > radius - 1 ? Math.max(0, radius - dist) : 1;
          setPixel(x, y, r, g, b, Math.round(a * aa));
        }
      }
    }
  }

  function drawLine(x1, y1, x2, y2, r, g, b, thickness = 1) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      // Draw thick line by filling a circle at each point
      for (let ty = -thickness; ty <= thickness; ty++) {
        for (let tx = -thickness; tx <= thickness; tx++) {
          if (tx * tx + ty * ty <= thickness * thickness) {
            setPixel(Math.round(px + tx), Math.round(py + ty), r, g, b, 255);
          }
        }
      }
    }
  }

  // 1. Draw background with vertical gradient (rounded square)
  const cornerRadius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded rectangle test
      const dx = Math.max(cornerRadius - x, x - (size - 1 - cornerRadius), 0);
      const dy = Math.max(cornerRadius - y, y - (size - 1 - cornerRadius), 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cornerRadius) continue;

      // Gradient: top-left = TOP_COLOR, bottom-right = BOTTOM_COLOR
      const t = (x / size * 0.3 + y / size * 0.7);
      const r = lerp(TOP_COLOR[0], BOTTOM_COLOR[0], t);
      const g = lerp(TOP_COLOR[1], BOTTOM_COLOR[1], t);
      const b = lerp(TOP_COLOR[2], BOTTOM_COLOR[2], t);

      // Anti-alias at rounded corners
      const aa = dist > cornerRadius - 1 ? Math.max(0, cornerRadius - dist) : 1;
      setPixel(x, y, r, g, b, Math.round(255 * aa));
    }
  }

  // 2. Draw the letter "M"
  const pad = size * 0.18;
  const mLeft   = pad;
  const mRight  = size - pad;
  const mTop    = size * 0.22;
  const mBottom = size * 0.72;
  const mMid    = size * 0.47; // valley bottom
  const thickness = Math.max(1, Math.round(size * 0.09));

  // Left vertical stroke
  drawLine(mLeft, mTop, mLeft, mBottom, ...WHITE, thickness);
  // Right vertical stroke
  drawLine(mRight, mTop, mRight, mBottom, ...WHITE, thickness);
  // Left diagonal (down to center valley)
  const centerX = size / 2;
  drawLine(mLeft, mTop, centerX, mMid, ...WHITE, thickness);
  // Right diagonal (up from center valley)
  drawLine(centerX, mMid, mRight, mTop, ...WHITE, thickness);

  // 3. Small microphone dot indicator (bottom-right) — only for larger icons
  if (size >= 48) {
    const dotR = size * 0.085;
    const dotX = size * 0.74;
    const dotY = size * 0.78;
    // White circle background
    fillCircle(dotX, dotY, dotR + size * 0.02, 255, 255, 255, 255);
    // Red recording dot
    fillCircle(dotX, dotY, dotR, 220, 38, 38, 255);
  }

  return pixels;
}

// ─── Generate and write PNG files ────────────────────────────────────────────

const SIZES = [16, 48, 128];

for (const size of SIZES) {
  const pixels = generateIconPixels(size);
  const png = encodePNG(pixels, size, size);
  const outPath = join(OUT_DIR, `icon${size}.png`);
  const ws = createWriteStream(outPath);
  ws.write(png);
  ws.end();
  console.log(`Written: ${outPath} (${png.length} bytes)`);
}
