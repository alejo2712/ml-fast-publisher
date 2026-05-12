/**
 * Generates tests/fixtures/ml-real-publish-v2.xlsx
 *
 * Improvements over v1:
 * - Image URLs verified HTTP 200 at generation time
 * - Includes all conditional-required attributes ML commonly requests:
 *     Refrigerator: ENERGY_EFFICIENCY_CLASS, DEFROST_SYSTEM
 *     Microwave:    PANEL_TYPE, MICROWAVE_TYPE
 * - Explicit categoria_ml left empty (auto-resolution via domain_discovery)
 * - fabricante, tipo_alimentacion, requiere_armado included
 *
 * Run: npx tsx scripts/generate-real-publish-v2.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

// ── Headers (must match CSV_COLUMNS in src/lib/csv/template.ts exactly) ───────

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

async function verifyUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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

async function pickFirstWorking(label: string, candidates: string[]): Promise<string> {
  console.log(`\n  ${label}:`);
  for (const url of candidates) {
    const { ok, status } = await verifyUrl(url);
    console.log(`    ${ok ? '✅' : '❌'} [${status}] ${url}`);
    if (ok) return url;
  }
  throw new Error(`No working URL found for: ${label}`);
}

// ── Image candidate pools (Wikimedia Commons — verified stable) ───────────────

const FRIDGE_CANDIDATES_1 = [
  'https://upload.wikimedia.org/wikipedia/commons/8/89/Refrigerator.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg',
];
const FRIDGE_CANDIDATES_2 = [
  'https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/0/08/Refrigerator_and_microwave.jpg',
];
const MICROWAVE_CANDIDATES_1 = [
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg',
];
const MICROWAVE_CANDIDATES_2 = [
  'https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg',
];

// ── Product builders ──────────────────────────────────────────────────────────

type Row = Record<string, string>;

function buildFridge(img1: string, img2: string): Row {
  return {
    titulo:             'Heladera Samsung No Frost 290L Blanca',
    // "no frost" is the defrost system; "eficiencia A" hints at energy class
    descripcion_corta:  'Heladera Samsung no frost 290 litros blanca nueva 220V eficiencia A garantia 12 meses modelo RT29FARADWW',
    tipo_producto:      'heladera',
    marca:              'Samsung',
    modelo:             'RT29FARADWW',
    condicion:          'nuevo',
    precio:             '450000',
    stock:              '1',
    sku:                'SAM-RT29FARADWW-V2',
    color:              'Blanco',
    voltaje:            '220V',
    capacidad_litros:   '290',
    capacidad_kg:       '',
    potencia_watts:     '',
    // tecnologia maps to COOLING_TYPE / DEFROST_SYSTEM
    tecnologia:         'No Frost',
    garantia:           '12 meses',
    envio:              'not_specified',
    retiro_en_persona:  'si',
    envio_gratis:       'no',
    imagenes:           `${img1}|${img2}`,
    descripcion_larga:  [
      'Heladera Samsung No Frost RT29FARADWW de 290 litros.',
      'Sistema No Frost: elimina la escarcha automaticamente.',
      'Eficiencia energetica clase A.',
      'Capacidad total: 290 litros (210L refrigerador + 80L freezer).',
      'Panel de control en la puerta. Alarma de puerta abierta.',
      'Iluminacion LED interior. Estantes de vidrio templado.',
      'Garantia oficial Samsung 12 meses.',
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
    titulo:             'Microondas Samsung 23L 1150W Panel Digital Blanco',
    // "panel digital" and "de cocina" map to PANEL_TYPE + MICROWAVE_TYPE
    descripcion_corta:  'Microondas Samsung 23 litros 1150 watts panel digital blanco nuevo 220V modelo MS23K3513AW garantia 12 meses',
    tipo_producto:      'microondas',
    marca:              'Samsung',
    modelo:             'MS23K3513AW',
    condicion:          'nuevo',
    precio:             '115000',
    stock:              '1',
    sku:                'SAM-MS23K3513AW-V2',
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
      'Panel de control digital.',
      'Tipo de microondas: de cocina, uso doméstico.',
      '5 niveles de potencia ajustables.',
      'Descongelado automatico por peso.',
      'Plato giratorio de vidrio de 28.8 cm.',
      'Garantia oficial Samsung 12 meses.',
    ].join(' '),
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    categoria_ml:          '',
  };
}

// ── Instructions sheet ────────────────────────────────────────────────────────

function buildInstructions(
  fridgeImg1: string, fridgeImg2: string,
  microwaveImg1: string, microwaveImg2: string
): string[][] {
  return [
    ['ARCHIVO DE TEST v2 — PUBLICACION REAL EN MERCADO LIBRE'],
    ['Generado por FastPublisher — scripts/generate-real-publish-v2.ts'],
    [`Generado: ${new Date().toISOString()}`],
    [''],
    ['MEJORAS SOBRE v1'],
    ['- Atributos condicionales incluidos: tecnologia=No Frost → DEFROST_SYSTEM'],
    ['- Titulo de microondas menciona "Panel Digital" → PANEL_TYPE=Digital'],
    ['- descripcion_larga menciona tipo de microondas → MICROWAVE_TYPE'],
    ['- Imagenes verificadas HTTP 200 al momento de generar'],
    [''],
    ['IMAGENES VERIFICADAS (HTTP 200)'],
    ['Heladera img1',   fridgeImg1],
    ['Heladera img2',   fridgeImg2],
    ['Microondas img1', microwaveImg1],
    ['Microondas img2', microwaveImg2],
    [''],
    ['ATRIBUTOS QUE APLICA EL ENRIQUECEDOR AUTOMATICAMENTE'],
    ['ENERGY_EFFICIENCY_CLASS', 'Default: "A" — si ML lo acepta para la categoria resuelta'],
    ['DEFROST_SYSTEM',          'Default: "No Frost" — derivado de tecnologia=No Frost'],
    ['PANEL_TYPE',              'Default: "Digital" — derivado del titulo del microondas'],
    ['MICROWAVE_TYPE',          'Default: "De cocina" — primer valor aceptado por la categoria'],
    ['TOTAL_CAPACITY',          'Derivado de CAPACITY si ML lo requiere'],
    ['POWER',                   'Derivado de POWER_CONSUMPTION si ML lo requiere'],
    [''],
    ['CATEGORIA ML (categoria_ml)'],
    ['La columna esta vacia — el sistema resuelve via domain_discovery API.'],
    ['Si la resolucion falla: ingresa el ID exacto de ML (ej: MLA1577) en la columna.'],
    [''],
    ['ENVIO'],
    ['Ambos productos usan not_specified — evita errores de me2.'],
    [''],
    ['QUE HACER SI SIGUE FALLANDO'],
    ['1. Abrir la fila fallida en BulkResults → ver "Causas del error (ML)"'],
    ['2. El codigo del error indica que atributo ML rechaza'],
    ['3. Ver "Atributos ML faltantes" para saber que agregar'],
    ['4. Agregar categoria_ml exacta si la resolucion automatica falla'],
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Image URL verification ───────────────────────────────────────');

  const fridgeImg1    = await pickFirstWorking('Heladera img1',    FRIDGE_CANDIDATES_1);
  const fridge2Pool   = FRIDGE_CANDIDATES_2.filter((u) => u !== fridgeImg1);
  const fridgeImg2    = await pickFirstWorking('Heladera img2',    fridge2Pool);
  const microwaveImg1 = await pickFirstWorking('Microondas img1',  MICROWAVE_CANDIDATES_1);
  const micro2Pool    = MICROWAVE_CANDIDATES_2.filter((u) => u !== microwaveImg1);
  const microwaveImg2 = await pickFirstWorking('Microondas img2',  micro2Pool);

  console.log('\n── Selected image URLs ──────────────────────────────────────────');
  console.log(`  Heladera   img1: ${fridgeImg1}`);
  console.log(`  Heladera   img2: ${fridgeImg2}`);
  console.log(`  Microondas img1: ${microwaveImg1}`);
  console.log(`  Microondas img2: ${microwaveImg2}`);

  // Build rows
  const fridge    = buildFridge(fridgeImg1, fridgeImg2);
  const microwave = buildMicrowave(microwaveImg1, microwaveImg2);
  const buildRow  = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const dataRows  = [fridge, microwave].map(buildRow);

  // Products sheet
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 22) }));

  // Instructions sheet
  const instrData = buildInstructions(fridgeImg1, fridgeImg2, microwaveImg1, microwaveImg2);
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 26 }, { wch: 100 }];

  // Write file
  const outDir  = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-v2.xlsx');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Generated: ${outPath}`);

  // ── Parse + validate ────────────────────────────────────────────────────────

  console.log('\n── Parser validation ────────────────────────────────────────────');

  const buf = fs.readFileSync(outPath);
  const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const csv = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);

  console.log(`Rows parsed: ${result.rows.length}`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    console.log(`\nRow ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${row.draft?.title ?? '(no title)'}`);
    if (row.draft) {
      console.log(`  applianceType    : ${row.draft.applianceType}`);
      console.log(`  mlCategoryId     : ${row.draft.mlCategoryId}  (overridden at publish by resolver)`);
      console.log(`  price            : ${row.draft.price} ${row.draft.currency}`);
      console.log(`  condition        : ${row.draft.condition}`);
      console.log(`  images           : ${row.draft.images.length} url(s)`);
      console.log(`  shipping.mode    : ${row.draft.shipping.mode}`);
      console.log(`  manufacturer     : ${row.draft.manufacturer ?? '—'}`);
      console.log(`  powerSupplyType  : ${row.draft.powerSupplyType ?? '—'}`);
      if (row.draft.requiresAssembly !== undefined)
        console.log(`  requiresAssembly : ${row.draft.requiresAssembly}`);
      // Check attributes that will be sent
      const attrs = row.payload?.attributes ?? [];
      console.log(`  attributes (${attrs.length}): ${attrs.map((a) => a.id).join(', ')}`);
    }
    if (row.missingFields.length > 0)
      console.log(`  missing fields   : ${row.missingFields.map((f) => f.id).join(', ')}`);
    if (row.errors.length > 0)
      console.log(`  errors           : ${row.errors.join('; ')}`);
  }

  // ── Image format check ────────────────────────────────────────────────────

  console.log('\n── Image URL format check ───────────────────────────────────────');
  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  for (const img of allImages) {
    console.log(`  ${img.startsWith('https://') ? '✅' : '❌'} ${img}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`  ✅ ok rows      : ${result.totalOk}`);
  console.log(`  ⚠️  warning rows : ${result.totalWarnings}`);
  console.log(`  ❌ error rows   : ${result.totalErrors}`);
  if (result.totalErrors > 0) { console.error('\n❌ Errors found — fix before uploading'); process.exit(1); }

  console.log('\n── Expected enrichment at publish time ──────────────────────────');
  console.log('  Heladera   → ENERGY_EFFICIENCY_CLASS=A, DEFROST_SYSTEM=No Frost (defaults)');
  console.log('  Microondas → PANEL_TYPE=Digital, MICROWAVE_TYPE=De cocina (defaults)');
  console.log('  All        → MANUFACTURER, POWER_SUPPLY_TYPE, REQUIRES_ASSEMBLY from columns');

  console.log('\n── Next steps ───────────────────────────────────────────────────');
  console.log('  1. Upload ml-real-publish-v2.xlsx in FastPublisher bulk mode');
  console.log('  2. Click "Publicar en Mercado Libre"');
  console.log('  3. Expand each row → check "Atributos ML faltantes" section');
  console.log('  4. On failure → read "Causas del error" for exact ML attribute IDs\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
