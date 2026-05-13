/**
 * Integration tests for real-publish fixtures.
 *
 * Run: npx tsx scripts/test-real-fixture.ts
 * Or:  npm run test:real-fixture
 *
 * Covers:
 *   A. ml-real-publish-final.xlsx — GTIN, dimensions, attributes, HTTPS images
 *   B. ml-real-publish-local-images.xlsx — local image filename detection, missing-file detection
 *   C. Category path validation — microwave/refrigerator must NOT resolve to furniture
 *   D. isLocalImageFilename detection
 *
 * Fails with exit code 1 if any assertion fails.
 */
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer, isLocalImageFilename } from '../src/lib/csv/parser';
import { buildMLPayload } from '../src/lib/payload-builder';
import { validatePathForApplianceType, APPLIANCE_FALLBACK_CATEGORIES } from '../src/lib/mercadolibre/category-resolver';
import type { MLAttribute } from '../src/types';

const FIXTURE_PATH = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-final.xlsx');

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function getAttr(attrs: MLAttribute[], id: string): MLAttribute | undefined {
  return attrs.find((a) => a.id === id);
}

async function main() {
  console.log('\n══ ml-real-publish-final.xlsx fixture test ══════════════════════════\n');

  // ── 0. Fixture exists ─────────────────────────────────────────────────────
  console.log('── File check ──────────────────────────────────────────────────────');
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.log(`  ❌ Fixture not found: ${FIXTURE_PATH}`);
    console.log('     Run: npx tsx scripts/generate-real-publish-test.ts');
    process.exit(1);
  }
  console.log(`  ✅ Fixture found: ${path.basename(FIXTURE_PATH)}`);

  // ── 1. Parse ──────────────────────────────────────────────────────────────
  const fileBuffer = fs.readFileSync(FIXTURE_PATH);
  const ab = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  const csvText = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csvText);

  console.log(`\n── Parse result: ${result.rows.length} rows ─────────────────────────────────────`);
  assert(result.rows.length === 2, '2 rows parsed', `got ${result.rows.length}`);
  assert(result.totalErrors === 0, 'no parse errors', `errors: ${result.totalErrors}`);

  const fridgeRow = result.rows[0];
  const microwaveRow = result.rows[1];

  // ── 2. Detected appliance types ───────────────────────────────────────────
  console.log('\n── Appliance type detection ─────────────────────────────────────────');
  assert(fridgeRow?.draft?.applianceType === 'refrigerator', 'Row 1: applianceType = refrigerator', `got ${fridgeRow?.draft?.applianceType}`);
  assert(microwaveRow?.draft?.applianceType === 'microwave', 'Row 2: applianceType = microwave', `got ${microwaveRow?.draft?.applianceType}`);

  // ── 3. GTIN ───────────────────────────────────────────────────────────────
  console.log('\n── GTIN ─────────────────────────────────────────────────────────────');
  assert(fridgeRow?.draft?.gtin === '7709545018831', 'Refrigerator draft.gtin = 7709545018831', `got "${fridgeRow?.draft?.gtin}"`);
  assert(!microwaveRow?.draft?.gtin, 'Microwave draft.gtin is empty (expected — no GTIN provided)', `got "${microwaveRow?.draft?.gtin}"`);

  const fridgePayload = fridgeRow?.draft ? buildMLPayload(fridgeRow.draft) : null;
  const gtinAttr = fridgePayload ? getAttr(fridgePayload.attributes, 'GTIN') : null;
  assert(gtinAttr != null, 'Refrigerator payload contains GTIN attribute', 'attribute missing from payload');
  assert(gtinAttr?.value_name === '7709545018831', `GTIN value_name = 7709545018831`, `got "${gtinAttr?.value_name}"`);

  // ── 4. Dimensions — refrigerator ─────────────────────────────────────────
  console.log('\n── Dimensions — Refrigerator ────────────────────────────────────────');
  assert(fridgeRow?.draft?.height === 172, 'Refrigerator draft.height = 172', `got ${fridgeRow?.draft?.height}`);
  assert(fridgeRow?.draft?.width === 60, 'Refrigerator draft.width = 60', `got ${fridgeRow?.draft?.width}`);
  assert(fridgeRow?.draft?.depth === 65, 'Refrigerator draft.depth = 65', `got ${fridgeRow?.draft?.depth}`);

  const heightAttrFridge = fridgePayload ? getAttr(fridgePayload.attributes, 'HEIGHT') : null;
  const widthAttrFridge  = fridgePayload ? getAttr(fridgePayload.attributes, 'WIDTH') : null;
  const depthAttrFridge  = fridgePayload ? getAttr(fridgePayload.attributes, 'DEPTH') : null;
  assert(heightAttrFridge?.value_name === '172 cm', 'Refrigerator payload HEIGHT = 172 cm', `got "${heightAttrFridge?.value_name}"`);
  assert(widthAttrFridge?.value_name === '60 cm',   'Refrigerator payload WIDTH = 60 cm',   `got "${widthAttrFridge?.value_name}"`);
  assert(depthAttrFridge?.value_name === '65 cm',   'Refrigerator payload DEPTH = 65 cm',   `got "${depthAttrFridge?.value_name}"`);

  // ── 5. Dimensions — microwave ─────────────────────────────────────────────
  console.log('\n── Dimensions — Microwave ───────────────────────────────────────────');
  assert(microwaveRow?.draft?.height === 27, 'Microwave draft.height = 27', `got ${microwaveRow?.draft?.height}`);
  assert(microwaveRow?.draft?.width === 52, 'Microwave draft.width = 52', `got ${microwaveRow?.draft?.width}`);
  assert(microwaveRow?.draft?.depth === 40, 'Microwave draft.depth = 40', `got ${microwaveRow?.draft?.depth}`);

  const microwavePayload = microwaveRow?.draft ? buildMLPayload(microwaveRow.draft) : null;
  const heightAttrMicrowave = microwavePayload ? getAttr(microwavePayload.attributes, 'HEIGHT') : null;
  const widthAttrMicrowave  = microwavePayload ? getAttr(microwavePayload.attributes, 'WIDTH') : null;
  const depthAttrMicrowave  = microwavePayload ? getAttr(microwavePayload.attributes, 'DEPTH') : null;
  assert(heightAttrMicrowave?.value_name === '27 cm', 'Microwave payload HEIGHT = 27 cm', `got "${heightAttrMicrowave?.value_name}"`);
  assert(widthAttrMicrowave?.value_name === '52 cm',  'Microwave payload WIDTH = 52 cm',  `got "${widthAttrMicrowave?.value_name}"`);
  assert(depthAttrMicrowave?.value_name === '40 cm',  'Microwave payload DEPTH = 40 cm',  `got "${depthAttrMicrowave?.value_name}"`);

  // ── 6. No local images ────────────────────────────────────────────────────
  console.log('\n── Images ───────────────────────────────────────────────────────────');
  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  assert(allImages.length >= 4, `At least 4 images total (2 per row)`, `got ${allImages.length}`);
  const localImages = allImages.filter((img) => img.startsWith('/'));
  assert(localImages.length === 0, 'No local images (all must be HTTPS for real ML publish)', `local: ${localImages.join(', ')}`);
  const httpsImages = allImages.filter((img) => img.startsWith('https://'));
  assert(httpsImages.length === allImages.length, `All ${allImages.length} images are HTTPS`);

  // ── 7. Payload structure ──────────────────────────────────────────────────
  console.log('\n── Payload structure ────────────────────────────────────────────────');
  assert(fridgePayload?.category_id != null, 'Refrigerator payload has category_id');
  assert(fridgePayload?.price === 450000, `Refrigerator price = 450000 ARS`, `got ${fridgePayload?.price}`);
  assert(fridgePayload?.condition === 'new', `Refrigerator condition = new`, `got ${fridgePayload?.condition}`);
  assert(microwavePayload?.price === 115000, `Microwave price = 115000 ARS`, `got ${microwavePayload?.price}`);
  assert(microwavePayload?.condition === 'new', `Microwave condition = new`, `got ${microwavePayload?.condition}`);

  // ── 8. Key attribute presence ─────────────────────────────────────────────
  console.log('\n── Key ML attributes ────────────────────────────────────────────────');
  const fridgeAttrs = fridgePayload?.attributes ?? [];
  const microwaveAttrs = microwavePayload?.attributes ?? [];
  assert(getAttr(fridgeAttrs, 'BRAND')?.value_name === 'Samsung', 'Refrigerator BRAND = Samsung');
  assert(getAttr(fridgeAttrs, 'MODEL')?.value_name === 'RT29FARADWW', 'Refrigerator MODEL = RT29FARADWW');
  assert(getAttr(fridgeAttrs, 'CAPACITY') != null, 'Refrigerator CAPACITY present');
  assert(getAttr(microwaveAttrs, 'BRAND')?.value_name === 'Samsung', 'Microwave BRAND = Samsung');
  assert(getAttr(microwaveAttrs, 'POWER_CONSUMPTION') != null, 'Microwave POWER_CONSUMPTION present');

  // ── 9. Attribute dump (informational) ────────────────────────────────────
  console.log('\n── Refrigerator attributes (before enrichment) ─────────────────────');
  fridgeAttrs.forEach((a) => console.log(`  ${a.id}: ${a.value_name}`));
  console.log('\n── Microwave attributes (before enrichment) ────────────────────────');
  microwaveAttrs.forEach((a) => console.log(`  ${a.id}: ${a.value_name}`));

  // ══════════════════════════════════════════════════════════════════════════
  // PART B: Local image fixture tests
  // ══════════════════════════════════════════════════════════════════════════

  console.log('\n\n══ B. Local image fixture: ml-real-publish-local-images.xlsx ═══════════════\n');
  const LOCAL_FIXTURE = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-local-images.xlsx');
  const IMAGES_DIR = path.resolve(__dirname, '../tests/fixtures/images');

  console.log('── File check ──────────────────────────────────────────────────────');
  if (fs.existsSync(LOCAL_FIXTURE)) {
    console.log(`  ✅ Local images fixture found`);
  } else {
    console.log(`  ⚠️  Local images fixture not found — run: npx tsx scripts/generate-local-images-fixture.ts`);
  }

  const imageFiles = new Map<string, string>();
  if (fs.existsSync(IMAGES_DIR)) {
    fs.readdirSync(IMAGES_DIR).forEach((f) => imageFiles.set(f.toLowerCase(), f));
  }

  assert(imageFiles.has('heladera-frente.jpg'), 'heladera-frente.jpg exists in tests/fixtures/images/');
  assert(imageFiles.has('heladera-lateral.jpg'), 'heladera-lateral.jpg exists');
  assert(imageFiles.has('microondas-frente.jpg'), 'microondas-frente.jpg exists');
  assert(imageFiles.has('lavarropas-frente.jpg'), 'lavarropas-frente.jpg exists');
  assert(!imageFiles.has('lavarropas-missing.jpg'), 'lavarropas-missing.jpg is ABSENT (intentional)');

  if (fs.existsSync(LOCAL_FIXTURE)) {
    const localBuf = fs.readFileSync(LOCAL_FIXTURE);
    const localAb = localBuf.buffer.slice(localBuf.byteOffset, localBuf.byteOffset + localBuf.byteLength) as ArrayBuffer;
    const localCsv = await parseXlsxBuffer(localAb);
    const localResult = await parseCsvText(localCsv);

    console.log('\n── Local image fixture parsing ─────────────────────────────────────');
    assert(localResult.rows.length === 4, `4 rows parsed from local-images fixture`, `got ${localResult.rows.length}`);

    const [heladeraRow, microwaveRow2, lavarropasRow, cafeteraRow] = localResult.rows;

    assert(heladeraRow?.localImageRefs.length === 2, 'Heladera: 2 localImageRefs', `got ${JSON.stringify(heladeraRow?.localImageRefs)}`);
    assert(heladeraRow?.localImageRefs.includes('heladera-frente.jpg'), 'Heladera: heladera-frente.jpg in refs');
    assert(heladeraRow?.localImageRefs.includes('heladera-lateral.jpg'), 'Heladera: heladera-lateral.jpg in refs');
    assert(heladeraRow?.draft?.gtin === '7509546069525', 'Heladera: GTIN parsed', `got ${heladeraRow?.draft?.gtin}`);
    assert(heladeraRow?.draft?.height === 165, 'Heladera: height=165', `got ${heladeraRow?.draft?.height}`);

    assert(microwaveRow2?.localImageRefs.length === 1, 'Microondas: 1 localImageRef', `got ${JSON.stringify(microwaveRow2?.localImageRefs)}`);
    assert(microwaveRow2?.localImageRefs.includes('microondas-frente.jpg'), 'Microondas: microondas-frente.jpg in refs');

    assert(lavarropasRow?.localImageRefs.length === 2, 'Lavarropas: 2 localImageRefs', `got ${JSON.stringify(lavarropasRow?.localImageRefs)}`);
    assert(lavarropasRow?.localImageRefs.includes('lavarropas-missing.jpg'), 'Lavarropas: missing ref detected');

    assert(cafeteraRow?.localImageRefs.length === 0, 'Cafetera: 0 localImageRefs (HTTPS URL)', `got ${JSON.stringify(cafeteraRow?.localImageRefs)}`);

    // File matching simulation
    console.log('\n── Missing file detection ───────────────────────────────────────────');
    const lavarropasMissing = lavarropasRow?.localImageRefs.filter((r) => !imageFiles.has(r.toLowerCase())) ?? [];
    assert(lavarropasMissing.length === 1, 'Lavarropas: 1 missing file detected', `missing: ${JSON.stringify(lavarropasMissing)}`);
    assert(lavarropasMissing[0] === 'lavarropas-missing.jpg', 'Missing file is lavarropas-missing.jpg');

    const heladeraMatched = heladeraRow?.localImageRefs.filter((r) => imageFiles.has(r.toLowerCase())) ?? [];
    assert(heladeraMatched.length === 2, 'Heladera: both files matched', `matched: ${JSON.stringify(heladeraMatched)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART C: isLocalImageFilename detection
  // ══════════════════════════════════════════════════════════════════════════

  console.log('\n\n══ C. isLocalImageFilename detection ═══════════════════════════════════════\n');

  assert(isLocalImageFilename('heladera-frente.jpg'), 'heladera-frente.jpg → local');
  assert(isLocalImageFilename('photo.png'), 'photo.png → local');
  assert(isLocalImageFilename('img.webp'), 'img.webp → local');
  assert(!isLocalImageFilename('https://example.com/foto.jpg'), 'https://... → NOT local');
  assert(!isLocalImageFilename('http://example.com/foto.jpg'), 'http://... → NOT local');
  assert(!isLocalImageFilename(''), 'empty string → NOT local');
  assert(!isLocalImageFilename('doc.txt'), '.txt → NOT local');

  // ══════════════════════════════════════════════════════════════════════════
  // PART D: Category path validation — keyword fix
  // ══════════════════════════════════════════════════════════════════════════

  console.log('\n\n══ D. Category path keyword validation ════════════════════════════════════\n');

  const microwaveCorrect = [{ id: 'A', name: 'Electrodomésticos' }, { id: 'B', name: 'Cocción' }, { id: 'C', name: 'Microondas' }];
  const microwaveFurniture = [{ id: 'A', name: 'Muebles y Hogar' }, { id: 'B', name: 'Cocina' }, { id: 'C', name: 'Utensilios' }];
  const microwaveWrongElectro = [{ id: 'A', name: 'Electrodomésticos' }, { id: 'B', name: 'Climatización' }, { id: 'C', name: 'Ventiladores' }];

  assert(validatePathForApplianceType(microwaveCorrect, 'microwave'), 'Microwave: correct path passes');
  assert(!validatePathForApplianceType(microwaveFurniture, 'microwave'), 'Microwave: furniture path BLOCKED');
  assert(!validatePathForApplianceType(microwaveWrongElectro, 'microwave'), 'Microwave: ventiladores path BLOCKED (no microondas keyword)');

  const fridgeCorrect = [{ id: 'A', name: 'Electrodomésticos' }, { id: 'B', name: 'Refrigeración' }, { id: 'C', name: 'Heladeras' }];
  const fridgeFurniture = [{ id: 'A', name: 'Muebles y Hogar' }, { id: 'B', name: 'Almacenamiento' }, { id: 'C', name: 'Estantes' }];
  const fridgeWrongElectro = [{ id: 'A', name: 'Electrodomésticos' }, { id: 'B', name: 'Cocción' }, { id: 'C', name: 'Hornos' }];

  assert(validatePathForApplianceType(fridgeCorrect, 'refrigerator'), 'Refrigerator: correct path passes');
  assert(!validatePathForApplianceType(fridgeFurniture, 'refrigerator'), 'Refrigerator: furniture path BLOCKED');
  assert(!validatePathForApplianceType(fridgeWrongElectro, 'refrigerator'), 'Refrigerator: hornos path BLOCKED (no heladera/refriger keyword)');

  assert(!!APPLIANCE_FALLBACK_CATEGORIES['refrigerator'], 'Refrigerator fallback category defined');
  assert(!!APPLIANCE_FALLBACK_CATEGORIES['microwave'], 'Microwave fallback category defined');

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  console.log(`Results: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed — fix the issues above before publishing to ML.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All assertions passed — fixture is ready for real ML publishing.\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
