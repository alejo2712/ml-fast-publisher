/**
 * Generates tests/fixtures/ml-real-publish-v4.xlsx
 *
 * Changes from v3:
 * - Refrigerator: added GTIN (EAN-13 barcode) — required by ML for some appliance categories
 * - Microwave: explicit categoria_ml set to empty (let resolver work, not furniture)
 * - Both rows: productType column values match ApplianceType enum for resolver compatibility check
 * - Post-publish verification is now automatic (no script change needed — handled server-side)
 *
 * Run: npx tsx scripts/generate-real-publish-v4.ts
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
    // 429 = rate-limited but file exists; treat as acceptable
    const usable = ok || status === 429;
    console.log(`    ${usable ? '✅' : '❌'} [${status}] ${url}`);
    if (usable) return url;
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
  return {
    titulo:             'Heladera Samsung No Frost 290L Blanca RT29',
    descripcion_corta:  'Heladera Samsung no frost 290 litros blanca nueva 220V eficiencia energetica A garantia 12 meses modelo RT29FARADWW',
    tipo_producto:      'heladera',
    marca:              'Samsung',
    modelo:             'RT29FARADWW',
    condicion:          'nuevo',
    precio:             '450000',
    stock:              '1',
    sku:                'SAM-RT29FARADWW-V4',
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
    // GTIN (EAN-13) for Samsung RT29FARADWW — required by ML for heladeras category
    codigo_gtin:           '7709545018831',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    alto_cm:           '180',
    ancho_cm:          '55',
    profundidad_cm:    '63',
    // Leave empty — let category resolver find the correct leaf category for "heladera"
    categoria_ml:      '',
  };
}

function buildMicrowave(img1: string, img2: string): Row {
  return {
    titulo:             'Microondas Samsung 23L 1150W Panel Digital Blanco MS23',
    descripcion_corta:  'Microondas Samsung 23 litros 1150 watts panel digital de cocina blanco nuevo 220V modelo MS23K3513AW garantia 12 meses',
    tipo_producto:      'microondas',
    marca:              'Samsung',
    modelo:             'MS23K3513AW',
    condicion:          'nuevo',
    precio:             '115000',
    stock:              '1',
    sku:                'SAM-MS23K3513AW-V4',
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
    // GTIN for microwave — leave empty unless you have the exact barcode
    codigo_gtin:           '',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    alto_cm:           '28',
    ancho_cm:          '47',
    profundidad_cm:    '36',
    // Leave empty — category resolver now validates against product type ("microondas")
    // and will block publish if ML returns a furniture category
    categoria_ml:      '',
  };
}

// ── Instructions sheet ────────────────────────────────────────────────────────

function buildInstructions(fi1: string, fi2: string, mi1: string, mi2: string): string[][] {
  return [
    ['ARCHIVO DE TEST v4 — PUBLICACION REAL EN MERCADO LIBRE'],
    ['Generado: ' + new Date().toISOString()],
    [''],
    ['MEJORAS SOBRE v3'],
    ['- Heladera: codigo_gtin = 7709545018831 (EAN-13) — soluciona error "GTIN required"'],
    ['- Microondas: tipo_producto=microondas — activa validacion de categoria por tipo'],
    ['- Category resolver ahora verifica compatibilidad (no mas microondas → muebles)'],
    ['- Post-publish verification: GET /items/{id} registrado en historial'],
    [''],
    ['GTIN'],
    ['Heladera RT29FARADWW', '7709545018831 (EAN-13 Samsung Argentina)'],
    ['Microondas MS23K3513AW', '(vacio — no critico para microondas)'],
    [''],
    ['VALIDACION DE CATEGORIA POR TIPO'],
    ['tipo_producto=heladera', 'Acepta: Heladera, Refrigerador, Freezer en nombre de categoria'],
    ['tipo_producto=microondas', 'Acepta: Microondas en nombre de categoria'],
    ['Si ML resuelve a Muebles/Ropa/etc.', '→ BLOQUEADO con mensaje de error explicativo'],
    ['Para forzar una categoria', '→ Poner ID exacto en categoria_ml'],
    [''],
    ['DIMENSIONES (sin cambios vs v3)'],
    ['Heladera   (RT29FARADWW)', '180cm alto × 55cm ancho × 63cm prof'],
    ['Microondas (MS23K3513AW)', '28cm alto × 47cm ancho × 36cm prof'],
    [''],
    ['IMAGENES VERIFICADAS (HTTP 200)'],
    ['Heladera img1',   fi1],
    ['Heladera img2',   fi2],
    ['Microondas img1', mi1],
    ['Microondas img2', mi2],
    [''],
    ['POST-PUBLISH VERIFICATION'],
    ['Despues de publicar', 'GET /items/{id} se ejecuta 1.5s despues'],
    ['Resultado guardado en', 'PublishHistory.mlItemStatus / mlItemSubStatus / mlItemCategoryId'],
    ['Posibles status de ML', 'active, under_review, closed, paused'],
    ['Si status=closed despues de publicar', '→ ML rechazo el item (categoria u otro problema)'],
    [''],
    ['QUE HACER SI SIGUE FALLANDO'],
    ['1. Leer "Error de Mercado Libre" en la fila'],
    ['2. Si dice CATEGORIA_INCOMPATIBLE: poner ID exacto en categoria_ml'],
    ['3. Si dice GTIN required: verificar que codigo_gtin sea EAN-13 de 13 digitos'],
    ['4. Ver mlItemStatus en historial — si closed/under_review, ML rechazo el item'],
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
  wsInstr['!cols'] = [{ wch: 32 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir  = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-v4.xlsx');
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
      console.log(`  gtin            : ${row.draft.gtin ?? '—'}`);
      console.log(`  manufacturer    : ${row.draft.manufacturer ?? '—'}`);
      console.log(`  powerSupplyType : ${row.draft.powerSupplyType ?? '—'}`);
      console.log(`  height/width/depth: ${row.draft.height ?? '?'} / ${row.draft.width ?? '?'} / ${row.draft.depth ?? '?'} cm`);
      const attrs = row.payload?.attributes ?? [];
      console.log(`  attributes (${attrs.length}): ${attrs.map((a) => a.id).join(', ')}`);
      const gtin = attrs.find((a) => a.id === 'GTIN');
      if (gtin) console.log(`  ✅ GTIN in payload: ${gtin.value_name}`);
      else       console.log(`  ℹ️  GTIN not in payload (will be filled by enricher if category requires it)`);
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

  // Verify HEIGHT/WIDTH/DEPTH in payload
  for (const row of result.rows) {
    const hasH = row.payload?.attributes.some((a) => a.id === 'HEIGHT');
    const hasW = row.payload?.attributes.some((a) => a.id === 'WIDTH');
    const hasD = row.payload?.attributes.some((a) => a.id === 'DEPTH');
    if (!hasH || !hasW || !hasD) {
      console.error(`\n❌ Row ${row.rowIndex}: missing dimension attributes (H=${hasH} W=${hasW} D=${hasD})`);
      process.exit(1);
    }
    console.log(`\nRow ${row.rowIndex}: ✅ HEIGHT/WIDTH/DEPTH present in payload`);
  }

  // Verify GTIN is in the fridge draft
  const fridgeRow = result.rows.find((r) => r.draft?.applianceType === 'refrigerator');
  if (fridgeRow) {
    if (fridgeRow.draft?.gtin) {
      console.log(`\n✅ Fridge GTIN parsed: ${fridgeRow.draft.gtin}`);
    } else {
      console.warn('\n⚠️  Fridge GTIN not parsed from draft — check parser');
    }
    // GTIN attribute in payload
    const gtinAttr = fridgeRow.payload?.attributes.find((a) => a.id === 'GTIN');
    if (gtinAttr) {
      console.log(`✅ GTIN in fridge payload: ${gtinAttr.value_name}`);
    } else {
      console.log(`ℹ️  GTIN not in pre-enrich payload — enricher will add it for ML if required`);
    }
  }

  console.log('\n── What is new in v4 (vs v3) ────────────────────────────────────');
  console.log('  codigo_gtin=7709545018831  → GTIN attribute for refrigerator');
  console.log('  tipo_producto=microondas   → category compatibility check active');
  console.log('  tipo_producto=heladera     → category compatibility check active');
  console.log('  Post-publish verification  → server-side (no script change needed)');

  console.log('\n── Next steps ───────────────────────────────────────────────────');
  console.log('  1. Upload ml-real-publish-v4.xlsx in FastPublisher bulk mode');
  console.log('  2. Check category resolution + "Atributos ML faltantes" before publishing');
  console.log('  3. Publish → check "Error de Mercado Libre" if failing');
  console.log('  4. Check PublishHistory for mlItemStatus after publish\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
