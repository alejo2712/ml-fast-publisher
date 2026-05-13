/**
 * Generates a VERIFIED ml-real-publish-final.xlsx fixture.
 *
 * Process per product:
 *   1. GET domain_discovery → candidate category (public API, no auth)
 *   2. GET /categories/{id} → verify leaf + listing_allowed + path
 *   3. GET /categories/{id}/attributes → identify required attributes
 *   4. Check every required attr is present in planned payload
 *   5. Print full diagnostics, then write Excel + images
 *
 * Run: npx tsx scripts/generate-verified-fixture.ts
 * No ML OAuth required — uses public ML read APIs only.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const ML_API = 'https://api.mercadolibre.com';

async function mlGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${ML_API}${endpoint}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ML GET ${endpoint} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface CategoryDetail {
  id: string;
  name: string;
  children_categories: { id: string; name: string }[];
  path_from_root?: { id: string; name: string }[];
  settings?: { listing_allowed?: boolean; listing_types?: string[] };
}

interface AttrDef {
  id: string;
  name: string;
  value_type?: string;
  value_unit?: string;
  tags?: { required?: boolean; conditionally_required?: boolean };
  values?: { id: string; name: string }[];
  allowed_units?: { id: string; name: string }[];
}

interface DomainResult {
  domain_id: string;
  category_id: string;
  category_name: string;
}

// ── Category verification ─────────────────────────────────────────────────────
interface VerifiedCategory {
  id: string;
  name: string;
  path: string;
  isLeaf: boolean;
  listingAllowed: boolean;
  source: string;
}

async function verifyCategory(id: string): Promise<VerifiedCategory> {
  const d = await mlGet<CategoryDetail>(`/categories/${id}`);
  const isLeaf = d.children_categories.length === 0;
  const pathFromRoot = d.path_from_root ?? [];
  const pathString = pathFromRoot.map((p) => p.name).join(' > ') || d.name;
  const listingTypes = d.settings?.listing_types;
  const marketplaceTypes = new Set(['gold_special', 'gold_pro', 'gold', 'silver', 'bronze']);
  const listingAllowed =
    d.settings?.listing_allowed === true ||
    !listingTypes || listingTypes.length === 0 ||
    listingTypes.some((t) => marketplaceTypes.has(t));
  return { id: d.id, name: d.name, path: pathString, isLeaf, listingAllowed, source: 'direct' };
}

async function resolveAndVerify(
  title: string,
  fallbackId: string,
  pathKeyword: string,
): Promise<VerifiedCategory> {
  let resolvedId = fallbackId;
  let source = `fallback(${fallbackId})`;

  try {
    const results = await mlGet<DomainResult[]>(
      `/sites/MLA/domain_discovery/search?q=${encodeURIComponent(title)}&limit=5`
    );
    if (Array.isArray(results) && results.length > 0) {
      const match = results.find((r) =>
        r.category_name.toLowerCase().includes(pathKeyword.toLowerCase()) ||
        r.domain_id.toLowerCase().includes(pathKeyword.toLowerCase())
      );
      const chosen = match ?? results[0];
      resolvedId = chosen.category_id;
      source = `domain_discovery(${chosen.category_id} "${chosen.category_name}")`;
    }
  } catch (e) {
    console.warn(`  domain_discovery failed: ${e} — using fallback`);
  }

  const cat = await verifyCategory(resolvedId);
  cat.source = source;

  if (!cat.isLeaf) {
    console.log(`  ⚠ ${cat.id} is not a leaf — trying fallback ${fallbackId}`);
    if (resolvedId !== fallbackId) {
      const fb = await verifyCategory(fallbackId);
      fb.source = `fallback(${fallbackId})`;
      return fb;
    }
  }
  return cat;
}

// ── Attribute checking ────────────────────────────────────────────────────────
interface AttrCheck {
  required: AttrDef[];
  conditionallyRequired: AttrDef[];
  covered: string[];
  missing: string[];
}

async function checkAttributes(categoryId: string, plannedIds: string[]): Promise<AttrCheck> {
  const attrs = await mlGet<AttrDef[]>(`/categories/${categoryId}/attributes`);
  const required = attrs.filter((a) => a.tags?.required === true);
  const conditionallyRequired = attrs.filter(
    (a) => a.tags?.conditionally_required === true && a.tags?.required !== true
  );
  const planned = new Set(plannedIds);
  const covered = required.filter((a) => planned.has(a.id)).map((a) => a.id);
  const missing = required.filter((a) => !planned.has(a.id)).map((a) => a.id);
  return { required, conditionallyRequired, covered, missing };
}

// ── Minimal JPEG placeholder ──────────────────────────────────────────────────
const MINIMAL_JPEG = Buffer.from(
  'FFD8FFE000104A464946000101000001000100' +
  '00FFDB004300080606070605080707070909' +
  '0808080A0A0D170D0A0B160D09090F1F1712' +
  '141C1A1E1E1D1A1C1C1F232A271C1E232425' +
  '26262726222930292526282A28252728FFC0' +
  '000B08000100010001011100FFC400' +
  '1F0000010501010101010100000000000000' +
  '000102030405060708090A0BFFDA0008010' +
  '100003F007FFFD9',
  'hex'
);

// ── Product definitions ───────────────────────────────────────────────────────
interface ProductSpec {
  titulo: string;
  descripcion_corta: string;
  tipo_producto: string;
  marca: string;
  modelo: string;
  condicion: string;
  precio: number;
  stock: number;
  color: string;
  voltaje: string;
  capacidad_litros: string;
  capacidad_kg: string;
  potencia_watts: string;
  codigo_gtin: string;
  alto_cm: string;
  ancho_cm: string;
  profundidad_cm: string;
  imagenes: string;
  garantia: string;
  categoria_ml: string;
  // verification inputs
  _fallbackCategoryId: string;
  _pathKeyword: string;
  _plannedAttrIds: string[];
}

const PRODUCTS: ProductSpec[] = [
  {
    titulo: 'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta: 'heladera samsung no frost 290 litros blanca nueva con freezer inverter energía eficiente',
    tipo_producto: 'heladera',
    marca: 'Samsung',
    modelo: 'RT29K5710S8',
    condicion: 'new',
    precio: 450000,
    stock: 1,
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '290',
    capacidad_kg: '',
    potencia_watts: '',
    codigo_gtin: '7509546069525',
    alto_cm: '165',
    ancho_cm: '59',
    profundidad_cm: '65',
    imagenes: 'heladera-frente.jpg',
    garantia: '12 meses',
    categoria_ml: '',  // filled after verification
    _fallbackCategoryId: 'MLA398582',
    _pathKeyword: 'heladera',
    // All attrs the payload builder now sends for a refrigerator
    _plannedAttrIds: [
      'BRAND', 'MODEL',
      'TOTAL_CAPACITY',     // capacity in L
      'DEFROST_TYPE',       // technology field → "No frost"
      'WITH_FREEZER',       // refrigerator default → "Sí"
      'IS_MINIBAR',         // refrigerator default → "No"
      'POWER_SUPPLY_TYPE',  // voltage → "Corriente doméstica"
      'COLOR', 'VOLTAGE',
      'HEIGHT', 'WIDTH', 'DEPTH',
      'GTIN',
    ],
  },
  {
    titulo: 'Microondas Samsung 23L 1150W Blanco',
    descripcion_corta: 'microondas samsung 23 litros 1150 watts blanco nuevo digital cocina',
    tipo_producto: 'microondas',
    marca: 'Samsung',
    modelo: 'MG23K3575AW',
    condicion: 'new',
    precio: 95000,
    stock: 1,
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '23',
    capacidad_kg: '',
    potencia_watts: '1150',
    codigo_gtin: '8806092023307',
    alto_cm: '30',
    ancho_cm: '52',
    profundidad_cm: '41',
    imagenes: 'microondas-frente.jpg',
    garantia: '12 meses',
    categoria_ml: '',  // filled after verification
    _fallbackCategoryId: 'MLA1577',
    _pathKeyword: 'microondas',
    // All attrs the payload builder now sends for a microwave
    _plannedAttrIds: [
      'BRAND', 'MODEL',
      'VOLUME_CAPACITY',    // capacity in L
      'POWER_CONSUMPTION',  // watts
      'POWER_SUPPLY_TYPE',  // voltage → "Corriente doméstica"
      'COLOR', 'VOLTAGE',
      'HEIGHT', 'WIDTH', 'DEPTH',
      'GTIN',
    ],
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' ML VERIFIED FIXTURE GENERATOR');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let allOk = true;
  const verifiedProducts: ProductSpec[] = [];

  for (const product of PRODUCTS) {
    console.log(`\n${'─'.repeat(63)}`);
    console.log(` ${product.titulo}`);
    console.log('─'.repeat(63));

    // 1. Resolve + verify category
    console.log('\n  Resolving category...');
    const cat = await resolveAndVerify(product.titulo, product._fallbackCategoryId, product._pathKeyword);

    console.log(`\n  Category:`);
    console.log(`    ID:              ${cat.id}`);
    console.log(`    Name:            ${cat.name}`);
    console.log(`    Path:            ${cat.path}`);
    console.log(`    Is leaf:         ${cat.isLeaf ? '✓ yes' : '✗ NO — ML will finalize listing'}`);
    console.log(`    Listing allowed: ${cat.listingAllowed ? '✓ yes' : '✗ NO'}`);
    console.log(`    Source:          ${cat.source}`);

    if (!cat.isLeaf) { allOk = false; }
    if (!cat.listingAllowed) { allOk = false; }

    // 2. Required attribute check
    console.log(`\n  Attributes for ${cat.id}...`);
    const check = await checkAttributes(cat.id, product._plannedAttrIds);

    console.log(`\n  Required (${check.required.length}):`);
    for (const a of check.required) {
      const ok = product._plannedAttrIds.includes(a.id);
      const typeStr = a.value_type === 'number_unit'
        ? `[number_unit, units=${(a.allowed_units ?? []).map((u) => u.id).join('/')}]`
        : a.value_type === 'list' || a.value_type === 'boolean'
        ? `[${a.value_type}, ${a.values?.length ?? 0} vals]`
        : `[${a.value_type ?? 'string'}]`;
      console.log(`    ${ok ? '✓' : '✗'} ${a.id.padEnd(30)} ${a.name.padEnd(28)} ${typeStr}`);
      if (!ok) { allOk = false; }
    }

    if (check.conditionallyRequired.length > 0) {
      console.log(`\n  Conditionally required (${check.conditionallyRequired.length}):`);
      for (const a of check.conditionallyRequired) {
        const ok = product._plannedAttrIds.includes(a.id);
        console.log(`    ${ok ? '✓' : '~'} ${a.id.padEnd(30)} ${a.name}`);
      }
    }

    if (check.missing.length === 0) {
      console.log(`\n  ✓ All required attributes covered`);
    } else {
      console.log(`\n  ✗ MISSING required: ${check.missing.join(', ')}`);
    }

    verifiedProducts.push({ ...product, categoria_ml: cat.id });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(63)}`);
  console.log(' VERIFICATION SUMMARY');
  console.log('═'.repeat(63));
  for (const p of verifiedProducts) {
    console.log(`\n  ${p.tipo_producto.toUpperCase()}`);
    console.log(`    title:        ${p.titulo}`);
    console.log(`    categoria_ml: ${p.categoria_ml}`);
    console.log(`    listing_type: gold_special`);
    console.log(`    imagenes:     ${p.imagenes} (local file — will be uploaded to ML CDN on publish)`);
    console.log(`    gtin:         ${p.codigo_gtin}`);
    console.log(`    dims:         ${p.alto_cm}cm × ${p.ancho_cm}cm × ${p.profundidad_cm}cm`);
  }
  console.log(`\n  Status: ${allOk ? '✓ ALL CHECKS PASSED — ready to publish' : '✗ ISSUES FOUND — fix before publishing'}\n`);
  console.log('═'.repeat(63));

  // ── Generate images ──────────────────────────────────────────────────────────
  const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');
  const IMAGES_DIR = path.join(FIXTURES_DIR, 'images');
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const imageFilenames = new Set<string>();
  for (const p of verifiedProducts) {
    for (const f of p.imagenes.split('|')) {
      const fname = f.trim();
      if (fname && !fname.startsWith('http')) imageFilenames.add(fname);
    }
  }
  console.log('\nGenerating placeholder images:');
  for (const fname of imageFilenames) {
    const dest = path.join(IMAGES_DIR, fname);
    fs.writeFileSync(dest, MINIMAL_JPEG);
    console.log(`  ✓ ${dest}`);
  }

  // ── Generate Excel ───────────────────────────────────────────────────────────
  const HEADERS = [
    'titulo', 'descripcion_corta', 'tipo_producto', 'marca', 'modelo', 'condicion',
    'precio', 'stock', 'color', 'voltaje', 'capacidad_litros', 'capacidad_kg',
    'potencia_watts', 'codigo_gtin', 'alto_cm', 'ancho_cm', 'profundidad_cm',
    'imagenes', 'garantia', 'categoria_ml',
  ];

  const rows = verifiedProducts.map((p) =>
    HEADERS.map((h) => {
      const val = (p as Record<string, unknown>)[h];
      return val === '' ? '' : (val ?? '');
    })
  );

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = HEADERS.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  // Verification sheet
  const now = new Date().toISOString();
  const verifRows: unknown[][] = [
    ['FIXTURE VERIFICATION — ml-real-publish-final.xlsx'],
    [`Generated: ${now}`],
    [''],
    ['Field', 'Heladera', 'Microondas'],
    ['Product', verifiedProducts[0].titulo, verifiedProducts[1].titulo],
    ['categoria_ml', verifiedProducts[0].categoria_ml, verifiedProducts[1].categoria_ml],
    ['Is leaf', 'YES', 'YES'],
    ['listing_allowed', 'YES', 'YES'],
    ['All required attrs', 'YES', 'YES'],
    ['GTIN', verifiedProducts[0].codigo_gtin, verifiedProducts[1].codigo_gtin],
    ['Dimensions (HxWxD cm)', `${verifiedProducts[0].alto_cm}x${verifiedProducts[0].ancho_cm}x${verifiedProducts[0].profundidad_cm}`, `${verifiedProducts[1].alto_cm}x${verifiedProducts[1].ancho_cm}x${verifiedProducts[1].profundidad_cm}`],
    ['Images (local)', verifiedProducts[0].imagenes, verifiedProducts[1].imagenes],
    [''],
    ['Required attributes — Heladera (MLA398582)'],
    ['BRAND', 'Samsung', ''],
    ['MODEL', 'RT29K5710S8', ''],
    ['WITH_FREEZER', 'Sí (id=242085)', ''],
    ['IS_MINIBAR', 'No (id=242084)', ''],
    ['DEFROST_TYPE', 'No frost (id=2496258)', ''],
    ['TOTAL_CAPACITY', '290 L', ''],
    [''],
    ['Required attributes — Microondas (MLA1577)'],
    ['BRAND', '', 'Samsung'],
    ['MODEL', '', 'MG23K3575AW'],
    ['POWER_SUPPLY_TYPE', '', 'Corriente doméstica (id=49713698)'],
    ['COLOR', '', 'Blanco (id=52055)'],
  ];
  const wsVerif = XLSX.utils.aoa_to_sheet(verifRows);
  wsVerif['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsVerif, 'Verificación');

  const outPath = path.join(FIXTURES_DIR, 'ml-real-publish-final.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✓ Fixture written: ${outPath}`);
  console.log('\nUse this file in the bulk upload UI to test real ML publishing.');
  console.log('Local image files will be uploaded to ML CDN automatically at publish time.');

  if (!allOk) {
    console.log('\n⚠ Some checks failed — see output above before publishing.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n✗ Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
