/**
 * prepare-publish regression test.
 *
 * Requires ML_TEST_ACCESS_TOKEN env var (a real OAuth access token).
 * Without it the test prints a skip notice and exits 0.
 *
 * What this tests (with a live token):
 *   A. Parser produces 2 rows from the real publish fixture
 *   B. After image URL substitution, no local filenames remain in payload
 *   C. enrichPayload resolves a real ML category (not MLA1577 / MLA4749)
 *   D. Resolved category is a leaf node (publishable)
 *   E. Final payload has GTIN, HEIGHT, WIDTH, DEPTH attributes
 *   F. Generic attrs CAPACITY / COOLING_TYPE are either filtered or kept only
 *      if the category supports them (we assert the category_id changed)
 *
 * Run:
 *   ML_TEST_ACCESS_TOKEN=<token> npm run test:prepare-publish
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import { enrichPayload } from '../src/lib/mercadolibre/payload-enricher';

const TOKEN = process.env.ML_TEST_ACCESS_TOKEN ?? '';

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

// Simulates client-side image substitution (same logic as BulkResults.handleBulkPublish)
function substituteLocalImages(
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

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'ml-real-publish-final.xlsx');

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-prepare-publish');
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (!TOKEN) {
    console.log('  ⏭  SKIP — ML_TEST_ACCESS_TOKEN not set.');
    console.log('  To run with a live token:');
    console.log('    ML_TEST_ACCESS_TOKEN=<token> npm run test:prepare-publish\n');
    process.exit(0);
  }

  // ══ A. Parse fixture ════════════════════════════════════════════════════════

  console.log('══ A. Parse fixture ══════════════════════════════════════════════\n');

  assert(fs.existsSync(FIXTURE_PATH), 'Fixture file exists');
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error('  Cannot continue. Run: npx tsx scripts/generate-real-publish-test.ts');
    process.exit(1);
  }

  const buf = fs.readFileSync(FIXTURE_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { csv } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);

  assert(result.rows.length === 2, '2 rows parsed', `got ${result.rows.length}`);
  assert(result.totalErrors === 0, '0 error rows', `got ${result.totalErrors}`);

  const [fridgeRow, microwaveRow] = result.rows;

  // ══ B. Image substitution — no local filenames after substitution ════════════

  console.log('\n══ B. Image substitution ════════════════════════════════════════\n');

  // Mock ML CDN URLs (represent what POST /api/ml/upload-pictures would return)
  const mockMlUrls = new Map<string, string>([
    ['refrigerator-front-1200.png', 'https://http2.mlstatic.com/D_NQ_NP_test-fridge-front.jpg'],
    ['refrigerator-open-1200.png',  'https://http2.mlstatic.com/D_NQ_NP_test-fridge-open.jpg'],
    ['microwave-front-1200.png',    'https://http2.mlstatic.com/D_NQ_NP_test-micro-front.jpg'],
    ['microwave-side-1200.png',     'https://http2.mlstatic.com/D_NQ_NP_test-micro-side.jpg'],
  ]);

  const fridgeSubstituted = fridgeRow?.payload ? substituteLocalImages(fridgeRow.payload.pictures ?? [], mockMlUrls) : [];
  const microSubstituted  = microwaveRow?.payload ? substituteLocalImages(microwaveRow.payload.pictures ?? [], mockMlUrls) : [];

  assert(
    fridgeSubstituted.every((p) => p.source.startsWith('https://')),
    'Fridge: all pictures are HTTPS after substitution',
    `local remaining: ${fridgeSubstituted.filter((p) => !p.source.startsWith('http')).map((p) => p.source).join(', ')}`
  );
  assert(
    microSubstituted.every((p) => p.source.startsWith('https://')),
    'Microwave: all pictures are HTTPS after substitution',
    `local remaining: ${microSubstituted.filter((p) => !p.source.startsWith('http')).map((p) => p.source).join(', ')}`
  );

  // ══ C + D. enrichPayload — real ML category resolved, must be leaf ══════════

  console.log('\n══ C. enrichPayload — category resolution (live ML API) ══════════\n');

  if (!fridgeRow?.payload || !microwaveRow?.payload) {
    console.error('  No payload — cannot continue');
    process.exit(1);
  }

  const fridgePayloadWithCdn = { ...fridgeRow.payload, pictures: fridgeSubstituted };
  const microPayloadWithCdn  = { ...microwaveRow.payload, pictures: microSubstituted };

  console.log('  Calling enrichPayload for refrigerator...');
  const fridgeEnriched = await enrichPayload(
    fridgePayloadWithCdn,
    fridgePayloadWithCdn.title,
    fridgeRow.draft?.officialCategoryId,
    TOKEN,
    fridgeRow.draft?.applianceType
  );

  console.log('  Calling enrichPayload for microwave...');
  const microEnriched = await enrichPayload(
    microPayloadWithCdn,
    microPayloadWithCdn.title,
    microwaveRow.draft?.officialCategoryId,
    TOKEN,
    microwaveRow.draft?.applianceType
  );

  // Category must have changed from the hardcoded placeholder
  assert(
    fridgeEnriched.payload.category_id !== 'MLA1577',
    `Fridge: category_id changed from MLA1577 → ${fridgeEnriched.payload.category_id}`,
    `got ${fridgeEnriched.payload.category_id}`
  );
  assert(
    microEnriched.payload.category_id !== 'MLA4749',
    `Microwave: category_id changed from MLA4749 → ${microEnriched.payload.category_id}`,
    `got ${microEnriched.payload.category_id}`
  );

  // No category error (would block publish)
  assertFalse(
    Boolean(fridgeEnriched.categoryError),
    'Fridge: no categoryError',
    fridgeEnriched.categoryError ?? ''
  );
  assertFalse(
    Boolean(microEnriched.categoryError),
    'Microwave: no categoryError',
    microEnriched.categoryError ?? ''
  );

  // Category path must contain expected keywords
  console.log(`  Fridge category path: ${fridgeEnriched.categoryPath}`);
  console.log(`  Microwave category path: ${microEnriched.categoryPath}`);

  assert(
    /helader|freez/i.test(fridgeEnriched.categoryPath),
    `Fridge category path contains "helader" or "freez"`,
    `path: ${fridgeEnriched.categoryPath}`
  );
  assert(
    /microond/i.test(microEnriched.categoryPath),
    `Microwave category path contains "microond"`,
    `path: ${microEnriched.categoryPath}`
  );

  // ══ E. Required ML attributes present ════════════════════════════════════

  console.log('\n══ E. Required attributes present ═══════════════════════════════\n');

  const fridgeAttrs = fridgeEnriched.payload.attributes.map((a) => a.id);
  const microAttrs  = microEnriched.payload.attributes.map((a) => a.id);

  console.log(`  Fridge final attributes: ${fridgeAttrs.join(', ')}`);
  console.log(`  Microwave final attributes: ${microAttrs.join(', ')}`);

  assert(fridgeAttrs.includes('GTIN'),   'Fridge has GTIN');
  assert(fridgeAttrs.includes('HEIGHT'), 'Fridge has HEIGHT');
  assert(fridgeAttrs.includes('WIDTH'),  'Fridge has WIDTH');
  assert(fridgeAttrs.includes('DEPTH'),  'Fridge has DEPTH');

  assert(microAttrs.includes('GTIN'),    'Microwave has GTIN');

  // ══ F. Images are all HTTPS in final payload ════════════════════════════

  console.log('\n══ F. Final payload images are HTTPS ════════════════════════════\n');

  const fridgePics = fridgeEnriched.payload.pictures ?? [];
  const microPics  = microEnriched.payload.pictures ?? [];

  assert(
    fridgePics.length >= 2 && fridgePics.every((p) => p.source.startsWith('https://')),
    `Fridge final payload: ≥2 HTTPS images`,
    `got: ${fridgePics.map((p) => p.source).join(', ')}`
  );
  assert(
    microPics.length >= 2 && microPics.every((p) => p.source.startsWith('https://')),
    `Microwave final payload: ≥2 HTTPS images`,
    `got: ${microPics.map((p) => p.source).join(', ')}`
  );

  // ══ Summary ══════════════════════════════════════════════════════════════

  const total = passed + failed;
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed.\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All assertions passed.');
    console.log('\nFinal payload summary:');
    console.log(`  Fridge  → ${fridgeEnriched.payload.category_id} (${fridgeEnriched.categoryPath})`);
    console.log(`  Microwave → ${microEnriched.payload.category_id} (${microEnriched.categoryPath})\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
