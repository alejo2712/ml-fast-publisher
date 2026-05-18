/**
 * End-to-end pipeline test for real ML publishing readiness.
 * Tests category path validation, image presence, GTIN, dimensions, and fixture correctness.
 *
 * Run: npm run test:real-publish-pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCsvText, parseXlsxBuffer, isLocalImageFilename } from '../src/lib/csv/parser';
import { validatePathForApplianceType, APPLIANCE_PATH_KEYWORDS } from '../src/lib/mercadolibre/category-resolver';
import { readPngDimensions } from './generate-test-images';
import { buildMLPayload } from '../src/lib/payload-builder';

// ── Assertion helpers ─────────────────────────────────────────────────────────

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

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');
const IMAGES_DIR   = path.join(FIXTURES_DIR, 'images');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'ml-real-publish-final.xlsx');

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-real-publish-pipeline');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // ══ A. Test image files ═══════════════════════════════════════════════════

  console.log('══ A. Test image files ══════════════════════════════════════════\n');

  const REQUIRED_IMAGES = [
    'refrigerator-front-1200.png',
    'refrigerator-open-1200.png',
    'microwave-front-1200.png',
    'microwave-side-1200.png',
  ];

  for (const imgName of REQUIRED_IMAGES) {
    const imgPath = path.join(IMAGES_DIR, imgName);
    const exists = fs.existsSync(imgPath);
    assert(exists, `${imgName} exists`);

    if (exists) {
      const buf = fs.readFileSync(imgPath);
      const dims = readPngDimensions(buf);
      assert(dims !== null, `${imgName} is valid PNG`);
      assert(dims?.width === 1200, `${imgName} width = 1200`, `got ${dims?.width}`);
      assert(dims?.height === 1200, `${imgName} height = 1200`, `got ${dims?.height}`);
    }
  }

  // ══ B. Category path validation logic ════════════════════════════════════

  console.log('\n══ B. Category path validation ══════════════════════════════════\n');

  // Microwave: correct category
  assert(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos y Aires Ac.' }, { id: 'MLA2', name: 'Cocción' }, { id: 'MLA3', name: 'Microondas' }],
      'microwave'
    ),
    'Microwave: "Microondas" path passes'
  );

  // Microwave: furniture path — must BLOCK
  assertFalse(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Hogar, Muebles y Jardín' }, { id: 'MLA2', name: 'Mesas Ratonas y Auxiliares' }, { id: 'MLA3', name: 'Mesas Ratonas' }],
      'microwave'
    ),
    'Microwave: "Mesas Ratonas" path BLOCKED'
  );

  // Microwave: ventiladores path — must BLOCK (no "microondas" keyword)
  assertFalse(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos' }, { id: 'MLA2', name: 'Climatización' }, { id: 'MLA3', name: 'Ventiladores' }],
      'microwave'
    ),
    'Microwave: "Ventiladores" path BLOCKED'
  );

  // Refrigerator: correct category
  assert(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos' }, { id: 'MLA2', name: 'Heladeras y Freezers' }, { id: 'MLA3', name: 'Heladeras' }],
      'refrigerator'
    ),
    'Refrigerator: "Heladeras" path passes'
  );

  // Refrigerator: furniture path — must BLOCK
  assertFalse(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Hogar, Muebles y Jardín' }, { id: 'MLA2', name: 'Muebles para el Hogar' }, { id: 'MLA3', name: 'Mesas Ratonas' }],
      'refrigerator'
    ),
    'Refrigerator: "Mesas Ratonas" path BLOCKED'
  );

  // Refrigerator: hornos path — must BLOCK
  assertFalse(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos' }, { id: 'MLA2', name: 'Cocción' }, { id: 'MLA3', name: 'Hornos' }],
      'refrigerator'
    ),
    'Refrigerator: "Hornos" path BLOCKED'
  );

  // Validate all expected keywords exist for critical types
  const criticalTypes: Array<'microwave' | 'refrigerator' | 'washing_machine' | 'freezer'> = [
    'microwave', 'refrigerator', 'washing_machine', 'freezer',
  ];
  for (const t of criticalTypes) {
    const kws = APPLIANCE_PATH_KEYWORDS[t];
    assert(
      Array.isArray(kws) && kws.length > 0,
      `${t} has path keywords defined`,
      `got: ${JSON.stringify(kws)}`
    );
  }

  // ══ C. Fixture parsing ════════════════════════════════════════════════════

  console.log('\n══ C. Fixture: ml-real-publish-final.xlsx ═══════════════════════\n');

  assert(fs.existsSync(FIXTURE_PATH), 'Fixture file exists');

  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error('  Cannot continue without fixture. Run: npx tsx scripts/generate-real-publish-test.ts');
    process.exit(1);
  }

  const buf = fs.readFileSync(FIXTURE_PATH);
  const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { csv } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);

  assert(result.rows.length === 2, `2 rows parsed`, `got ${result.rows.length}`);
  assert(result.totalErrors === 0, `0 error rows`, `got ${result.totalErrors}`);

  const [fridgeRow, microwaveRow] = result.rows;

  // Row 1: Refrigerator
  assert(fridgeRow?.draft?.applianceType === 'refrigerator', `Row 1 applianceType = refrigerator`);
  assert(fridgeRow?.draft?.gtin === '7709545018831', `Refrigerator has GTIN`);
  assert(fridgeRow?.draft?.height === 172, `Refrigerator height = 172`);
  assert(fridgeRow?.draft?.width === 60, `Refrigerator width = 60`);
  assert(fridgeRow?.draft?.depth === 65, `Refrigerator depth = 65`);
  assert((fridgeRow?.draft?.images?.length ?? 0) >= 2, `Refrigerator has ≥ 2 images`);
  assert(
    (fridgeRow?.localImageRefs?.length ?? 0) >= 2,
    `Refrigerator images are local filenames`,
    `got: ${JSON.stringify(fridgeRow?.localImageRefs)}`
  );

  // Row 1: payload has GTIN + HEIGHT/WIDTH/DEPTH attributes
  if (fridgeRow?.payload) {
    const attrs = fridgeRow.payload.attributes;
    const attrIds = attrs.map((a) => a.id);
    assert(attrIds.includes('GTIN'), `Refrigerator payload contains GTIN`);
    assert(attrIds.includes('HEIGHT'), `Refrigerator payload contains HEIGHT`);
    assert(attrIds.includes('WIDTH'), `Refrigerator payload contains WIDTH`);
    assert(attrIds.includes('DEPTH'), `Refrigerator payload contains DEPTH`);
    const gtinAttr = attrs.find((a) => a.id === 'GTIN');
    assert(gtinAttr?.value_name === '7709545018831', `GTIN value_name = 7709545018831`);
  }

  // Row 2: Microwave
  assert(microwaveRow?.draft?.applianceType === 'microwave', `Row 2 applianceType = microwave`);
  assert(microwaveRow?.draft?.height === 27, `Microwave height = 27`);
  assert(microwaveRow?.draft?.width === 52, `Microwave width = 52`);
  assert(microwaveRow?.draft?.depth === 40, `Microwave depth = 40`);
  assert(
    (microwaveRow?.localImageRefs?.length ?? 0) >= 2,
    `Microwave images are local filenames`,
    `got: ${JSON.stringify(microwaveRow?.localImageRefs)}`
  );

  // Row 2: payload has HEIGHT/WIDTH/DEPTH attributes
  if (microwaveRow?.payload) {
    const attrs = microwaveRow.payload.attributes;
    const attrIds = attrs.map((a) => a.id);
    assert(attrIds.includes('HEIGHT'), `Microwave payload contains HEIGHT`);
    assert(attrIds.includes('WIDTH'), `Microwave payload contains WIDTH`);
    assert(attrIds.includes('DEPTH'), `Microwave payload contains DEPTH`);
  }

  // ══ D. Image file presence for fixture refs ═══════════════════════════════

  console.log('\n══ D. Local image files exist for fixture refs ═══════════════════\n');

  const allLocalRefs = result.rows.flatMap((r) => r.localImageRefs);
  assert(allLocalRefs.length >= 4, `≥ 4 local image refs across rows`, `got ${allLocalRefs.length}`);

  for (const ref of allLocalRefs) {
    const imgPath = path.join(IMAGES_DIR, ref);
    assert(fs.existsSync(imgPath), `Image file present: ${ref}`);

    if (fs.existsSync(imgPath)) {
      const imgBuf = fs.readFileSync(imgPath);
      const dims = readPngDimensions(imgBuf);
      assert(dims?.width === 1200 && dims?.height === 1200, `${ref} is 1200×1200`);
    }
  }

  // No HTTPS URLs in the final fixture — all images are local
  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  const httpsImages = allImages.filter((i) => i.startsWith('https://'));
  assert(httpsImages.length === 0, `No raw HTTPS URLs in fixture (all are local filenames)`);

  // ══ E. Payload uses local refs (not pre-substituted HTTPS URLs) ════════════

  console.log('\n══ E. Payload image sources are local refs (not HTTPS) ═══════════\n');
  // Before publish-time upload, payload pictures should contain local filenames
  // (they get replaced with ML CDN URLs just before POST /items)
  for (const row of result.rows) {
    if (!row.payload) continue;
    const localPics = row.payload.pictures?.filter((p) => isLocalImageFilename(p.source)) ?? [];
    assert(
      localPics.length >= 2,
      `Row ${row.rowIndex}: payload pictures include local filenames`,
      `got: ${row.payload.pictures?.map((p) => p.source).join(', ')}`
    );
  }

  // ══ F. isLocalImageFilename detection ════════════════════════════════════

  console.log('\n══ F. isLocalImageFilename detection ════════════════════════════\n');
  assert(isLocalImageFilename('refrigerator-front-1200.png'), `refrigerator-front-1200.png → local`);
  assert(isLocalImageFilename('microwave-front-1200.png'), `microwave-front-1200.png → local`);
  assert(isLocalImageFilename('photo.jpg'), `photo.jpg → local`);
  assertFalse(isLocalImageFilename('https://example.com/img.jpg'), `https://... → NOT local`);
  assertFalse(isLocalImageFilename('http://example.com/img.jpg'), `http://... → NOT local`);
  assertFalse(isLocalImageFilename(''), `empty string → NOT local`);
  assertFalse(isLocalImageFilename('document.pdf'), `.pdf → NOT local`);

  // ══ Summary ══════════════════════════════════════════════════════════════

  const total = passed + failed;
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed.\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All assertions passed — fixture is ready for real ML publishing.\n');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
