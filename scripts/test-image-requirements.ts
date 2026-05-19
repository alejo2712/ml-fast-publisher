/**
 * test-image-requirements
 *
 * Validates that images embedded in the production fixture meet
 * Mercado Libre's image requirements (min 500×500 px, valid PNG/JPEG,
 * max 5 MB, correct MIME type).
 *
 * Also verifies that the prepare-publish image substitution flow
 * correctly replaces __emb__ synthetic filenames with ML CDN HTTPS URLs
 * when mock CDN URLs are injected.
 *
 * Run: npm run test:image-requirements
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractEmbeddedImages } from '../src/lib/excel/extract-embedded-images';
import { parseXlsxBuffer, parseCsvText } from '../src/lib/csv/parser';
import { validateDraft } from '../src/lib/validation';
import { buildMLPayload } from '../src/lib/payload-builder';
import type { CsvRowResult } from '../src/lib/csv/parser';

const ML_MIN_DIMENSION = 500;
const ML_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const PRODUCTION_FIXTURE = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-production.xlsx');
const FINAL_FIXTURE      = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-final-with-images.xlsx');

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

// ── PNG dimension reader ──────────────────────────────────────────────────────

function readPngDimensions(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// ── Client-side image substitution (mirrors BulkResults.handlePrepare) ────────

function substituteEmbeddedImages(
  pictures: Array<{ source: string }>,
  mlUrls: Map<string, string>
): Array<{ source: string }> {
  return pictures.map((p) => {
    if (!p.source.startsWith('http')) {
      const url = mlUrls.get(p.source.toLowerCase());
      return url ? { source: url } : p;
    }
    return p;
  });
}

// ── BulkUpload simulation (mirrors index.tsx embedded-image path) ──────────────

async function simulateEmbeddedFlow(filePath: string): Promise<{
  enrichedRows: CsvRowResult[];
  embeddedImages: Map<string, { data: Uint8Array; mimeType: string }>;
}> {
  const raw = fs.readFileSync(filePath);
  const buffer: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  const { csv, perRowImages } = await parseXlsxBuffer(buffer);
  const parsed = await parseCsvText(csv);

  const embeddedImages = new Map<string, { data: Uint8Array; mimeType: string }>();
  const enrichedRows: CsvRowResult[] = parsed.rows.map((row) => {
    const imgs = perRowImages.get(row.rowIndex);
    if (!imgs || imgs.length === 0 || !row.draft) return row;

    const filenames = imgs.map((img) => {
      embeddedImages.set(img.filename, { data: img.data, mimeType: img.mimeType });
      return img.filename;
    });

    const updatedDraft = { ...row.draft, images: filenames };
    const validation = validateDraft(updatedDraft);
    const payload = buildMLPayload(updatedDraft);

    return {
      ...row,
      draft: updatedDraft,
      payload,
      localImageRefs: filenames,
      missingFields: validation.missingFields,
      errors: validation.fieldErrors.map((fe) => `${fe.label}: ${fe.message}`),
      status: (
        validation.fieldErrors.length > 0 ? 'error' :
        validation.missingFields.length > 0 ? 'warnings' : 'ok'
      ) as CsvRowResult['status'],
    };
  });

  return { enrichedRows, embeddedImages };
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-image-requirements');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // ══ A. Fixture exists ══════════════════════════════════════════════════════
  console.log('══ A. Fixture files ══════════════════════════════════════════════\n');
  assert(fs.existsSync(PRODUCTION_FIXTURE), 'ml-real-publish-production.xlsx exists');
  assert(fs.existsSync(FINAL_FIXTURE),      'ml-real-publish-final-with-images.xlsx exists');
  if (!fs.existsSync(PRODUCTION_FIXTURE)) {
    console.error('  Cannot continue. Run: npm run gen:fixture:production');
    process.exit(1);
  }
  console.log();

  // ══ B. Image extraction ════════════════════════════════════════════════════
  console.log('══ B. Embedded image extraction ═════════════════════════════════\n');
  const raw = fs.readFileSync(PRODUCTION_FIXTURE);
  const ab  = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const { rowImages, totalImages } = await extractEmbeddedImages(ab);

  assert(totalImages === 4, `4 images in xl/media (got ${totalImages})`);
  assert(rowImages.size === 2, `images for 2 rows (got ${rowImages.size})`);
  assert((rowImages.get(1)?.length ?? 0) === 2, 'row 1: 2 images');
  assert((rowImages.get(2)?.length ?? 0) === 2, 'row 2: 2 images');
  console.log();

  // ══ C. ML image requirements ═══════════════════════════════════════════════
  console.log('══ C. ML image requirements (min 500×500, max 5 MB, valid MIME) ═\n');
  for (const [rowIdx, imgs] of rowImages.entries()) {
    for (const img of imgs) {
      const label = `  ${img.filename}`;

      // MIME type
      assert(
        ALLOWED_MIME_TYPES.has(img.mimeType),
        `${label}: MIME type accepted (${img.mimeType})`,
        `got ${img.mimeType}`
      );

      // File size
      assert(
        img.data.length <= ML_MAX_FILE_BYTES,
        `${label}: size ≤ 5 MB (${(img.data.length / 1024).toFixed(0)} KB)`,
        `${(img.data.length / 1024 / 1024).toFixed(1)} MB`
      );

      assert(img.data.length > 0, `${label}: non-empty data`);

      // Dimensions (PNG only)
      if (img.mimeType === 'image/png') {
        const dims = readPngDimensions(img.data);
        assert(dims !== null, `${label}: readable PNG dimensions`);
        if (dims) {
          console.log(`     ${dims.width}×${dims.height} px`);
          assert(
            dims.width >= ML_MIN_DIMENSION && dims.height >= ML_MIN_DIMENSION,
            `${label}: dimensions ≥ ${ML_MIN_DIMENSION}×${ML_MIN_DIMENSION} px`,
            `got ${dims.width}×${dims.height}`
          );
          // Warn (not fail) if below recommended 1200×1200
          if (dims.width < 1200 || dims.height < 1200) {
            console.log(`     ⚠️  below recommended 1200×1200 px — ML zoom quality may be reduced`);
          }
        }
      }
    }
  }
  console.log();

  // ══ D. Row simulation + image substitution ════════════════════════════════
  console.log('══ D. Embedded image substitution (mock ML CDN URLs) ════════════\n');
  const { enrichedRows, embeddedImages } = await simulateEmbeddedFlow(PRODUCTION_FIXTURE);

  assert(enrichedRows.length === 2, '2 rows parsed');
  assert(enrichedRows.every((r) => r.status !== 'error'), 'no rows in error status');
  assert(
    enrichedRows.every((r) => r.localImageRefs.every((ref) => ref.startsWith('__emb__'))),
    'all localImageRefs are __emb__ synthetic filenames'
  );
  assert(
    enrichedRows.every((r) => (r.payload?.pictures ?? []).every((p) => p.source.startsWith('__emb__'))),
    'payload.pictures all start with __emb__ (pre-upload)'
  );

  // Simulate what handlePrepare does: upload → replace __emb__ with mock CDN URLs
  const mockMlUrls = new Map<string, string>();
  let urlIdx = 1;
  for (const filename of embeddedImages.keys()) {
    mockMlUrls.set(filename.toLowerCase(), `https://http2.mlstatic.com/D_NQ_NP_mock-${urlIdx++}.jpg`);
  }

  for (const row of enrichedRows) {
    const pics = row.payload?.pictures ?? [];
    const substituted = substituteEmbeddedImages(pics, mockMlUrls);

    assert(
      substituted.length === 2,
      `Row ${row.rowIndex}: 2 pictures after substitution`,
      `got ${substituted.length}`
    );
    assert(
      substituted.every((p) => p.source.startsWith('https://')),
      `Row ${row.rowIndex}: all pictures are HTTPS after substitution`,
      `non-HTTPS: ${substituted.filter((p) => !p.source.startsWith('https://')).map((p) => p.source).join(', ')}`
    );
    assert(
      substituted.every((p) => p.source.includes('mlstatic.com')),
      `Row ${row.rowIndex}: all pictures point to mlstatic.com CDN`
    );
  }
  console.log();

  // ══ E. Final payload would have no local refs ═════════════════════════════
  console.log('══ E. Final payload — no local refs after substitution ══════════\n');
  for (const row of enrichedRows) {
    const pics = row.payload?.pictures ?? [];
    const substituted = substituteEmbeddedImages(pics, mockMlUrls);
    const hasLocal = substituted.some((p) => !p.source.startsWith('http'));

    assert(!hasLocal, `Row ${row.rowIndex}: final payload has no local filenames`, hasLocal ? 'local refs remain' : '');
    console.log(`  Row ${row.rowIndex} final payload pictures:`);
    substituted.forEach((p) => console.log(`    ${p.source}`));
  }
  console.log();

  // ══ Summary ════════════════════════════════════════════════════════════════
  const total = passed + failed;
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed.\n`);
    process.exit(1);
  }

  console.log('\n✅ All image requirements checks passed.\n');
  console.log('Image requirements summary:');
  console.log(`  Format: PNG ✓  (JPEG, WebP, GIF also accepted)`);
  console.log(`  Min size: ≥ ${ML_MIN_DIMENSION}×${ML_MIN_DIMENSION} px ✓  (recommended: 1200×1200)`);
  console.log(`  File size: ≤ 5 MB ✓`);
  console.log(`  After upload: ML CDN HTTPS URL ✓`);
  console.log(`  Final payload: only https://http2.mlstatic.com/... URLs ✓`);
  console.log();
  console.log('See docs/mercadolibre/image-requirements.md for full requirements.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
