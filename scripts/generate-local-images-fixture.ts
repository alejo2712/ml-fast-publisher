/**
 * Generates tests/fixtures/ml-real-publish-local-images.xlsx and placeholder images.
 *
 * Run: npx tsx scripts/generate-local-images-fixture.ts
 *
 * The fixture tests the complete local-image flow:
 *   - Excel references image filenames (not HTTPS URLs)
 *   - Images folder has matching placeholder files
 *   - Row 1: Heladera — heladera-frente.jpg | heladera-lateral.jpg (both provided)
 *   - Row 2: Microondas — microondas-frente.jpg (provided)
 *   - Row 3: Lavarropas — lavarropas-frente.jpg | lavarropas-missing.jpg (one missing)
 *   - Row 4: Cafetera — https://... (HTTPS URL — should not require local file)
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const IMAGES_DIR = path.join(FIXTURES_DIR, 'images');

// Ensure dirs exist
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ── Create minimal placeholder JPEG files ─────────────────────────────────────
// A valid 1x1 pixel white JPEG (minimal valid file for upload testing)
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

const placeholderImages = [
  'heladera-frente.jpg',
  'heladera-lateral.jpg',
  'microondas-frente.jpg',
  'lavarropas-frente.jpg',
  // lavarropas-missing.jpg is intentionally NOT created to test missing-file detection
];

placeholderImages.forEach((name) => {
  const dest = path.join(IMAGES_DIR, name);
  fs.writeFileSync(dest, MINIMAL_JPEG);
  console.log(`Created placeholder: ${dest}`);
});

// ── Create the Excel fixture ───────────────────────────────────────────────────
const rows = [
  // Row 1: Heladera with two local images (both provided)
  {
    titulo: 'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta: 'heladera samsung no frost 290 litros blanca nueva inverter',
    tipo_producto: 'heladera',
    marca: 'Samsung',
    modelo: 'RT29K5710S8',
    condicion: 'new',
    precio: 450000,
    stock: 1,
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: 290,
    codigo_gtin: '7509546069525',
    alto_cm: 165,
    ancho_cm: 59,
    profundidad_cm: 65,
    imagenes: 'heladera-frente.jpg|heladera-lateral.jpg',
    garantia: '12 meses',
    // No categoria_ml — tests auto-resolution + leaf validation
  },
  // Row 2: Microondas with one local image (provided)
  {
    titulo: 'Microondas Samsung 23L 1150W Blanco',
    descripcion_corta: 'microondas samsung 23 litros 1150 watts blanco nuevo',
    tipo_producto: 'microondas',
    marca: 'Samsung',
    modelo: 'MG23K3575AW',
    condicion: 'new',
    precio: 95000,
    stock: 2,
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: 23,
    potencia_watts: 1150,
    imagenes: 'microondas-frente.jpg',
    garantia: '12 meses',
  },
  // Row 3: Lavarropas with one provided + one MISSING local image
  {
    titulo: 'Lavarropas LG 8.5kg Carga Frontal Blanco',
    descripcion_corta: 'lavarropas lg 8.5 kg carga frontal nuevo blanco inverter',
    tipo_producto: 'lavarropas',
    marca: 'LG',
    modelo: 'WM1250AW',
    condicion: 'new',
    precio: 380000,
    stock: 1,
    color: 'Blanco',
    voltaje: '220V',
    capacidad_kg: 8.5,
    imagenes: 'lavarropas-frente.jpg|lavarropas-missing.jpg',
    garantia: '12 meses',
  },
  // Row 4: Cafetera with HTTPS URL (no local file needed)
  {
    titulo: 'Cafetera Nespresso Essenza Mini Negra',
    descripcion_corta: 'cafetera nespresso essenza mini negra capsulas nueva',
    tipo_producto: 'cafetera',
    marca: 'Nespresso',
    modelo: 'EN85B',
    condicion: 'new',
    precio: 85000,
    stock: 3,
    color: 'Negro',
    voltaje: '220V',
    imagenes: 'https://http2.mlstatic.com/D_NQ_NP_sample-cafetera.jpg',
    garantia: '12 meses',
  },
];

// Map row objects to array using header order
const headers = [
  'titulo', 'descripcion_corta', 'tipo_producto', 'marca', 'modelo', 'condicion',
  'precio', 'stock', 'color', 'voltaje', 'capacidad_litros', 'capacidad_kg',
  'potencia_watts', 'codigo_gtin', 'alto_cm', 'ancho_cm', 'profundidad_cm',
  'imagenes', 'garantia',
];

const sheetData = [
  headers,
  ...rows.map((r) => headers.map((h) => (r as Record<string, unknown>)[h] ?? '')),
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(sheetData);
ws['!cols'] = headers.map(() => ({ wch: 22 }));
XLSX.utils.book_append_sheet(wb, ws, 'Productos');

// Instructions sheet
const instrRows = [
  ['FIXTURE: ml-real-publish-local-images.xlsx'],
  [''],
  ['Propósito: probar el flujo de imágenes locales en el bulk publisher.'],
  [''],
  ['Fila 1: Heladera — 2 imágenes locales (ambas provistas): heladera-frente.jpg, heladera-lateral.jpg'],
  ['Fila 2: Microondas — 1 imagen local (provista): microondas-frente.jpg'],
  ['Fila 3: Lavarropas — 1 imagen local provista + 1 faltante (lavarropas-missing.jpg)'],
  ['Fila 4: Cafetera — URL HTTPS (no requiere archivo local)'],
  [''],
  ['Archivos de imagen en tests/fixtures/images/:'],
  ['  heladera-frente.jpg     ✓ provisto (placeholder JPEG 1x1)'],
  ['  heladera-lateral.jpg    ✓ provisto'],
  ['  microondas-frente.jpg   ✓ provisto'],
  ['  lavarropas-frente.jpg   ✓ provisto'],
  ['  lavarropas-missing.jpg  ✗ INTENCIONALMENTE AUSENTE para testear detección de faltantes'],
];
const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
wsInstr['!cols'] = [{ wch: 80 }];
XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

const outPath = path.join(FIXTURES_DIR, 'ml-real-publish-local-images.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`\nCreated fixture: ${outPath}`);
console.log('\nImage files in tests/fixtures/images/:');
fs.readdirSync(IMAGES_DIR).forEach((f) => console.log(`  ${f}`));
console.log('\nNote: lavarropas-missing.jpg is intentionally absent — for missing-file detection tests.');
