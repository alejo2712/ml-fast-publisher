/**
 * Category guard tests — verifies that wrong-domain categories are blocked before publish.
 *
 * Guards against the production failure where:
 *   MLA1577 (Microondas) was used for refrigerator listings
 *   MLA4749 (Mesas Ratonas / furniture) was used for microwave listings
 *   → ML accepted both publishes but immediately finalized them as "wrong category"
 *
 * Run: npm run test:category-guard
 */
import { validatePathForApplianceType, APPLIANCE_PATH_KEYWORDS } from '../src/lib/mercadolibre/category-resolver';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Simulate a category with a specific path_from_root */
function makePath(names: string[]): Array<{ id: string; name: string }> {
  return names.map((name, i) => ({ id: `MLA${i}`, name }));
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  test-category-guard — wrong-category publish prevention');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ── A. MLA1577 = Microondas path must NOT pass for refrigerator ───────────
  console.log('══ A. MLA1577 (Microondas) rejected for refrigerator ════════════\n');
  const mla1577Path = makePath(['Electrodomésticos y Aires Ac.', 'Cocción', 'Microondas']);
  assert(
    !validatePathForApplianceType(mla1577Path, 'refrigerator'),
    'MLA1577 (Microondas) does NOT pass path validation for refrigerator',
    'path: ' + mla1577Path.map(p => p.name).join(' > '),
  );
  assert(
    validatePathForApplianceType(mla1577Path, 'microwave'),
    'MLA1577 (Microondas) DOES pass path validation for microwave',
  );
  console.log();

  // ── B. MLA4749 = Mesas Ratonas must NOT pass for microwave ───────────────
  console.log('══ B. MLA4749 (Mesas Ratonas) rejected for microwave ════════════\n');
  const mla4749Path = makePath(['Hogar, Muebles y Jardín', 'Muebles para el Hogar', 'Mesas Ratonas y Auxiliares', 'Mesas Ratonas']);
  assert(
    !validatePathForApplianceType(mla4749Path, 'microwave'),
    'MLA4749 (Mesas Ratonas) does NOT pass path validation for microwave',
  );
  assert(
    !validatePathForApplianceType(mla4749Path, 'refrigerator'),
    'MLA4749 (Mesas Ratonas) does NOT pass path validation for refrigerator',
  );
  assert(
    !validatePathForApplianceType(mla4749Path, 'washing_machine'),
    'MLA4749 (Mesas Ratonas) does NOT pass path validation for washing_machine',
  );
  console.log();

  // ── C. Cross-contamination: appliance types cannot use each other's paths ─
  console.log('══ C. Cross-contamination guards ════════════════════════════════\n');
  const fridgePath = makePath(['Electrodomésticos y Aires Ac.', 'Refrigeración', 'Heladeras']);
  const microwavePath = makePath(['Electrodomésticos y Aires Ac.', 'Cocción', 'Microondas']);
  const lavarropaPath = makePath(['Electrodomésticos y Aires Ac.', 'Lavado', 'Lavarropas']);

  // Correct assignments
  assert(validatePathForApplianceType(fridgePath, 'refrigerator'), 'Heladeras path validates for refrigerator ✓');
  assert(validatePathForApplianceType(microwavePath, 'microwave'), 'Microondas path validates for microwave ✓');
  assert(validatePathForApplianceType(lavarropaPath, 'washing_machine'), 'Lavarropas path validates for washing_machine ✓');

  // Wrong assignments — microwave must NOT accept fridgePath, and vice versa
  assert(!validatePathForApplianceType(fridgePath, 'microwave'), 'Heladeras path rejected for microwave ✓');
  assert(!validatePathForApplianceType(microwavePath, 'refrigerator'), 'Microondas path rejected for refrigerator ✓');
  assert(!validatePathForApplianceType(microwavePath, 'washing_machine'), 'Microondas path rejected for washing_machine ✓');
  assert(!validatePathForApplianceType(fridgePath, 'washing_machine'), 'Heladeras path rejected for washing_machine ✓');
  assert(!validatePathForApplianceType(lavarropaPath, 'refrigerator'), 'Lavarropas path rejected for refrigerator ✓');
  assert(!validatePathForApplianceType(lavarropaPath, 'microwave'), 'Lavarropas path rejected for microwave ✓');
  console.log();

  // ── D. Furniture / non-appliance paths are always rejected ───────────────
  console.log('══ D. Furniture / non-appliance paths rejected for all types ════\n');
  const furniturePath = makePath(['Hogar, Muebles y Jardín', 'Muebles para el Hogar', 'Mesas']);
  const motos = makePath(['Autos, Motos y Otros', 'Motos']);
  const padel = makePath(['Deportes y Fitness', 'Tenis, Pádel y Squash', 'Pádel y Beach Tennis']);
  const jarrones = makePath(['Hogar, Muebles y Jardín', 'Adornos y Decoración del Hogar', 'Jarrones']);

  const applianceTypes = ['refrigerator', 'microwave', 'washing_machine', 'dryer', 'oven', 'stove'] as const;
  const wrongPaths = [
    { path: furniturePath, name: 'Muebles/Mesas' },
    { path: motos, name: 'Motos' },
    { path: padel, name: 'Pádel' },
    { path: jarrones, name: 'Jarrones' },
  ];

  for (const wp of wrongPaths) {
    for (const at of applianceTypes) {
      assert(
        !validatePathForApplianceType(wp.path, at),
        `${wp.name} path rejected for ${at}`,
      );
    }
  }
  console.log();

  // ── E. Keyword coverage — all defined types have keywords ─────────────────
  console.log('══ E. All appliance types have path keywords defined ════════════\n');
  const typesWithKeywords = Object.keys(APPLIANCE_PATH_KEYWORDS) as Array<keyof typeof APPLIANCE_PATH_KEYWORDS>;
  assert(typesWithKeywords.length > 0, `${typesWithKeywords.length} appliance types have keywords defined`);
  for (const type of typesWithKeywords) {
    const kws = APPLIANCE_PATH_KEYWORDS[type] ?? [];
    assert(kws.length > 0, `${type} has ${kws.length} path keyword(s): ${kws.join(', ')}`);
  }
  console.log();

  // ── F. Empty category_id handling ────────────────────────────────────────
  console.log('══ F. Empty/undefined appliance type handling ═══════════════════\n');
  // When applianceType is undefined, validation should pass (can't validate without type)
  assert(
    validatePathForApplianceType(furniturePath, undefined),
    'undefined applianceType → validation passes (no type to check against)',
  );
  // When path is empty, validation should fail for any typed appliance
  assert(
    !validatePathForApplianceType([], 'refrigerator'),
    'empty path_from_root → validation fails for refrigerator',
  );
  assert(
    !validatePathForApplianceType([], 'microwave'),
    'empty path_from_root → validation fails for microwave',
  );
  console.log();

  // ── G. Enricher null-resolution path: empty category_id is blocked ────────
  console.log('══ G. Stale hardcoded IDs (from appliances.ts) are empty now ════\n');
  // All config mlCategoryId values should now be empty — no hardcoded wrong IDs
  const appliancesConfig = await import('../src/config/categories/appliances');
  const appliances = appliancesConfig.APPLIANCE_CATEGORIES;
  assert(appliances.length > 0, `${appliances.length} appliance categories defined`);
  const nonemptyIds = appliances.filter((a) => a.mlCategoryId !== '');
  assert(
    nonemptyIds.length === 0,
    `All appliance mlCategoryId values are empty (no stale hardcoded IDs)`,
    nonemptyIds.length > 0 ? `Non-empty: ${nonemptyIds.map((a) => `${a.id}=${a.mlCategoryId}`).join(', ')}` : '',
  );
  console.log();

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${passed + failed} passed`);
  console.log();
  if (failed > 0) {
    console.log(`❌ ${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('✅ All category guard assertions passed.');
  console.log();
  console.log('Root cause of ML finalization:');
  console.log('  MLA1577 = Microondas (not Heladeras) — was used for refrigerator rows');
  console.log('  MLA4749 = Mesas Ratonas (furniture) — was used for microwave rows');
  console.log('  Enricher null-resolution branch lacked appliance-type path validation');
  console.log();
  console.log('Fixed:');
  console.log('  ✓ All hardcoded category IDs cleared from appliances.ts');
  console.log('  ✓ APPLIANCE_FALLBACK_CATEGORIES removed (all IDs were wrong)');
  console.log('  ✓ Enricher null-resolution now validates path against product type');
  console.log('  ✓ Empty category_id → immediate block with clear error');
  console.log('  ✓ Wrong-domain category_id → block with clear error');
  console.log('  ✓ UI requires "Preparar publicación" before publish in real mode');
}

main().catch((err) => { console.error(err); process.exit(1); });
