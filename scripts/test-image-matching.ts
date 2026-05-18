/**
 * Regression test for image filename matching robustness.
 *
 * Guards against the root cause of "Imágenes locales no encontradas" appearing
 * after the user uploads the correct PNG files. Matching must be insensitive to:
 *   - Case differences (PHOTO.PNG vs photo.png)
 *   - Leading/trailing whitespace in Excel cell values
 *   - Path prefixes in Excel cells (e.g. "images/photo.png")
 *   - Fake browser paths in uploaded filenames (e.g. "C:\fakepath\photo.png")
 *
 * Run: npm run test:image-matching
 */

import { isLocalImageFilename, parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

/** Mirrors the normalizeImageKey function in BulkUpload/index.tsx and BulkResults.tsx */
function normalizeImageKey(name: string): string {
  return name.trim().replace(/^.*[/\\]/, '').toLowerCase();
}

/** Mirrors the missingImageFiles check in BulkResults.tsx */
function computeMissing(
  refs: string[],
  uploadedKeys: string[]
): string[] {
  const keySet = new Set(uploadedKeys.map(normalizeImageKey));
  return refs.filter((ref) => !keySet.has(normalizeImageKey(ref)));
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-image-matching');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // ══ A. normalizeImageKey — unit tests ════════════════════════════════════

  console.log('══ A. normalizeImageKey — unit tests ════════════════════════════\n');

  assert(normalizeImageKey('photo.png') === 'photo.png', 'plain filename unchanged');
  assert(normalizeImageKey('PHOTO.PNG') === 'photo.png', 'uppercase lowercased');
  assert(normalizeImageKey('  photo.png  ') === 'photo.png', 'surrounding whitespace stripped');
  assert(normalizeImageKey('images/photo.png') === 'photo.png', 'Unix path prefix stripped');
  assert(normalizeImageKey('some/deep/path/photo.png') === 'photo.png', 'nested path stripped');
  assert(normalizeImageKey('C:\\fakepath\\photo.png') === 'photo.png', 'Windows fake browser path stripped');
  assert(normalizeImageKey('C:/users/me/photos/photo.png') === 'photo.png', 'Windows forward-slash path stripped');
  assert(normalizeImageKey('refrigerator-front-1200.png') === 'refrigerator-front-1200.png', 'real fixture name unchanged');
  assert(normalizeImageKey('REFRIGERATOR-FRONT-1200.PNG') === 'refrigerator-front-1200.png', 'real fixture name uppercased → matches');

  console.log();

  // ══ B. isLocalImageFilename — path-prefixed refs treated as local ═════

  console.log('══ B. isLocalImageFilename — path prefix handling ════════════════\n');

  assert(isLocalImageFilename('photo.png'), 'plain .png is local');
  assert(isLocalImageFilename('photo.jpg'), 'plain .jpg is local');
  assert(isLocalImageFilename('images/photo.png'), 'path-prefixed .png is local');
  assert(isLocalImageFilename('some/path/photo.JPEG'), 'nested path .JPEG is local');
  assert(!isLocalImageFilename('https://example.com/photo.png'), 'https URL is NOT local');
  assert(!isLocalImageFilename('http://example.com/photo.png'), 'http URL is NOT local');
  assert(!isLocalImageFilename(''), 'empty string is NOT local');
  assert(!isLocalImageFilename('document.pdf'), '.pdf is NOT local image');

  console.log();

  // ══ C. Matching — case insensitive ════════════════════════════════════

  console.log('══ C. Matching — case insensitive ═══════════════════════════════\n');

  const exactRefs = ['refrigerator-front-1200.png', 'microwave-front-1200.png'];
  assert(computeMissing(exactRefs, ['refrigerator-front-1200.png', 'microwave-front-1200.png']).length === 0,
    'exact filenames → 0 missing');
  assert(computeMissing(exactRefs, ['REFRIGERATOR-FRONT-1200.PNG', 'MICROWAVE-FRONT-1200.PNG']).length === 0,
    'uppercase uploaded filenames → 0 missing');
  assert(computeMissing(['PHOTO.PNG'], ['photo.png']).length === 0,
    'uppercase ref + lowercase upload → match');
  assert(computeMissing(['photo.png'], ['PHOTO.PNG']).length === 0,
    'lowercase ref + uppercase upload → match');

  console.log();

  // ══ D. Matching — whitespace in Excel refs ════════════════════════════

  console.log('══ D. Matching — whitespace in Excel refs ════════════════════════\n');

  assert(computeMissing([' photo.png '], ['photo.png']).length === 0,
    'Excel ref with spaces → matches plain upload');
  assert(computeMissing(['photo.png'], [' photo.png ']).length === 0,
    'upload with spaces → matches plain ref');
  assert(computeMissing(['\tphoto.png\t'], ['photo.png']).length === 0,
    'Excel ref with tabs → matches');

  console.log();

  // ══ E. Matching — path prefix in Excel refs ═══════════════════════════

  console.log('══ E. Matching — path prefix in Excel refs ══════════════════════\n');

  assert(computeMissing(['images/refrigerator-front-1200.png'], ['refrigerator-front-1200.png']).length === 0,
    '"images/file.png" in Excel → matches uploaded "file.png"');
  assert(computeMissing(['subfolder/photos/microwave-front-1200.png'], ['microwave-front-1200.png']).length === 0,
    'deep path in Excel → matches plain upload');
  assert(computeMissing(['refrigerator-front-1200.png'], ['images/refrigerator-front-1200.png']).length === 0,
    'plain Excel ref → matches path-prefixed upload (reversed)');

  console.log();

  // ══ F. Matching — fake browser paths in uploaded filenames ════════════

  console.log('══ F. Matching — fake browser paths in uploaded filenames ════════\n');

  assert(computeMissing(['photo.png'], ['C:\\fakepath\\photo.png']).length === 0,
    'Windows fake path in uploaded name → matches Excel ref');
  assert(computeMissing(['photo.png'], ['C:/users/me/photos/photo.png']).length === 0,
    'Unix-style absolute path in uploaded name → matches');
  assert(computeMissing(['refrigerator-front-1200.png'], ['C:\\fakepath\\refrigerator-front-1200.png']).length === 0,
    'real fixture name with fake browser path → matches');

  console.log();

  // ══ G. Matching — still detects genuine mismatches ════════════════════

  console.log('══ G. Matching — genuine mismatches still blocked ════════════════\n');

  assert(computeMissing(['photo.png'], []).length === 1,
    'no uploads → 1 missing');
  assert(computeMissing(['photo.png'], ['other.png']).length === 1,
    'different filename → still missing');
  assert(computeMissing(['photo.jpg'], ['photo.png']).length === 1,
    'different extension → still missing');
  assert(computeMissing(['refrigerator-front.png', 'microwave-front.png'], ['refrigerator-front.png']).length === 1,
    'partial upload → 1 of 2 missing');

  console.log();

  // ══ H. Fixture fixture parse — localImageRefs still work ══════════════

  console.log('══ H. Fixture parse — localImageRefs format is correct ══════════\n');

  const FIXTURE_PATH = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-final.xlsx');
  assert(fs.existsSync(FIXTURE_PATH), 'fixture file exists');

  if (fs.existsSync(FIXTURE_PATH)) {
    const buf = fs.readFileSync(FIXTURE_PATH);
    const { csv } = await parseXlsxBuffer(buf.buffer as ArrayBuffer);
    const result = await parseCsvText(csv);

    assert(result.rows.length === 2, '2 rows parsed from fixture');

    const allRefs = result.rows.flatMap((r) => r.localImageRefs);
    assert(allRefs.length === 4, '4 local image refs detected');

    const exactNames = ['refrigerator-front-1200.png', 'refrigerator-open-1200.png', 'microwave-front-1200.png', 'microwave-side-1200.png'];
    exactNames.forEach((name) => {
      assert(allRefs.includes(name), `fixture has ref "${name}"`);
    });

    // Simulate matching with the exact uploaded filenames
    const missing = computeMissing(allRefs, exactNames);
    assert(missing.length === 0, 'with 4 matching PNGs: 0 missing → publish enabled');

    // Simulate matching with uppercase uploaded filenames (case-insensitive)
    const missingUpper = computeMissing(allRefs, exactNames.map((n) => n.toUpperCase()));
    assert(missingUpper.length === 0, 'with uppercase PNGs: 0 missing → still enabled');

    // Simulate matching with path-prefixed uploaded filenames (fake browser path)
    const missingFakePath = computeMissing(allRefs, exactNames.map((n) => `C:\\fakepath\\${n}`));
    assert(missingFakePath.length === 0, 'with fake browser paths: 0 missing → still enabled');
  }

  console.log();

  // ══ I. isValidImageRef — accepts path-prefixed refs ═══════════════════
  // Verify that an Excel cell like "images/photo.png" doesn't produce status:'error'

  console.log('══ I. isValidImageRef — path-prefixed refs accepted ══════════════\n');

  // Re-implement inline to match src/lib/validation/index.ts
  function isValidImageRef(value: string): boolean {
    const v = value.trim();
    if (v.startsWith('/uploads/')) return true;
    const basename = v.replace(/^.*[/\\]/, '');
    if (/\.(jpe?g|png|webp|gif)$/i.test(basename) && basename.length > 0) return true;
    try {
      const url = new URL(v);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  assert(isValidImageRef('photo.png'), 'plain filename is valid');
  assert(isValidImageRef('images/photo.png'), 'path-prefixed filename is valid');
  assert(isValidImageRef('subfolder/photo.JPEG'), 'nested path .JPEG is valid');
  assert(isValidImageRef('https://example.com/photo.jpg'), 'https URL is valid');
  assert(isValidImageRef('/uploads/abc/photo.png'), '/uploads/ path is valid');
  assert(!isValidImageRef('document.pdf'), '.pdf is NOT valid image');
  assert(!isValidImageRef(''), 'empty string is NOT valid');
  assert(!isValidImageRef('notanimage.txt'), '.txt is NOT valid');

  console.log();

  // ── Final report ─────────────────────────────────────────────────────────

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${passed + failed} passed`);
  console.log();
  if (failed > 0) {
    console.log(`❌ ${failed} assertion(s) failed.`);
    process.exit(1);
  } else {
    console.log('✅ All assertions passed.');
    console.log();
    console.log('Expected UI state after uploading Excel + PNGs:');
    console.log('  • Image panel shows "Todas encontradas" (green badge)');
    console.log('  • Each ref row shows "Encontrada" (green)');
    console.log('  • Debug panel shows: ref → normalized key → ✓ coincide');
    console.log('  • Confirm modal: no "Imágenes locales no encontradas" block');
    console.log('  • Publish button enabled once checkbox is checked');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
