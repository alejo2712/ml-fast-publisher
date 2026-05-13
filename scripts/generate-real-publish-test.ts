/**
 * Generates tests/fixtures/ml-real-publish-test.xlsx
 * 2 products optimised for real ML publishing (1 refrigerator + 1 microwave).
 *
 * Image URLs are verified via HTTP HEAD before being written to the fixture.
 * Any URL returning non-200 is replaced with a known-good fallback.
 *
 * Run: npx tsx scripts/generate-real-publish-test.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

// ── Column headers (must exactly match CSV_COLUMNS in src/lib/csv/template.ts) ─

const HEADERS = [
  'titulo',
  'descripcion_corta',
  'tipo_producto',
  'marca',
  'modelo',
  'condicion',
  'precio',
  'stock',
  'sku',
  'color',
  'voltaje',
  'capacidad_litros',
  'capacidad_kg',
  'potencia_watts',
  'tecnologia',
  'garantia',
  'envio',
  'retiro_en_persona',
  'envio_gratis',
  'imagenes',
  'descripcion_larga',
  'codigo_gtin',
  'fabricante',
  'tipo_alimentacion',
  'requiere_armado',
  'incluye_manual_armado',
  'categoria_ml',
];

// ── URL verification ──────────────────────────────────────────────────────────

/**
 * Verify a URL returns HTTP 200 (follows redirects, 5s timeout).
 * Uses HEAD to avoid downloading the full image body.
 */
async function verifyUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FastPublisher/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return { ok: res.status === 200, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Pick the first URL from `candidates` that returns HTTP 200.
 * Returns the verified URL and its index, or null if all fail.
 */
async function pickFirstWorking(
  candidates: string[]
): Promise<{ url: string; index: number } | null> {
  for (let i = 0; i < candidates.length; i++) {
    const { ok, status } = await verifyUrl(candidates[i]);
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} [${status}] ${candidates[i]}`);
    if (ok) return { url: candidates[i], index: i };
  }
  return null;
}

// ── Image candidate pools ─────────────────────────────────────────────────────
// Primary: Wikimedia Commons — stable, HTTPS, publicly accessible.
// Fallback: placehold.co (200 verified) — placeholder only, not real product photo.
//
// Verified 2026-05-12 (HTTP 200 confirmed):
//   https://upload.wikimedia.org/wikipedia/commons/8/89/Refrigerator.jpg
//   https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg
//   https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg
//   https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg

const FRIDGE_IMAGE_CANDIDATES = [
  'https://upload.wikimedia.org/wikipedia/commons/8/89/Refrigerator.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/0/08/Refrigerator_and_microwave.jpg',
  'https://placehold.co/800x600/f5f5f5/333333.jpg?text=Heladera',
];

const FRIDGE_IMAGE2_CANDIDATES = [
  'https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/0/08/Refrigerator_and_microwave.jpg',
  'https://placehold.co/800x600/e8e8e8/333333.jpg?text=Heladera+interior',
];

const MICROWAVE_IMAGE_CANDIDATES = [
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg',
  'https://placehold.co/800x600/f5f5f5/333333.jpg?text=Microondas',
];

const MICROWAVE_IMAGE2_CANDIDATES = [
  'https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg',
  'https://placehold.co/800x600/e8e8e8/333333.jpg?text=Microondas+interior',
];

// ── Product data ──────────────────────────────────────────────────────────────

type Row = Record<string, string>;

function buildFridge(img1: string, img2: string): Row {
  return {
    titulo:             'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta:  'Heladera Samsung no frost 290 litros blanca nueva 220V garantia 12 meses modelo RT29FARADWW',
    tipo_producto:      'heladera',
    marca:              'Samsung',
    modelo:             'RT29FARADWW',
    condicion:          'nuevo',
    precio:             '450000',
    stock:              '1',
    sku:                'SAM-RT29FARADWW',
    color:              'Blanco',
    voltaje:            '220V',
    capacidad_litros:   '290',
    capacidad_kg:       '',
    potencia_watts:     '',
    tecnologia:         'No Frost',
    garantia:           '12 meses',
    envio:              'not_specified',
    retiro_en_persona:  'si',
    envio_gratis:       'no',
    imagenes:           `${img1}|${img2}`,
    descripcion_larga:  [
      'Heladera Samsung No Frost RT29FARADWW de 290 litros.',
      'Tecnologia No Frost: elimina la escarcha automaticamente.',
      'Capacidad total: 290 litros (210L heladera + 80L freezer).',
      'Panel de control en la puerta. Alarma de puerta abierta.',
      'Iluminacion LED interior. Estantes de vidrio templado.',
      'Incluye garantia oficial Samsung de 12 meses.',
    ].join(' '),
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    categoria_ml:          '',
  };
}

function buildMicrowave(img1: string, img2: string): Row {
  return {
    titulo:             'Microondas Samsung 23L 1150W Blanco',
    descripcion_corta:  'Microondas Samsung 23 litros 1150 watts blanco nuevo 220V modelo MS23K3513AW garantia 12 meses',
    tipo_producto:      'microondas',
    marca:              'Samsung',
    modelo:             'MS23K3513AW',
    condicion:          'nuevo',
    precio:             '115000',
    stock:              '1',
    sku:                'SAM-MS23K3513AW',
    color:              'Blanco',
    voltaje:            '220V',
    capacidad_litros:   '23',
    capacidad_kg:       '',
    potencia_watts:     '1150',
    tecnologia:         '',
    garantia:           '12 meses',
    envio:              'not_specified',
    retiro_en_persona:  'si',
    envio_gratis:       'no',
    imagenes:           `${img1}|${img2}`,
    descripcion_larga:  [
      'Microondas Samsung MS23K3513AW de 23 litros y 1150 watts.',
      'Panel de control con perillas de tiempo y potencia.',
      '5 niveles de potencia ajustables.',
      'Funcion de descongelado automatico por peso.',
      'Plato giratorio de vidrio de 28.8 cm de diametro.',
      'Incluye garantia oficial Samsung de 12 meses.',
    ].join(' '),
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    categoria_ml:          '',
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: Verify image URLs ────────────────────────────────────────────────

  console.log('\n── Image URL verification ───────────────────────────────────────');

  console.log('\nHeladera — image 1 candidates:');
  const fridgeImg1Result = await pickFirstWorking(FRIDGE_IMAGE_CANDIDATES);
  if (!fridgeImg1Result) throw new Error('No working URL found for fridge image 1');
  const fridgeImg1 = fridgeImg1Result.url;

  // Avoid using the same URL twice for the same product
  const fridge2Candidates = FRIDGE_IMAGE2_CANDIDATES.filter((u) => u !== fridgeImg1);
  console.log('\nHeladera — image 2 candidates:');
  const fridgeImg2Result = await pickFirstWorking(fridge2Candidates);
  if (!fridgeImg2Result) throw new Error('No working URL found for fridge image 2');
  const fridgeImg2 = fridgeImg2Result.url;

  console.log('\nMicroondas — image 1 candidates:');
  const microwaveImg1Result = await pickFirstWorking(MICROWAVE_IMAGE_CANDIDATES);
  if (!microwaveImg1Result) throw new Error('No working URL found for microwave image 1');
  const microwaveImg1 = microwaveImg1Result.url;

  const microwave2Candidates = MICROWAVE_IMAGE2_CANDIDATES.filter((u) => u !== microwaveImg1);
  console.log('\nMicroondas — image 2 candidates:');
  const microwaveImg2Result = await pickFirstWorking(microwave2Candidates);
  if (!microwaveImg2Result) throw new Error('No working URL found for microwave image 2');
  const microwaveImg2 = microwaveImg2Result.url;

  console.log('\n── Selected image URLs ──────────────────────────────────────────');
  console.log(`  Heladera   img1: ${fridgeImg1}`);
  console.log(`  Heladera   img2: ${fridgeImg2}`);
  console.log(`  Microondas img1: ${microwaveImg1}`);
  console.log(`  Microondas img2: ${microwaveImg2}`);

  const allVerifiedUrls = [fridgeImg1, fridgeImg2, microwaveImg1, microwaveImg2];
  const hasPlaceholders = allVerifiedUrls.some((u) => u.includes('placehold.co'));
  if (hasPlaceholders) {
    console.log('\n⚠️  WARNING: some images are placeholders (placehold.co).');
    console.log('   These are valid HTTPS images but are not real product photos.');
    console.log('   ML may accept them for test listings but they should be replaced for production.');
  } else {
    console.log('\n✅ All images are real product photos from Wikimedia Commons.');
  }

  // ── Step 2: Build instructions sheet content ──────────────────────────────────

  const instrRows: string[][] = [
    ['ARCHIVO DE TEST — PUBLICACION REAL EN MERCADO LIBRE'],
    ['Generado por FastPublisher — scripts/generate-real-publish-test.ts'],
    [`Generado: ${new Date().toISOString()}`],
    [''],
    ['IMPORTANTE — LEER ANTES DE USAR'],
    [''],
    ['1. Este archivo esta disenado para pruebas de publicacion REAL en Mercado Libre.'],
    ['2. Usar UNICAMENTE con MERCADOLIBRE_DRY_RUN=false (publicacion real activada).'],
    ['3. Las imagenes fueron verificadas HTTP 200 al momento de generar este archivo.'],
    [''],
    ['PRODUCTOS INCLUIDOS'],
    ['Fila', 'Producto',                              'Marca',   'Categoria esperada',   'Precio ARS'],
    ['2',    'Heladera Samsung No Frost 290L Blanca', 'Samsung', 'MLA-REFRIGERATORS',    '450.000'],
    ['3',    'Microondas Samsung 23L 1150W Blanco',   'Samsung', 'MLA-MICROWAVES',       '115.000'],
    [''],
    ['IMAGENES VERIFICADAS (HTTP 200 al generar)'],
    ['Heladera img1',   fridgeImg1],
    ['Heladera img2',   fridgeImg2],
    ['Microondas img1', microwaveImg1],
    ['Microondas img2', microwaveImg2],
    [''],
    ['ENVIO'],
    ['Ambos productos usan envio=not_specified (mas seguro — evita errores de me2).'],
    ['Si el vendedor tiene me2 habilitado, cambiar a me2 en la columna "envio".'],
    [''],
    ['CATEGORIA ML (categoria_ml)'],
    ['La columna "categoria_ml" esta vacia. El sistema la resuelve automaticamente.'],
    ['Si la resolucion automatica falla, ingresar el ID exacto de ML (ej: MLA1577).'],
    ['Recordar: ML requiere categoria HOJA (sin hijos).'],
    [''],
    ['ATRIBUTOS INCLUIDOS'],
    ['fabricante',        'Samsung Electronics Argentina S.A. → MANUFACTURER en ML'],
    ['tipo_alimentacion', '220V → POWER_SUPPLY_TYPE en ML'],
    ['requiere_armado',   'no → REQUIRES_ASSEMBLY en ML'],
    [''],
    ['QUE HACER SI FALLA'],
    ['1. Revisar mlResponse en PublishHistory (panel Historial).'],
    ['2. Causas comunes: imagenes no accesibles, categoria incorrecta, atributo faltante.'],
    ['3. Ver docs/mercadolibre-real-publish-errors.md para referencia de errores.'],
    ['4. Si la categoria falla: agregar ID exacto en columna "categoria_ml".'],
  ];

  // ── Step 3: Build and write the XLSX file ─────────────────────────────────────

  const fridge = buildFridge(fridgeImg1, fridgeImg2);
  const microwave = buildMicrowave(microwaveImg1, microwaveImg2);

  const buildRow = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const dataRows = [fridge, microwave].map(buildRow);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 24 }, { wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-test.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Generated: ${outPath}`);
  console.log(`   Products: 2 (1 heladera + 1 microondas)`);

  // ── Step 4: Parse + validate ──────────────────────────────────────────────────

  console.log('\n── Parser validation ────────────────────────────────────────────');

  const fileBuffer = fs.readFileSync(outPath);
  const ab = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  const csvText = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csvText);

  console.log(`Total rows parsed: ${result.rows.length}`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    const title = row.draft?.title ?? row.errors[0] ?? '(no title)';
    console.log(`\nRow ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${title}`);

    if (row.draft) {
      console.log(`  applianceType      : ${row.draft.applianceType}`);
      console.log(`  mlCategoryId       : ${row.draft.mlCategoryId}  (static — overridden by resolver at publish)`);
      console.log(`  price              : ${row.draft.price} ${row.draft.currency}`);
      console.log(`  condition          : ${row.draft.condition}`);
      console.log(`  images             : ${row.draft.images.length} url(s)`);
      console.log(`  shipping.mode      : ${row.draft.shipping.mode}`);
      if (row.draft.manufacturer)
        console.log(`  manufacturer       : ${row.draft.manufacturer}`);
      if (row.draft.powerSupplyType)
        console.log(`  powerSupplyType    : ${row.draft.powerSupplyType}`);
      if (row.draft.requiresAssembly !== undefined)
        console.log(`  requiresAssembly   : ${row.draft.requiresAssembly}`);
      if (row.draft.officialCategoryId)
        console.log(`  officialCategoryId : ${row.draft.officialCategoryId}`);
    }

    if (row.missingFields.length > 0)
      console.log(`  missing fields     : ${row.missingFields.map((f) => f.id).join(', ')}`);
    if (row.errors.length > 0)
      console.log(`  errors             : ${row.errors.join('; ')}`);
  }

  // ── Step 5: Image format check ────────────────────────────────────────────────

  console.log('\n── Image URL format check ───────────────────────────────────────');
  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  for (const img of allImages) {
    const isHttps = img.startsWith('https://');
    console.log(`  ${isHttps ? '✅' : '❌'} ${img}`);
  }

  // ── Step 6: Summary ───────────────────────────────────────────────────────────

  console.log('\n── Parser summary ───────────────────────────────────────────────');
  console.log(`  ✅ ok rows      : ${result.totalOk}`);
  console.log(`  ⚠️  warning rows : ${result.totalWarnings}`);
  console.log(`  ❌ error rows   : ${result.totalErrors}`);

  const badImages = allImages.filter((img) => !img.startsWith('https://'));
  if (badImages.length > 0) {
    console.log(`\n❌ ${badImages.length} non-HTTPS image(s) — will block real ML publish`);
    badImages.forEach((img) => console.log(`   → ${img}`));
    process.exit(1);
  } else {
    console.log(`\n✅ All ${allImages.length} images are HTTPS — format OK for real ML publish`);
  }

  // ── Step 7: Expected category resolution ─────────────────────────────────────

  console.log('\n── Expected category resolution (via ML domain_discovery) ───────');
  console.log('  Heladera Samsung No Frost 290L Blanca  → MLA-REFRIGERATORS (leaf)');
  console.log('  Microondas Samsung 23L 1150W Blanco    → MLA-MICROWAVES (leaf)');
  console.log('  Note: actual IDs resolved at publish time via ML API');

  // ── Step 8: Next steps ────────────────────────────────────────────────────────

  console.log('\n── Next steps ───────────────────────────────────────────────────');
  console.log(`  1. MERCADOLIBRE_DRY_RUN must be "false" in Vercel env for real publish`);
  console.log(`  2. Upload ${path.basename(outPath)} in FastPublisher bulk mode`);
  console.log(`  3. Click "Publicar en Mercado Libre" — confirm the modal`);
  console.log(`  4. Check PublishHistory for ML response per item`);
  console.log(`  5. If category fails: add exact ML ID in "categoria_ml" column\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
