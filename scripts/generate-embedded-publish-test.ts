/**
 * Generates tests/fixtures/ml-real-publish-embedded.xlsx
 *
 * Same 2 products as ml-real-publish-final.xlsx but with the 4 PNG test images
 * embedded inside the workbook in a hidden "Imagenes" sheet.
 *
 * When this file is uploaded in the bulk UI, the images are extracted automatically
 * and pre-populated — no separate PNG upload needed.
 *
 * Run: npx tsx scripts/generate-embedded-publish-test.ts
 * Requires: tests/fixtures/images/*.png (run gen:images first if missing)
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

const HEADERS = [
  'titulo', 'descripcion_corta', 'tipo_producto', 'marca', 'modelo', 'condicion',
  'precio', 'stock', 'sku', 'color', 'voltaje', 'capacidad_litros', 'capacidad_kg',
  'potencia_watts', 'tecnologia', 'garantia', 'envio', 'retiro_en_persona',
  'envio_gratis', 'imagenes', 'descripcion_larga', 'codigo_gtin', 'fabricante',
  'tipo_alimentacion', 'requiere_armado', 'incluye_manual_armado',
  'alto_cm', 'ancho_cm', 'profundidad_cm', 'categoria_ml',
];

const FRIDGE_IMG1 = 'refrigerator-front-1200.png';
const FRIDGE_IMG2 = 'refrigerator-open-1200.png';
const MICRO_IMG1  = 'microwave-front-1200.png';
const MICRO_IMG2  = 'microwave-side-1200.png';

const IMAGES_DIR = path.resolve(__dirname, '../tests/fixtures/images');

type Row = Record<string, string>;

function buildFridge(): Row {
  return {
    titulo: 'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta: 'Heladera Samsung no frost 290 litros blanca nueva 220V garantia 12 meses modelo RT29FARADWW',
    tipo_producto: 'heladera', marca: 'Samsung', modelo: 'RT29FARADWW', condicion: 'nuevo',
    precio: '450000', stock: '1', sku: 'SAM-RT29FARADWW', color: 'Blanco', voltaje: '220V',
    capacidad_litros: '290', capacidad_kg: '', potencia_watts: '', tecnologia: 'No Frost',
    garantia: '12 meses', envio: 'not_specified', retiro_en_persona: 'si', envio_gratis: 'no',
    imagenes: `${FRIDGE_IMG1}|${FRIDGE_IMG2}`,
    descripcion_larga: 'Heladera Samsung No Frost RT29FARADWW de 290 litros. Tecnologia No Frost: elimina la escarcha automaticamente. Capacidad total: 290 litros. Incluye garantia oficial Samsung de 12 meses.',
    codigo_gtin: '7709545018831', fabricante: 'Samsung Electronics Argentina S.A.',
    tipo_alimentacion: '220V', requiere_armado: 'no', incluye_manual_armado: 'no',
    alto_cm: '172', ancho_cm: '60', profundidad_cm: '65', categoria_ml: '',
  };
}

function buildMicrowave(): Row {
  return {
    titulo: 'Microondas Samsung 23L 1150W Blanco',
    descripcion_corta: 'Microondas Samsung 23 litros 1150 watts blanco nuevo 220V modelo MS23K3513AW garantia 12 meses',
    tipo_producto: 'microondas', marca: 'Samsung', modelo: 'MS23K3513AW', condicion: 'nuevo',
    precio: '115000', stock: '1', sku: 'SAM-MS23K3513AW', color: 'Blanco', voltaje: '220V',
    capacidad_litros: '23', capacidad_kg: '', potencia_watts: '1150', tecnologia: '',
    garantia: '12 meses', envio: 'not_specified', retiro_en_persona: 'si', envio_gratis: 'no',
    imagenes: `${MICRO_IMG1}|${MICRO_IMG2}`,
    descripcion_larga: 'Microondas Samsung MS23K3513AW de 23 litros y 1150 watts. 5 niveles de potencia ajustables. Incluye garantia oficial Samsung de 12 meses.',
    codigo_gtin: '', fabricante: 'Samsung Electronics Argentina S.A.',
    tipo_alimentacion: '220V', requiere_armado: 'no', incluye_manual_armado: 'no',
    alto_cm: '27', ancho_cm: '52', profundidad_cm: '40', categoria_ml: '',
  };
}

async function main() {
  console.log('\n══ generate-embedded-publish-test ══════════════════════════════\n');

  // ── Verify PNG files exist ────────────────────────────────────────────────
  const imageFiles = [FRIDGE_IMG1, FRIDGE_IMG2, MICRO_IMG1, MICRO_IMG2];
  for (const f of imageFiles) {
    const fp = path.join(IMAGES_DIR, f);
    if (!fs.existsSync(fp)) {
      console.error(`❌ Missing: ${fp}\n   Run: npx tsx scripts/generate-test-images.ts`);
      process.exit(1);
    }
    const kb = (fs.statSync(fp).size / 1024).toFixed(1);
    console.log(`  ✅ ${f} (${kb} KB)`);
  }

  // ── Build Productos sheet ─────────────────────────────────────────────────
  const fridge    = buildFridge();
  const microwave = buildMicrowave();
  const buildRow  = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...[fridge, microwave].map(buildRow)]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  // ── Build Imagenes sheet (hidden data sheet) ──────────────────────────────
  // Columns: nombre_archivo | base64_data
  // The BulkUpload parser reads this sheet and auto-populates imageFiles state.
  const imgRows: string[][] = [['nombre_archivo', 'base64_data']];
  for (const filename of imageFiles) {
    const data = fs.readFileSync(path.join(IMAGES_DIR, filename));
    const b64 = `data:image/png;base64,${data.toString('base64')}`;
    imgRows.push([filename, b64]);
    console.log(`  Embedded ${filename} (${(b64.length / 1024).toFixed(0)} KB base64)`);
  }
  const wsImg = XLSX.utils.aoa_to_sheet(imgRows);
  wsImg['!cols'] = [{ wch: 35 }, { wch: 20 }]; // base64 column intentionally narrow

  // ── Build Instrucciones sheet ─────────────────────────────────────────────
  const instrRows: string[][] = [
    ['ARCHIVO DE TEST — UN SOLO ARCHIVO, IMÁGENES INCLUIDAS'],
    [''],
    ['Las 4 imágenes PNG están embebidas en la hoja "Imagenes" de este archivo.'],
    ['Subí SOLO ESTE archivo en FastPublisher → modo bulk → "Subir archivo".'],
    ['Las imágenes se detectan automáticamente. No necesitás subir PNGs por separado.'],
    [''],
    ['PRODUCTOS'],
    ['Heladera Samsung No Frost 290L Blanca — $450.000'],
    ['Microondas Samsung 23L 1150W Blanco  — $115.000'],
    [''],
    ['IMÁGENES EMBEBIDAS (hoja "Imagenes")'],
    ...imageFiles.map((f) => [f, '✓ incluida']),
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 55 }, { wch: 15 }];

  // ── Write workbook ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,      'Productos');
  XLSX.utils.book_append_sheet(wb, wsImg,   'Imagenes');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outPath = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-embedded.xlsx');
  XLSX.writeFile(wb, outPath);
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Generated: ${outPath} (${sizeMb} MB)`);

  // ── Parse-back validation ─────────────────────────────────────────────────
  console.log('\n── Parse-back validation ────────────────────────────────────────');
  const buf = fs.readFileSync(outPath);
  const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { csv, embeddedImages } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);

  console.log(`Rows: ${result.rows.length} (${result.totalOk} ok, ${result.totalWarnings} warnings, ${result.totalErrors} errors)`);
  console.log(`Embedded images recovered: ${embeddedImages.size}`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    console.log(`Row ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${row.draft?.title ?? row.errors[0]}`);
    console.log(`  localImageRefs: ${row.localImageRefs.join(', ')}`);
    // Verify every local ref has a matching embedded image
    for (const ref of row.localImageRefs) {
      const key = ref.trim().replace(/^.*[/\\]/, '').toLowerCase();
      const found = embeddedImages.has(key);
      console.log(`    ${found ? '✅' : '❌'} ${ref} → embedded key "${key}" ${found ? 'found' : 'MISSING'}`);
    }
  }

  if (result.totalErrors > 0) {
    console.error('\n❌ Parse errors in fixture rows');
    process.exit(1);
  }
  if (embeddedImages.size !== imageFiles.length) {
    console.error(`\n❌ Expected ${imageFiles.length} embedded images, got ${embeddedImages.size}`);
    process.exit(1);
  }

  console.log(`\n✅ All ${embeddedImages.size} images recovered correctly.`);
  console.log('\nUpload just this ONE file — images auto-populate in the UI.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
