/**
 * Generates tests/fixtures/ml-real-publish-test.xlsx
 * 2 products optimised for real ML publishing (1 refrigerator + 1 microwave).
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

// ── Image URLs ────────────────────────────────────────────────────────────────
// Using Samsung's official media CDN (Scene7/AEM) — stable HTTPS.
// VERIFY these are accessible by opening in a browser before real publishing.

const IMAGES = {
  fridge_front:    'https://images.samsung.com/is/image/samsung/latin-en-rt29faradww-cl-001-front-white.jpg',
  fridge_open:     'https://images.samsung.com/is/image/samsung/latin-en-rt29faradww-cl-002-open-white.jpg',
  microwave_front: 'https://images.samsung.com/is/image/samsung/latin-en-ms23k3513aw-zl-001-front-white.jpg',
  microwave_side:  'https://images.samsung.com/is/image/samsung/latin-en-ms23k3513aw-zl-002-front-open-white.jpg',
};

// ── Product data ──────────────────────────────────────────────────────────────

type Row = Record<string, string>;

// Row 1: Samsung Heladera RT29FARADWW
// Category target: MLA-REFRIGERATORS → leaf category → marketplace
// All key attributes provided; categoria_ml left empty for auto-resolution.
const fridge: Row = {
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
  imagenes:           `${IMAGES.fridge_front}|${IMAGES.fridge_open}`,
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

// Row 2: Samsung Microondas MS23K3513AW
// Category target: MLA-MICROWAVES → leaf category → marketplace
// Wattage and capacity provided; categoria_ml left empty for auto-resolution.
const microwave: Row = {
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
  imagenes:           `${IMAGES.microwave_front}|${IMAGES.microwave_side}`,
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

// ── Instructions sheet content ────────────────────────────────────────────────

const instrRows: string[][] = [
  ['ARCHIVO DE TEST — PUBLICACION REAL EN MERCADO LIBRE'],
  ['Generado por FastPublisher — scripts/generate-real-publish-test.ts'],
  [''],
  ['IMPORTANTE — LEER ANTES DE USAR'],
  [''],
  ['1. Este archivo esta disenado para pruebas de publicacion REAL en Mercado Libre.'],
  ['2. Usar UNICAMENTE con MERCADOLIBRE_DRY_RUN=false (publicacion real activada).'],
  ['3. Publicar DE A UNO primero para verificar que ML acepta el payload.'],
  ['4. Las imagenes DEBEN ser URLs HTTPS publicamente accesibles por ML.'],
  ['   Verificar cada URL abriendo en el navegador antes de publicar.'],
  [''],
  ['PRODUCTOS INCLUIDOS'],
  ['Fila', 'Producto',                              'Marca',   'Categoria esperada',   'Precio ARS'],
  ['2',    'Heladera Samsung No Frost 290L Blanca', 'Samsung', 'MLA-REFRIGERATORS',    '450.000'],
  ['3',    'Microondas Samsung 23L 1150W Blanco',   'Samsung', 'MLA-MICROWAVES',       '115.000'],
  [''],
  ['IMAGENES — VERIFICAR ACCESIBILIDAD'],
  ['Las imagenes usan el CDN oficial de Samsung (images.samsung.com).'],
  ['Si las URLs no cargan (404), reemplazarlas con fotos del producto en hosting propio.'],
  ['Formato recomendado por ML: HTTPS, JPG o PNG, minimo 500x500px.'],
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Build rows
  const buildRow = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const dataRows = [fridge, microwave].map(buildRow);

  // Build products sheet
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  // Build instructions sheet
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 24 }, { wch: 80 }];

  // Write file
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-test.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Generated: ${outPath}`);
  console.log(`   Products: 2 (1 heladera + 1 microondas)`);

  // ── Parse + validate ────────────────────────────────────────────────────────

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
      console.log(`  applianceType     : ${row.draft.applianceType}`);
      console.log(`  mlCategoryId      : ${row.draft.mlCategoryId}  (static — overridden by resolver at publish)`);
      console.log(`  price             : ${row.draft.price} ${row.draft.currency}`);
      console.log(`  condition         : ${row.draft.condition}`);
      console.log(`  images            : ${row.draft.images.length} url(s)`);
      console.log(`  shipping.mode     : ${row.draft.shipping.mode}`);
      if (row.draft.manufacturer)      console.log(`  manufacturer      : ${row.draft.manufacturer}`);
      if (row.draft.powerSupplyType)   console.log(`  powerSupplyType   : ${row.draft.powerSupplyType}`);
      if (row.draft.requiresAssembly !== undefined)
        console.log(`  requiresAssembly  : ${row.draft.requiresAssembly}`);
      if (row.draft.officialCategoryId)
        console.log(`  officialCategoryId: ${row.draft.officialCategoryId}`);
    }

    if (row.missingFields.length > 0)
      console.log(`  missing fields    : ${row.missingFields.map((f) => f.id).join(', ')}`);

    if (row.errors.length > 0)
      console.log(`  errors            : ${row.errors.join('; ')}`);
  }

  // ── Image check ──────────────────────────────────────────────────────────────

  console.log('\n── Image URL check ──────────────────────────────────────────────');
  for (const row of result.rows) {
    if (!row.draft) continue;
    for (const img of row.draft.images) {
      const isHttps = img.startsWith('https://');
      const isLocal = img.startsWith('/uploads/') || (!img.startsWith('http'));
      const icon = isHttps && !isLocal ? '✅' : '❌';
      console.log(`  ${icon} ${img}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`  ✅ ok rows      : ${result.totalOk}`);
  console.log(`  ⚠️  warning rows : ${result.totalWarnings}`);
  console.log(`  ❌ error rows   : ${result.totalErrors}`);

  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  const badImages = allImages.filter((img) => !img.startsWith('https://'));
  if (badImages.length > 0) {
    console.log(`\n⚠️  WARNING: ${badImages.length} non-HTTPS image(s) — will block real ML publish`);
    badImages.forEach((img) => console.log(`   → ${img}`));
  } else {
    console.log(`\n✅ All ${allImages.length} images are HTTPS — format OK for real ML publish`);
    console.log(`   NOTE: Verify actual accessibility by opening each URL in a browser.`);
  }

  // ── Next steps ────────────────────────────────────────────────────────────────

  console.log('\n── Image URLs to verify ─────────────────────────────────────────');
  allImages.forEach((img) => console.log(`  ${img}`));

  console.log('\n── Next steps ───────────────────────────────────────────────────');
  console.log('  1. Open each image URL in a browser and confirm it loads');
  console.log('  2. If any 404 → replace with accessible HTTPS product photos');
  console.log('  3. Set MERCADOLIBRE_DRY_RUN=false in Vercel (or local .env)');
  console.log('  4. Upload ml-real-publish-test.xlsx in FastPublisher bulk mode');
  console.log('  5. Publish ONE row at a time initially');
  console.log(`  6. Check PublishHistory for ML response per item\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
