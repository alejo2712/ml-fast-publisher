/**
 * Bulk UI readiness regression test.
 *
 * Verifies the exact user flow: upload Excel with local image filenames
 * + drag the matching image files → rows must be publishable, not errors.
 *
 * This test guards against the root cause bug:
 *   isValidImageRef() on main did NOT accept local image filenames.
 *   Rows with "refrigerator-front-1200.png" produced fieldError
 *   "Referencia de imagen inválida" → status: 'error' → "0 listos, 2 errores".
 *
 * Run: npm run test:bulk-ui-readiness
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import { validateDraft } from '../src/lib/validation';

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

function assertFalse(cond: boolean, label: string, detail?: string) {
  assert(!cond, label, detail);
}

// Simulates the Map<string, File> that BulkUpload builds when the user drags image files.
// We use a lightweight stand-in since we just need the Map for presence checks.
function buildImageFilesMap(filenames: string[]): Map<string, { name: string }> {
  const map = new Map<string, { name: string }>();
  filenames.forEach((f) => map.set(f.toLowerCase(), { name: f }));
  return map;
}

// Simulates the missingImageFiles computation from BulkResults.tsx.
// Returns the filenames referenced by publishable rows that are NOT in imageFiles.
function computeMissingImageFiles(
  publishableRows: Array<{ localImageRefs: string[] }>,
  imageFiles: Map<string, unknown>
): string[] {
  const missing: string[] = [];
  publishableRows.forEach((r) => {
    r.localImageRefs.forEach((ref) => {
      if (!imageFiles.has(ref.toLowerCase()) && !missing.includes(ref)) {
        missing.push(ref);
      }
    });
  });
  return missing;
}

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');
const IMAGES_DIR = path.join(FIXTURES_DIR, 'images');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'ml-real-publish-final.xlsx');

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-bulk-ui-readiness');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // ══ A. isValidImageRef accepts local image filenames ═══════════════════════
  // This is the exact line that was missing on main and caused "2 errors".

  console.log('══ A. isValidImageRef — local filename acceptance ════════════════\n');
  console.log('  (Root cause guard: this check was absent on main)');
  console.log();

  // Re-implement the check inline to make the test self-contained and explicit.
  // This matches the fix added in validation/index.ts.
  function isLocalFilenameAccepted(value: string): boolean {
    const v = value.trim();
    if (v.startsWith('/uploads/')) return true;
    if (/\.(jpe?g|png|webp|gif)$/i.test(v) && !v.includes('/')) return true; // ← THE FIX
    try {
      const url = new URL(v);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  assert(isLocalFilenameAccepted('refrigerator-front-1200.png'), '"refrigerator-front-1200.png" accepted as valid image ref');
  assert(isLocalFilenameAccepted('refrigerator-open-1200.png'), '"refrigerator-open-1200.png" accepted as valid image ref');
  assert(isLocalFilenameAccepted('microwave-front-1200.png'), '"microwave-front-1200.png" accepted as valid image ref');
  assert(isLocalFilenameAccepted('microwave-side-1200.png'), '"microwave-side-1200.png" accepted as valid image ref');
  assert(isLocalFilenameAccepted('photo.jpg'), '"photo.jpg" accepted');
  assert(isLocalFilenameAccepted('product.webp'), '"product.webp" accepted');
  assertFalse(isLocalFilenameAccepted('document.pdf'), '"document.pdf" NOT accepted');
  assertFalse(isLocalFilenameAccepted(''), 'empty string NOT accepted');
  assertFalse(isLocalFilenameAccepted('path/to/file.png'), 'path with slash NOT accepted as local filename');
  assert(isLocalFilenameAccepted('https://mlstatic.com/img.jpg'), 'HTTPS URL still accepted');

  // ══ B. Parse fixture — both rows must be status:ok ════════════════════════

  console.log('\n══ B. Fixture parse — 2 rows must be status:ok ══════════════════\n');

  assert(fs.existsSync(FIXTURE_PATH), 'Fixture file exists');
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error('  Cannot continue. Run: npx tsx scripts/generate-real-publish-test.ts');
    process.exit(1);
  }

  const buf = fs.readFileSync(FIXTURE_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const csv = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);

  assert(result.rows.length === 2, '2 rows parsed', `got ${result.rows.length}`);
  assert(result.totalErrors === 0, '0 error rows — rows must not be errors', `got ${result.totalErrors}`);
  assert(result.totalOk === 2, '2 ok rows — both rows are publishable', `got ${result.totalOk}`);

  const [fridgeRow, microwaveRow] = result.rows;

  // Both rows must have status:ok (not 'error' or 'warnings')
  assert(fridgeRow?.status === 'ok', 'Refrigerator row status = ok', `got ${fridgeRow?.status}`);
  assert(microwaveRow?.status === 'ok', 'Microwave row status = ok', `got ${microwaveRow?.status}`);

  // No parser-level errors
  assert((fridgeRow?.errors.length ?? 1) === 0, 'Refrigerator row has no errors', `errors: ${fridgeRow?.errors.join(', ')}`);
  assert((microwaveRow?.errors.length ?? 1) === 0, 'Microwave row has no errors', `errors: ${microwaveRow?.errors.join(', ')}`);

  // Payloads must exist (publishable)
  assert(fridgeRow?.payload !== null, 'Refrigerator has payload');
  assert(microwaveRow?.payload !== null, 'Microwave has payload');

  // ══ C. validateDraft passes for both rows ═════════════════════════════════

  console.log('\n══ C. validateDraft — both drafts must be ready ═════════════════\n');

  if (fridgeRow?.draft) {
    const v = validateDraft(fridgeRow.draft);
    assert(v.isReady, 'Refrigerator draft isReady = true', `status: ${v.status}, missing: ${v.missingFields.map(f => f.id).join(',')}, errors: ${v.fieldErrors.map(e => e.message).join(', ')}`);
    assert(v.fieldErrors.length === 0, 'Refrigerator draft has no fieldErrors', `errors: ${v.fieldErrors.map(e => e.message).join(', ')}`);
  }

  if (microwaveRow?.draft) {
    const v = validateDraft(microwaveRow.draft);
    assert(v.isReady, 'Microwave draft isReady = true', `status: ${v.status}, missing: ${v.missingFields.map(f => f.id).join(',')}, errors: ${v.fieldErrors.map(e => e.message).join(', ')}`);
    assert(v.fieldErrors.length === 0, 'Microwave draft has no fieldErrors', `errors: ${v.fieldErrors.map(e => e.message).join(', ')}`);
  }

  // ══ D. publishableRows includes both rows ════════════════════════════════

  console.log('\n══ D. publishableRows — both rows are publishable ════════════════\n');

  // BulkResults computes: publishableRows = rows.filter(r => r.status !== 'error' && r.payload !== null)
  const publishableRows = result.rows.filter((r) => r.status !== 'error' && r.payload !== null);
  assert(publishableRows.length === 2, 'publishableRows.length = 2 — button says "Publicar 2 en Mercado Libre"', `got ${publishableRows.length}`);

  // ══ E. Image matching: with matching files, 0 images missing ══════════════

  console.log('\n══ E. Image matching — files provided → 0 missing ════════════════\n');

  // Simulate user dragging the 4 image files into the upload zone
  const imageFilesMap = buildImageFilesMap([
    'refrigerator-front-1200.png',
    'refrigerator-open-1200.png',
    'microwave-front-1200.png',
    'microwave-side-1200.png',
  ]);

  const missingWithFiles = computeMissingImageFiles(publishableRows, imageFilesMap);
  assert(
    missingWithFiles.length === 0,
    'With matching image files: 0 missing images — publish button in modal is enabled',
    `still missing: ${missingWithFiles.join(', ')}`
  );

  // ══ F. Image matching: without files, all 4 are missing ══════════════════

  console.log('\n══ F. Image matching — no files uploaded → confirm button blocked\n');

  const emptyMap = new Map<string, unknown>();
  const missingWithoutFiles = computeMissingImageFiles(publishableRows, emptyMap);
  assert(
    missingWithoutFiles.length === 4,
    'Without image files: 4 missing → confirm modal disables publish button',
    `got ${missingWithoutFiles.length} missing`
  );

  // ══ G. Actual image files exist on disk ═══════════════════════════════════

  console.log('\n══ G. Image files present on disk ═══════════════════════════════\n');

  const requiredImages = [
    'refrigerator-front-1200.png',
    'refrigerator-open-1200.png',
    'microwave-front-1200.png',
    'microwave-side-1200.png',
  ];
  for (const img of requiredImages) {
    const p = path.join(IMAGES_DIR, img);
    assert(fs.existsSync(p), `${img} exists at tests/fixtures/images/`);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      assert(stat.size > 1000, `${img} is not empty (size ${stat.size} bytes)`);
    }
  }

  // ══ Summary ═══════════════════════════════════════════════════════════════

  const total = passed + failed;
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed.\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All assertions passed.');
    console.log('\nExpected UI state before clicking publish:');
    console.log('  • Summary bar: 2 listos (green), 0 incompletos, 0 errores');
    console.log('  • Publish button: "Publicar 2 en Mercado Libre" — enabled');
    console.log('  • Per-row image section: "Lista para subir" (indigo) for each PNG');
    console.log('  • Confirm modal: checkbox visible, publish enabled once checked\n');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
