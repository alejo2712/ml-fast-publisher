/**
 * Generates tests/fixtures/ml-real-publish-final.xlsx
 * 2 products optimised for real ML publishing (1 refrigerator + 1 microwave).
 *
 * Images: local PNG filenames referencing tests/fixtures/images/*.png
 * These files are uploaded to ML's CDN before publishing via /api/ml/upload-pictures.
 * Generate them first with: npx tsx scripts/generate-test-images.ts
 *
 * Run: npx tsx scripts/generate-real-publish-test.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer, isLocalImageFilename } from '../src/lib/csv/parser';

// ── Column headers (must exactly match CSV_COLUMNS in src/lib/csv/template.ts) ─

// IMPORTANT: This array must match CSV_COLUMNS[].header in src/lib/csv/template.ts exactly.
// If a column is added to template.ts, add it here too.
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

// ── Local image filenames ─────────────────────────────────────────────────────
// These reference files in tests/fixtures/images/ (1200×1200 white PNGs).
// Generate them with: npx tsx scripts/generate-test-images.ts
// At publish time, the bulk flow uploads them to ML's CDN via /api/ml/upload-pictures
// and substitutes ML-hosted URLs into the payload before calling POST /items.

const FRIDGE_IMG1  = 'refrigerator-front-1200.png';
const FRIDGE_IMG2  = 'refrigerator-open-1200.png';
const MICRO_IMG1   = 'microwave-front-1200.png';
const MICRO_IMG2   = 'microwave-side-1200.png';

const IMAGES_DIR = path.resolve(__dirname, '../tests/fixtures/images');

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
    // EAN-13 for Samsung RT29FARADWW — valid checksum (7+7+0+9+5+4+5+0+1+8+8+3 → check=1)
    codigo_gtin:           '7709545018831',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    // Physical dimensions in cm (Samsung RT29FARADWW spec sheet)
    alto_cm:               '172',
    ancho_cm:              '60',
    profundidad_cm:        '65',
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
    // Physical dimensions in cm (Samsung MS23K3513AW spec sheet)
    alto_cm:               '27',
    ancho_cm:              '52',
    profundidad_cm:        '40',
    categoria_ml:          '',
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ generate-real-publish-test ══════════════════════════════════\n');

  // ── Step 1: Verify local image files exist ────────────────────────────────────

  console.log('── Image file check ─────────────────────────────────────────────');
  const requiredFiles = [FRIDGE_IMG1, FRIDGE_IMG2, MICRO_IMG1, MICRO_IMG2];
  const missing: string[] = [];
  for (const f of requiredFiles) {
    const fullPath = path.join(IMAGES_DIR, f);
    if (fs.existsSync(fullPath)) {
      const size = (fs.statSync(fullPath).size / 1024).toFixed(1);
      console.log(`  ✅ ${f} (${size} KB)`);
    } else {
      console.log(`  ❌ ${f} — MISSING`);
      missing.push(f);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing image files. Run first:\n   npx tsx scripts/generate-test-images.ts\n');
    process.exit(1);
  }

  // ── Step 2: Build instructions sheet ──────────────────────────────────────────

  const instrRows: string[][] = [
    ['ARCHIVO DE TEST — PUBLICACION REAL EN MERCADO LIBRE'],
    ['Generado por FastPublisher — scripts/generate-real-publish-test.ts'],
    [`Generado: ${new Date().toISOString()}`],
    [''],
    ['COMO USAR ESTE ARCHIVO'],
    [''],
    ['1. Subilo en FastPublisher → modo bulk → "Subir archivo".'],
    ['2. Junto con el Excel, subí las 4 imagenes PNG de tests/fixtures/images/'],
    ['   - refrigerator-front-1200.png'],
    ['   - refrigerator-open-1200.png'],
    ['   - microwave-front-1200.png'],
    ['   - microwave-side-1200.png'],
    ['3. El sistema subirá las imágenes al CDN de ML antes de publicar.'],
    ['4. Hacé clic en "Publicar en Mercado Libre" → confirmá el modal.'],
    ['5. Revisá PublishHistory para ver el resultado por producto.'],
    [''],
    ['PRODUCTOS INCLUIDOS'],
    ['Fila', 'Producto',                              'Marca',   'Categoria esperada',            'Precio ARS'],
    ['2',    'Heladera Samsung No Frost 290L Blanca', 'Samsung', 'Heladeras y Freezers (leaf)',   '450.000'],
    ['3',    'Microondas Samsung 23L 1150W Blanco',   'Samsung', 'Electrodomésticos > Microondas', '115.000'],
    [''],
    ['IMAGENES (archivos locales — se suben a ML CDN antes de publicar)'],
    ['Heladera img1',   FRIDGE_IMG1],
    ['Heladera img2',   FRIDGE_IMG2],
    ['Microondas img1', MICRO_IMG1],
    ['Microondas img2', MICRO_IMG2],
    ['Formato',         '1200×1200 px, fondo blanco, sin texto, sin logos — cumple requisitos ML'],
    [''],
    ['ENVIO'],
    ['Ambos productos usan envio=not_specified (evita errores de me2).'],
    [''],
    ['CATEGORIA ML (categoria_ml)'],
    ['La columna categoria_ml esta vacia — el sistema la resuelve automaticamente.'],
    ['La categoría resuelta DEBE contener palabras clave de la categoría esperada.'],
    ['Si falla: ingresar ID exacto de categoria HOJA en la columna categoria_ml.'],
    [''],
    ['ATRIBUTOS INCLUIDOS'],
    ['codigo_gtin',       '7709545018831 (heladera) → GTIN en ML'],
    ['fabricante',        'Samsung Electronics Argentina S.A. → MANUFACTURER'],
    ['tipo_alimentacion', '220V → POWER_SUPPLY_TYPE'],
    ['alto_cm',           '172 (heladera) / 27 (microondas) → HEIGHT'],
    ['ancho_cm',          '60 (heladera) / 52 (microondas) → WIDTH'],
    ['profundidad_cm',    '65 (heladera) / 40 (microondas) → DEPTH'],
    [''],
    ['SEGURIDAD DE CATEGORIA (nueva validacion)'],
    ['Si domain_discovery devuelve Mesas Ratonas / Muebles para un microondas → BLOQUEADO'],
    ['El sistema verifica que el camino de categoría contenga la palabra clave correcta.'],
    ['Microondas requiere "microondas" en el camino. Heladera requiere "heladera" o "refriger".'],
  ];

  // ── Step 3: Build and write the XLSX file ────────────────────────────────────

  const fridge    = buildFridge(FRIDGE_IMG1, FRIDGE_IMG2);
  const microwave = buildMicrowave(MICRO_IMG1, MICRO_IMG2);

  const buildRow = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const dataRows = [fridge, microwave].map(buildRow);

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 26 }, { wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-final.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Generated: ${outPath}`);

  // ── Step 4: Parse + validate ──────────────────────────────────────────────────

  console.log('\n── Parser validation ────────────────────────────────────────────');
  const fileBuffer = fs.readFileSync(outPath);
  const ab = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
  const { csv: csvText } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csvText);

  console.log(`Rows: ${result.rows.length} (${result.totalOk} ok, ${result.totalWarnings} warnings, ${result.totalErrors} errors)`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    const title = row.draft?.title ?? row.errors[0] ?? '(no title)';
    console.log(`\nRow ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${title}`);
    if (row.draft) {
      console.log(`  applianceType : ${row.draft.applianceType}`);
      console.log(`  gtin          : ${row.draft.gtin ?? '(none)'}`);
      console.log(`  height        : ${row.draft.height != null ? row.draft.height + ' cm' : '(none)'}`);
      console.log(`  images        : ${row.draft.images.join(', ')}`);
      console.log(`  localImageRefs: ${row.localImageRefs.join(', ') || '(none)'}`);
    }
    if (row.errors.length > 0) console.log(`  errors: ${row.errors.join('; ')}`);
  }

  // ── Step 5: Image file reference check ───────────────────────────────────────

  console.log('\n── Image reference check ────────────────────────────────────────');
  const allImages = result.rows.flatMap((r) => r.draft?.images ?? []);
  const localRefs = allImages.filter(isLocalImageFilename);
  const httpsUrls = allImages.filter((i) => i.startsWith('https://'));

  console.log(`  Local filenames  : ${localRefs.length}`);
  console.log(`  HTTPS URLs       : ${httpsUrls.length}`);

  for (const ref of localRefs) {
    const exists = fs.existsSync(path.join(IMAGES_DIR, ref));
    console.log(`  ${exists ? '✅' : '❌'} ${ref} ${exists ? '— file present' : '— FILE MISSING'}`);
  }

  if (localRefs.length === 0) {
    console.error('\n❌ No local image filenames found in fixture — check imagenes column');
    process.exit(1);
  }

  const missingLocalFiles = localRefs.filter((ref) => !fs.existsSync(path.join(IMAGES_DIR, ref)));
  if (missingLocalFiles.length > 0) {
    console.error(`\n❌ ${missingLocalFiles.length} referenced image file(s) not found in tests/fixtures/images/`);
    process.exit(1);
  }

  // ── Step 6: Expected category resolution ─────────────────────────────────────

  console.log('\n── Category resolution expectations ─────────────────────────────');
  console.log('  Heladera:   path MUST contain "heladera" or "refriger"');
  console.log('  Microondas: path MUST contain "microondas"');
  console.log('  Wrong path (e.g., Mesas Ratonas) → BLOCKED before POST /items');

  // ── Step 7: Next steps ────────────────────────────────────────────────────────

  console.log('\n── Ready to use ─────────────────────────────────────────────────');
  console.log('  File:    tests/fixtures/ml-real-publish-final.xlsx');
  console.log('  Images:  tests/fixtures/images/ (4 PNG files)');
  console.log('  Upload both Excel + PNG files in the FastPublisher bulk UI.');
  console.log('  Images will be uploaded to ML CDN before publishing.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
