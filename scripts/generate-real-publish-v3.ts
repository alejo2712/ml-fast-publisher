/**
 * Generates tests/fixtures/ml-real-publish-v3.xlsx
 *
 * Changes from v2:
 * - alto_cm / ancho_cm / profundidad_cm added (HEIGHT / WIDTH / DEPTH in ML payload)
 * - These are ML-required attributes in several categories (fixes HEIGHT-blocked preflight)
 * - Realistic product dimensions for fridge + microwave
 * - Image URLs re-verified HTTP 200 at generation time
 *
 * Run: npx tsx scripts/generate-real-publish-v3.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

// ── Headers — must exactly match CSV_COLUMNS in src/lib/csv/template.ts ───────

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
  // NEW in v3
  'alto_cm',
  'ancho_cm',
  'profundidad_cm',
  'categoria_ml',
];

// ── URL verification ──────────────────────────────────────────────────────────

async function verifyUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FastPublisher/1.0)' },
      redirect: 'follow',
    });
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

// Verified stable Wikimedia Commons images
const FRIDGE_C1    = ['https://upload.wikimedia.org/wikipedia/commons/8/89/Refrigerator.jpg', 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg'];
const FRIDGE_C2    = ['https://upload.wikimedia.org/wikipedia/commons/b/b8/Fridge.jpg', 'https://upload.wikimedia.org/wikipedia/commons/0/08/Refrigerator_and_microwave.jpg'];
const MICROWAVE_C1 = ['https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg', 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg'];
const MICROWAVE_C2 = ['https://upload.wikimedia.org/wikipedia/commons/b/bb/Microwave_Oven.jpg', 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Microwave_oven.jpg'];

// ── Product builders ──────────────────────────────────────────────────────────

type Row = Record<string, string>;

function buildFridge(img1: string, img2: string): Row {
  // Samsung RT29FARADWW approximate dimensions: 180cm H × 55cm W × 63cm D
  return {
    titulo:             'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta:  'Heladera Samsung no frost 290 litros blanca nueva 220V eficiencia energetica A garantia 12 meses modelo RT29FARADWW',
    tipo_producto:      'heladera',
    marca:              'Samsung',
    modelo:             'RT29FARADWW',
    condicion:          'nuevo',
    precio:             '450000',
    stock:              '1',
    sku:                'SAM-RT29FARADWW-V3',
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
      'Heladera Samsung No Frost RT29FARADWW 290L.',
      'Sistema No Frost: sin escarcha.',
      'Eficiencia energetica clase A.',
      'Capacidad: 290L (210L frio + 80L freezer).',
      'Alto 180cm, ancho 55cm, profundidad 63cm.',
      'Garantia oficial Samsung 12 meses.',
    ].join(' '),
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    // Dimensions — Samsung RT29FARADWW spec sheet
    alto_cm:           '180',
    ancho_cm:          '55',
    profundidad_cm:    '63',
    categoria_ml:      '',
  };
}

function buildMicrowave(img1: string, img2: string): Row {
  // Samsung MS23K3513AW approximate dimensions: 28cm H × 47cm W × 36cm D
  return {
    titulo:             'Microondas Samsung 23L 1150W Panel Digital Blanco',
    descripcion_corta:  'Microondas Samsung 23 litros 1150 watts panel digital de cocina blanco nuevo 220V modelo MS23K3513AW garantia 12 meses',
    tipo_producto:      'microondas',
    marca:              'Samsung',
    modelo:             'MS23K3513AW',
    condicion:          'nuevo',
    precio:             '115000',
    stock:              '1',
    sku:                'SAM-MS23K3513AW-V3',
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
      'Microondas Samsung MS23K3513AW 23L 1150W.',
      'Panel digital. Tipo: de cocina.',
      '5 niveles de potencia.',
      'Descongelado automatico por peso.',
      'Alto 28cm, ancho 47cm, profundidad 36cm.',
      'Garantia oficial Samsung 12 meses.',
    ].join(' '),
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    // Dimensions — Samsung MS23K3513AW spec sheet
    alto_cm:           '28',
    ancho_cm:          '47',
    profundidad_cm:    '36',
    categoria_ml:      '',
  };
}

// ── Instructions sheet ────────────────────────────────────────────────────────

function buildInstructions(fi1: string, fi2: string, mi1: string, mi2: string): string[][] {
  return [
    ['ARCHIVO DE TEST v3 — PUBLICACION REAL EN MERCADO LIBRE'],
    ['Generado: ' + new Date().toISOString()],
    [''],
    ['MEJORAS SOBRE v2'],
    ['- alto_cm / ancho_cm / profundidad_cm ahora incluidos en ambos productos'],
    ['- Dimensiones reales de los modelos Samsung (spec sheet)'],
    ['- Estas columnas mapean a HEIGHT / WIDTH / DEPTH en ML'],
    [''],
    ['DIMENSIONES'],
    ['Heladera   (RT29FARADWW)', '180cm alto × 55cm ancho × 63cm prof'],
    ['Microondas (MS23K3513AW)', '28cm alto × 47cm ancho × 36cm prof'],
    [''],
    ['IMAGENES VERIFICADAS (HTTP 200)'],
    ['Heladera img1',   fi1],
    ['Heladera img2',   fi2],
    ['Microondas img1', mi1],
    ['Microondas img2', mi2],
    [''],
    ['ATRIBUTOS APLICADOS AUTOMATICAMENTE POR EL ENRIQUECEDOR'],
    ['ENERGY_EFFICIENCY_CLASS', '"A" — default para heladeras'],
    ['DEFROST_SYSTEM',          '"No Frost" — de tecnologia=No Frost'],
    ['PANEL_TYPE',              '"Digital" — del titulo del microondas'],
    ['MICROWAVE_TYPE',          '"De cocina" — del titulo del microondas'],
    ['HEIGHT / WIDTH / DEPTH',  'De las columnas alto_cm / ancho_cm / profundidad_cm'],
    [''],
    ['QUE HACER SI SIGUE FALLANDO'],
    ['1. Abrir la fila → "Error de Mercado Libre" → leer el mensaje completo'],
    ['2. Buscar "[ATTR_ID]" en el mensaje para ver que atributo falta'],
    ['3. Ver "Atributos ML faltantes" para la lista completa'],
    ['4. Si la categoria no resuelve: poner ID exacto en categoria_ml'],
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Image URL verification ───────────────────────────────────────');

  const fi1 = await pickFirstWorking('Heladera img1',    FRIDGE_C1);
  const fi2 = await pickFirstWorking('Heladera img2',    FRIDGE_C2.filter((u) => u !== fi1));
  const mi1 = await pickFirstWorking('Microondas img1',  MICROWAVE_C1);
  const mi2 = await pickFirstWorking('Microondas img2',  MICROWAVE_C2.filter((u) => u !== mi1));

  console.log('\n── Selected URLs ────────────────────────────────────────────────');
  console.log(`  fridge img1:    ${fi1}`);
  console.log(`  fridge img2:    ${fi2}`);
  console.log(`  microwave img1: ${mi1}`);
  console.log(`  microwave img2: ${mi2}`);

  const fridge    = buildFridge(fi1, fi2);
  const microwave = buildMicrowave(mi1, mi2);
  const buildRow  = (d: Row) => HEADERS.map((h) => d[h] ?? '');

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, buildRow(fridge), buildRow(microwave)]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  const wsInstr = XLSX.utils.aoa_to_sheet(buildInstructions(fi1, fi2, mi1, mi2));
  wsInstr['!cols'] = [{ wch: 28 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir  = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-v3.xlsx');
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
      console.log(`  applianceType   : ${row.draft.applianceType}`);
      console.log(`  price           : ${row.draft.price} ${row.draft.currency}`);
      console.log(`  condition       : ${row.draft.condition}`);
      console.log(`  images          : ${row.draft.images.length}`);
      console.log(`  shipping.mode   : ${row.draft.shipping.mode}`);
      console.log(`  manufacturer    : ${row.draft.manufacturer ?? '—'}`);
      console.log(`  powerSupplyType : ${row.draft.powerSupplyType ?? '—'}`);
      console.log(`  height/width/depth: ${row.draft.height ?? '?'} / ${row.draft.width ?? '?'} / ${row.draft.depth ?? '?'} cm`);
      const attrs = row.payload?.attributes ?? [];
      console.log(`  attributes (${attrs.length}): ${attrs.map((a) => a.id).join(', ')}`);
    }
    if (row.missingFields.length > 0)
      console.log(`  missing fields  : ${row.missingFields.map((f) => f.id).join(', ')}`);
    if (row.errors.length > 0)
      console.log(`  errors          : ${row.errors.join('; ')}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`  ✅ ok rows      : ${result.totalOk}`);
  console.log(`  ⚠️  warning rows : ${result.totalWarnings}`);
  console.log(`  ❌ error rows   : ${result.totalErrors}`);

  if (result.totalErrors > 0) {
    console.error('\n❌ Errors found — fix before uploading');
    process.exit(1);
  }

  // Verify HEIGHT/WIDTH/DEPTH are in the payload
  for (const row of result.rows) {
    const hasH = row.payload?.attributes.some((a) => a.id === 'HEIGHT');
    const hasW = row.payload?.attributes.some((a) => a.id === 'WIDTH');
    const hasD = row.payload?.attributes.some((a) => a.id === 'DEPTH');
    if (!hasH || !hasW || !hasD) {
      console.error(`\n❌ Row ${row.rowIndex}: missing dimension attributes in payload (H=${hasH} W=${hasW} D=${hasD})`);
      process.exit(1);
    }
    console.log(`\nRow ${row.rowIndex}: ✅ HEIGHT/WIDTH/DEPTH present in payload`);
  }

  console.log('\n── Columns added in v3 (vs v2) ──────────────────────────────────');
  console.log('  alto_cm          → HEIGHT  (number_unit, cm)');
  console.log('  ancho_cm         → WIDTH   (number_unit, cm)');
  console.log('  profundidad_cm   → DEPTH   (number_unit, cm)');

  console.log('\n── Next steps ───────────────────────────────────────────────────');
  console.log('  1. Upload ml-real-publish-v3.xlsx in FastPublisher bulk mode');
  console.log('  2. Check "Atributos ML faltantes" per row before publishing');
  console.log('  3. Publish → read "Error de Mercado Libre" if still failing');
  console.log('  4. Look for [ATTR_ID] in the cause message for missing attrs\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
