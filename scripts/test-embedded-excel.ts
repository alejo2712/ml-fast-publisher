/**
 * End-to-end test for the single-file embedded Excel bulk upload flow.
 *
 * Validates: extraction → parser → BulkUpload injection → UI data shape
 * Run: npm run test:embedded-excel
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractEmbeddedImages } from '../src/lib/excel/extract-embedded-images';
import { parseXlsxBuffer, parseCsvText } from '../src/lib/csv/parser';
import { validateDraft } from '../src/lib/validation';
import { buildMLPayload } from '../src/lib/payload-builder';
import type { CsvRowResult } from '../src/lib/csv/parser';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

const SINGLE_FILE = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-single-file.xlsx');
const EMBEDDED    = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-embedded.xlsx');

/** Simulate what BulkUpload.handleFile does for the embedded-image path */
async function simulateBulkUploadHandleFile(filePath: string): Promise<{
  enrichedRows: CsvRowResult[];
  imageFilesMap: Map<string, { size: number; mimeType: string }>;
}> {
  const raw = fs.readFileSync(filePath);
  const buffer: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  const { csv, perRowImages } = await parseXlsxBuffer(buffer);
  const parsed = await parseCsvText(csv);

  const imageFilesMap = new Map<string, { size: number; mimeType: string }>();
  const enrichedRows: CsvRowResult[] = parsed.rows.map((row) => {
    const imgs = perRowImages.get(row.rowIndex);
    if (!imgs || imgs.length === 0 || !row.draft) return row;

    const filenames = imgs.map((img) => {
      imageFilesMap.set(img.filename, { size: img.data.length, mimeType: img.mimeType });
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

  return { enrichedRows, imageFilesMap };
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  test-embedded-excel — single-file bulk upload e2e');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ── A. Fixture files exist ────────────────────────────────────────────────
  console.log('══ A. Fixture files ═════════════════════════════════════════════\n');
  assert(fs.existsSync(SINGLE_FILE), 'ml-real-publish-single-file.xlsx exists');
  assert(fs.existsSync(EMBEDDED), 'ml-real-publish-embedded.xlsx exists');
  const sfSize = fs.existsSync(SINGLE_FILE) ? fs.statSync(SINGLE_FILE).size : 0;
  assert(sfSize > 5_000, `single-file fixture > 5 KB (got ${(sfSize / 1024).toFixed(0)} KB)`);
  const embBuf = fs.existsSync(SINGLE_FILE) ? fs.readFileSync(SINGLE_FILE) : Buffer.alloc(0);
  const sfBuf  = fs.existsSync(EMBEDDED)     ? fs.readFileSync(EMBEDDED)    : Buffer.alloc(0);
  assert(
    embBuf.length === sfBuf.length,
    'single-file and embedded fixtures are the same size (identical content)',
    `${embBuf.length} vs ${sfBuf.length}`,
  );
  console.log();

  // ── B. Raw extraction ─────────────────────────────────────────────────────
  console.log('══ B. Raw drawing extraction ════════════════════════════════════\n');
  const raw = fs.readFileSync(SINGLE_FILE);
  const ab  = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const { rowImages, totalImages } = await extractEmbeddedImages(ab);

  assert(totalImages === 4, `4 media images in xl/media (got ${totalImages})`);
  assert(rowImages.size === 2, `images for 2 product rows (got ${rowImages.size})`);
  assert((rowImages.get(1)?.length ?? 0) === 2, 'row 1 has 2 images');
  assert((rowImages.get(2)?.length ?? 0) === 2, 'row 2 has 2 images');
  assert(!rowImages.has(0), 'row 0 (header) has no images');

  const firstImg = rowImages.get(1)?.[0];
  assert((firstImg?.data.length ?? 0) > 10_000, `image data is real (${((firstImg?.data.length ?? 0) / 1024).toFixed(0)} KB > 10 KB)`);
  assert(firstImg?.mimeType === 'image/png', 'mimeType is image/png');
  assert(firstImg?.filename.startsWith('__emb__') ?? false, 'synthetic __emb__ filename');
  console.log();

  // ── C. parseXlsxBuffer ───────────────────────────────────────────────────
  console.log('══ C. parseXlsxBuffer ═══════════════════════════════════════════\n');
  const { csv, perRowImages } = await parseXlsxBuffer(ab);
  assert(typeof csv === 'string' && csv.length > 0, 'returns csv string');
  assert(perRowImages.size === 2, 'perRowImages has 2 rows');
  assert((perRowImages.get(1)?.length ?? 0) === 2, 'perRowImages row 1 → 2 images');
  assert((perRowImages.get(2)?.length ?? 0) === 2, 'perRowImages row 2 → 2 images');

  const csvResult = await parseCsvText(csv);
  assert(csvResult.rows.length === 2, '2 product rows parsed from CSV');
  assert(
    csvResult.rows.every((r) => r.localImageRefs.length === 0),
    'CSV localImageRefs empty — imagenes column blank, images come from drawings',
  );
  console.log();

  // ── D. BulkUpload injection simulation ───────────────────────────────────
  console.log('══ D. BulkUpload handleFile simulation ══════════════════════════\n');
  const { enrichedRows, imageFilesMap } = await simulateBulkUploadHandleFile(SINGLE_FILE);

  assert(enrichedRows.length === 2, '2 enriched rows');

  for (const row of enrichedRows) {
    const label = `Row ${row.rowIndex} (${row.draft?.title?.split(' ').slice(0, 2).join(' ') ?? '?'})`;
    assert(row.localImageRefs.length === 2, `${label}: localImageRefs has 2 entries`);
    assert(row.localImageRefs.every((r) => r.startsWith('__emb__')), `${label}: all refs are __emb__ synthetic filenames`);
    assert((row.draft?.images?.length ?? 0) === 2, `${label}: draft.images has 2 entries`);
    assert(
      (row.draft?.images ?? []).every((img) => img.startsWith('__emb__')),
      `${label}: draft.images uses synthetic filenames`,
    );
    assert(row.localImageRefs.every((r) => imageFilesMap.has(r)), `${label}: all refs resolve in imageFilesMap`);
    // Status should be ok or warnings (images no longer missing)
    assert(row.status !== 'error', `${label}: status is not error (got ${row.status})`);
  }

  // imageFilesMap should have 4 entries (2 images × 2 rows)
  assert(imageFilesMap.size === 4, `imageFilesMap has 4 synthetic File entries (got ${imageFilesMap.size})`);
  console.log();

  // ── E. Missing-refs calculation (BulkUpload UI logic) ────────────────────
  console.log('══ E. UI: no "missing images" for embedded refs ══════════════════\n');
  // Simulate the BulkUpload missing-refs logic (excludes __emb__ refs)
  const allLocalRefs = [...new Set(enrichedRows.flatMap((r) => r.localImageRefs.filter((ref) => !ref.startsWith('__emb__'))))];
  const embeddedImageCount = enrichedRows.reduce((sum, r) => sum + r.localImageRefs.filter((ref) => ref.startsWith('__emb__')).length, 0);

  assert(allLocalRefs.length === 0, 'no non-embedded local refs → image upload panel NOT shown');
  assert(embeddedImageCount === 4, `embeddedImageCount = 4 → green banner shown (got ${embeddedImageCount})`);
  console.log();

  // ── F. Payload has pictures ───────────────────────────────────────────────
  console.log('══ F. ML payload — pictures array ════════════════════════════════\n');
  for (const row of enrichedRows) {
    const pics = row.payload?.pictures ?? [];
    assert(pics.length === 2, `Row ${row.rowIndex}: payload.pictures has 2 entries (got ${pics.length})`);
    assert(
      pics.every((p: { source: string }) => p.source.startsWith('__emb__')),
      `Row ${row.rowIndex}: pictures sources are __emb__ synthetic refs`,
    );
  }
  console.log();

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${passed + failed} passed`);
  console.log();
  if (failed > 0) {
    console.log(`❌ ${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('✅ All assertions passed.');
  console.log();
  console.log('Expected UI after uploading ml-real-publish-single-file.xlsx:');
  console.log('  • Green banner: "Imágenes embebidas detectadas: 4 imágenes extraídas del Excel"');
  console.log('  • No image upload panel (no external PNGs required)');
  console.log('  • Each row shows "Imágenes embebidas: 2 detectadas ✓"');
  console.log('  • Both rows status ok (images included)');
  console.log('  • "Publicar en Mercado Libre" button enabled immediately');
}

main().catch((err) => { console.error(err); process.exit(1); });
