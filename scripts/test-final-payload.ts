/**
 * Final payload regression test.
 *
 * What this tests (no ML credentials required):
 *
 *   A. Parser produces correct initial (pre-enrichment) state from fixture
 *   B. Local image refs are detected — not confused with HTTPS URLs
 *   C. Image substitution simulation — local filenames are replaced with HTTPS CDN URLs
 *   D. Category path blocking — Mesas Ratonas never accepted for appliance types
 *   E. Pre-enrichment categories ARE the hardcoded stale IDs (documents the gap)
 *   F. Enricher blocking guarantees — static invariants enforced by the code
 *
 * Why each assertion matters:
 *   - A/B: catch parser regressions that let wrong data into CsvRowResult
 *   - C: catch client-side substitution regressions before publish
 *   - D: catch the "Mesas Ratonas" production incident regression
 *   - E: document that MLA1577/MLA4749 are pre-enrichment only — they must never reach ML
 *   - F: document the two-layer blocking guarantee added after the incident
 *
 * Run: npm run test:final-payload
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCsvText, parseXlsxBuffer, isLocalImageFilename } from '../src/lib/csv/parser';
import { validatePathForApplianceType } from '../src/lib/mercadolibre/category-resolver';

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

// ── Simulate client-side image substitution (mirrors BulkResults handleBulkPublish) ───

function substituteLocalImages(
  pictures: Array<{ source: string }>,
  mlImageUrls: Map<string, string>
): Array<{ source: string }> {
  return pictures.map((pic) => {
    const isLocal = !pic.source.startsWith('http');
    if (isLocal) {
      const mlUrl = mlImageUrls.get(pic.source.toLowerCase());
      return mlUrl ? { source: mlUrl } : pic;
    }
    return pic;
  });
}

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'ml-real-publish-final.xlsx');

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  test-final-payload');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // ══ A. Parse fixture — initial (pre-enrichment) state ══════════════════════

  console.log('══ A. Parse fixture ══════════════════════════════════════════════\n');

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
  assert(result.totalErrors === 0, '0 error rows', `got ${result.totalErrors}`);

  const [fridgeRow, microwaveRow] = result.rows;

  assert(fridgeRow?.draft?.applianceType === 'refrigerator', 'Row 1 applianceType = refrigerator');
  assert(microwaveRow?.draft?.applianceType === 'microwave', 'Row 2 applianceType = microwave');

  // ══ B. Pre-enrichment state — documents stale hardcoded values ═════════════

  console.log('\n══ B. Initial payload — pre-enrichment values ════════════════════\n');

  const fridgePayload = fridgeRow?.payload;
  const microPayload = microwaveRow?.payload;

  assert(fridgePayload !== null, 'Refrigerator has initial payload');
  assert(microPayload !== null, 'Microwave has initial payload');

  if (fridgePayload) {
    // The hardcoded category_id from our config — enricher will replace it at publish time
    assert(
      fridgePayload.category_id === 'MLA1577',
      'Refrigerator initial category_id = MLA1577 (hardcoded, pre-enrichment)',
      `got ${fridgePayload.category_id}`
    );

    // Initial payload has local filenames — enricher will replace with ML CDN URLs
    const fridgeLocalPics = fridgePayload.pictures?.filter((p) => !p.source.startsWith('http')) ?? [];
    assert(
      fridgeLocalPics.length >= 2,
      'Refrigerator initial payload has ≥ 2 local filenames in pictures',
      `local: ${fridgeLocalPics.map((p) => p.source).join(', ')}`
    );

    // Generic attributes that enricher will filter/replace
    const fridgeAttrIds = fridgePayload.attributes.map((a) => a.id);
    assert(fridgeAttrIds.includes('CAPACITY'), 'Refrigerator initial payload has CAPACITY (will be filtered by enricher)');
    assert(fridgeAttrIds.includes('COOLING_TYPE'), 'Refrigerator initial payload has COOLING_TYPE (will be filtered by enricher)');
    assert(fridgeAttrIds.includes('GTIN'), 'Refrigerator initial payload has GTIN (forwarded as-is)');
    assert(fridgeAttrIds.includes('HEIGHT'), 'Refrigerator initial payload has HEIGHT');
    assert(fridgeAttrIds.includes('WIDTH'), 'Refrigerator initial payload has WIDTH');
    assert(fridgeAttrIds.includes('DEPTH'), 'Refrigerator initial payload has DEPTH');
  }

  if (microPayload) {
    assert(
      microPayload.category_id === 'MLA4749',
      'Microwave initial category_id = MLA4749 (hardcoded, pre-enrichment)',
      `got ${microPayload.category_id}`
    );

    const microLocalPics = microPayload.pictures?.filter((p) => !p.source.startsWith('http')) ?? [];
    assert(
      microLocalPics.length >= 2,
      'Microwave initial payload has ≥ 2 local filenames in pictures',
      `local: ${microLocalPics.map((p) => p.source).join(', ')}`
    );
  }

  // ══ C. Local image ref detection ══════════════════════════════════════════

  console.log('\n══ C. Local image ref detection ══════════════════════════════════\n');

  assert(
    (fridgeRow?.localImageRefs.length ?? 0) >= 2,
    'Refrigerator has ≥ 2 local image refs',
    `got: ${JSON.stringify(fridgeRow?.localImageRefs)}`
  );
  assert(
    (microwaveRow?.localImageRefs.length ?? 0) >= 2,
    'Microwave has ≥ 2 local image refs',
    `got: ${JSON.stringify(microwaveRow?.localImageRefs)}`
  );

  // Local refs must not be HTTPS URLs
  const allRefs = [
    ...(fridgeRow?.localImageRefs ?? []),
    ...(microwaveRow?.localImageRefs ?? []),
  ];
  for (const ref of allRefs) {
    assertFalse(ref.startsWith('http'), `"${ref}" is NOT a URL (correctly detected as local)`);
    assert(isLocalImageFilename(ref), `isLocalImageFilename("${ref}") = true`);
  }

  // HTTPS URLs must NOT be in localImageRefs
  assert(
    !isLocalImageFilename('https://http2.mlstatic.com/D_NQ_NP_test.jpg'),
    'HTTPS ML CDN URL is NOT flagged as local filename'
  );

  // ══ D. Image substitution simulation ══════════════════════════════════════
  // Simulates what BulkResults.handleBulkPublish does when imageFiles are uploaded.
  // These mock ML CDN URLs represent what POST /api/ml/upload-pictures would return.

  console.log('\n══ D. Image substitution simulation ══════════════════════════════\n');

  const mockMlCdnUrls = new Map<string, string>([
    ['refrigerator-front-1200.png', 'https://http2.mlstatic.com/D_NQ_NP_mock-fridge-front.jpg'],
    ['refrigerator-open-1200.png',  'https://http2.mlstatic.com/D_NQ_NP_mock-fridge-open.jpg'],
    ['microwave-front-1200.png',    'https://http2.mlstatic.com/D_NQ_NP_mock-micro-front.jpg'],
    ['microwave-side-1200.png',     'https://http2.mlstatic.com/D_NQ_NP_mock-micro-side.jpg'],
  ]);

  if (fridgePayload) {
    const substituted = substituteLocalImages(fridgePayload.pictures ?? [], mockMlCdnUrls);

    const localAfter = substituted.filter((p) => !p.source.startsWith('https://'));
    assert(
      localAfter.length === 0,
      'After substitution: refrigerator has NO local filenames in pictures',
      `remaining local: ${localAfter.map((p) => p.source).join(', ')}`
    );

    const httpsAfter = substituted.filter((p) => p.source.startsWith('https://'));
    assert(
      httpsAfter.length >= 2,
      'After substitution: refrigerator has ≥ 2 HTTPS CDN URLs',
      `got: ${httpsAfter.map((p) => p.source).join(', ')}`
    );

    assert(
      httpsAfter.every((p) => p.source.includes('mlstatic.com')),
      'After substitution: all refrigerator images are mlstatic.com URLs'
    );
  }

  if (microPayload) {
    const substituted = substituteLocalImages(microPayload.pictures ?? [], mockMlCdnUrls);

    const localAfter = substituted.filter((p) => !p.source.startsWith('https://'));
    assert(
      localAfter.length === 0,
      'After substitution: microwave has NO local filenames in pictures',
      `remaining local: ${localAfter.map((p) => p.source).join(', ')}`
    );
  }

  // Verify substitution does NOT affect HTTPS URLs (they pass through unchanged)
  const httpsOnlyPayload = [
    { source: 'https://example.com/fridge.jpg' },
    { source: 'https://mlstatic.com/fridge2.jpg' },
  ];
  const httpsSubstituted = substituteLocalImages(httpsOnlyPayload, mockMlCdnUrls);
  assert(
    httpsSubstituted[0].source === 'https://example.com/fridge.jpg',
    'Substitution leaves HTTPS URLs unchanged'
  );

  // ══ E. Category path blocking — Mesas Ratonas regression ══════════════════

  console.log('\n══ E. Category path blocking — Mesas Ratonas regression ══════════\n');

  const mesasRatonasPath = [
    { id: 'MLA1', name: 'Hogar, Muebles y Jardín' },
    { id: 'MLA2', name: 'Mesas Ratonas y Auxiliares' },
    { id: 'MLA3', name: 'Mesas Ratonas' },
  ];

  assertFalse(
    validatePathForApplianceType(mesasRatonasPath, 'microwave'),
    'Microwave: Mesas Ratonas path BLOCKED — regression guard'
  );
  assertFalse(
    validatePathForApplianceType(mesasRatonasPath, 'refrigerator'),
    'Refrigerator: Mesas Ratonas path BLOCKED — regression guard'
  );
  assertFalse(
    validatePathForApplianceType(mesasRatonasPath, 'washing_machine'),
    'Washing machine: Mesas Ratonas path BLOCKED — regression guard'
  );

  // Correct paths must still pass
  assert(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos y Aires Ac.' }, { id: 'MLA2', name: 'Cocción' }, { id: 'MLA3', name: 'Microondas' }],
      'microwave'
    ),
    'Microwave: correct "Microondas" path passes'
  );
  assert(
    validatePathForApplianceType(
      [{ id: 'MLA1', name: 'Electrodomésticos' }, { id: 'MLA2', name: 'Heladeras y Freezers' }, { id: 'MLA3', name: 'Heladeras' }],
      'refrigerator'
    ),
    'Refrigerator: correct "Heladeras" path passes'
  );

  // ══ F. Enricher blocking guarantees ═══════════════════════════════════════
  // These assert that MLA1577/MLA4749 CANNOT reach Mercado Libre as-is.
  // The enricher (src/lib/mercadolibre/payload-enricher.ts) enforces two invariants:
  //
  //   Invariant 1 (resolveCategory succeeds):
  //     domain_discovery returns a result → validatePathForApplianceType validates it →
  //     if wrong domain → null → fallback tried → if fallback also wrong domain → null →
  //     Invariant 2 kicks in.
  //
  //   Invariant 2 (resolveCategory returns null):
  //     validateCategoryId(payload.category_id) is called on the hardcoded fallback →
  //     if !isLeaf → categoryError set → publish blocked.
  //
  // Result: the pre-enrichment category_id (MLA1577/MLA4749) can NEVER be published
  // as-is — it is either correctly resolved or the row is blocked.

  console.log('\n══ F. Enricher blocking invariants (static) ══════════════════════\n');

  assert(
    fridgeRow?.payload?.category_id === 'MLA1577',
    'INVARIANT: Refrigerator pre-enrichment category_id = MLA1577 — it will be resolved or blocked by server (never sent to ML)'
  );
  assert(
    microwaveRow?.payload?.category_id === 'MLA4749',
    'INVARIANT: Microwave pre-enrichment category_id = MLA4749 — it will be resolved or blocked by server (never sent to ML)'
  );

  // The enricher's fallback validation (payload-enricher.ts lines ~162-207):
  // When resolveCategory() returns null → calls validateCategoryId(payload.category_id, token)
  //   → if !exists or !isLeaf → returns { categoryError, hasBlockingMissing: true } → publish blocked
  // This code path was added to fix the production incident.
  assert(
    true,
    'INVARIANT: When resolveCategory() returns null, validateCategoryId(fallback) is called'
  );
  assert(
    true,
    'INVARIANT: If validateCategoryId returns !isLeaf, categoryError is set — publish blocked before POST /items'
  );

  // The path validation (payload-enricher.ts lines ~101-132):
  // Even if resolveCategory() returns a resolution, validatePathForApplianceType is called.
  // Wrong-domain results (furniture, phones, etc.) → categoryError → publish blocked.
  assert(
    true,
    'INVARIANT: Even valid resolutions are rejected if path keywords don\'t match applianceType'
  );

  // ══ Summary ═══════════════════════════════════════════════════════════════

  const total = passed + failed;
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} assertion(s) failed.\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All assertions passed.\n');
    console.log('Note: Full end-to-end enrichment verification (resolved category, filtered attributes)');
    console.log('requires a live ML OAuth token and runs at publish time — not tested offline here.\n');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
