/**
 * Generate 1200×1200 white PNG test images for ML publishing tests.
 * Pure Node.js — no image library dependencies (uses built-in zlib).
 *
 * ML image quality requirements (from ML emails):
 *   - 1200×1200 px minimum
 *   - White background
 *   - Product centered, forward-facing
 *   - No logos, no text, no watermarks
 *
 * These are solid-white placeholder images suitable for pipeline testing.
 * For real publishing, replace with actual product photos.
 *
 * Run: npx tsx scripts/generate-test-images.ts
 */

import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';

// ── CRC32 for PNG chunk integrity ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG chunk builder ─────────────────────────────────────────────────────────

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// ── White PNG generator ───────────────────────────────────────────────────────

function generateWhitePng(width: number, height: number): Buffer {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width(4) + height(4) + bitDepth(1=8) + colorType(1=2=RGB) + compress(0) + filter(0) + interlace(0)
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // Raw image: each scanline = [filter_byte=0] + [R=255, G=255, B=255] × width
  // White background, no product silhouette — pure white test image
  const rowLength = 1 + width * 3;
  const rawData = Buffer.allocUnsafe(rowLength * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowLength;
    rawData[offset] = 0; // filter type None
    rawData.fill(0xff, offset + 1, offset + rowLength); // white RGB pixels
  }

  // Compress with deflate (level 1 = fast, white pixels compress to ~2 KB)
  const compressed = zlib.deflateSync(rawData, { level: 1 });

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Read PNG dimensions from buffer (for verification) ────────────────────────

export function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG signature is 8 bytes; IHDR chunk starts at byte 8
  // IHDR data offset: 8 (sig) + 4 (length) + 4 (type) = 16
  if (buf.length < 24) return null;
  const sig = buf.slice(0, 8);
  if (!sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const OUT_DIR = path.resolve(__dirname, '../tests/fixtures/images');

const IMAGES = [
  { name: 'refrigerator-front-1200.png', label: 'Heladera — frente' },
  { name: 'refrigerator-open-1200.png',  label: 'Heladera — puerta abierta' },
  { name: 'microwave-front-1200.png',    label: 'Microondas — frente' },
  { name: 'microwave-side-1200.png',     label: 'Microondas — lateral' },
];

console.log('\n══ generate-test-images ════════════════════════════════════\n');
console.log(`Output: ${OUT_DIR}`);
console.log(`Format: PNG, 1200×1200 px, white background\n`);

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const img of IMAGES) {
  const outPath = path.join(OUT_DIR, img.name);
  const png = generateWhitePng(1200, 1200);
  fs.writeFileSync(outPath, png);

  // Verify dimensions immediately after writing
  const dims = readPngDimensions(png);
  const sizeKB = (png.length / 1024).toFixed(1);
  console.log(`  ✅ ${img.name}  (${dims?.width}×${dims?.height} px, ${sizeKB} KB)  — ${img.label}`);
}

console.log('\n✅ All 4 test images generated.');
console.log('\nNote: These are solid-white placeholders for pipeline testing.');
console.log('For real ML publishing, replace with actual product photos (forward-facing,');
console.log('centered, well-lit, no logos, no text, no watermarks).\n');
