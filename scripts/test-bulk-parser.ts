/**
 * Bulk parser QA script — run with:
 *   npx tsx scripts/test-bulk-parser.ts
 *
 * Tests the CSV/xlsx parsing pipeline end-to-end.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import { generateCsvTemplate } from '../src/lib/csv/template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = resolve(__dirname, '../tests/fixtures');

// ─── Simple assertion helpers ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(condition: boolean, name: string, info?: unknown) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    if (info !== undefined) console.error('    →', JSON.stringify(info, null, 2));
    failed++;
  }
}

function section(label: string) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 48 - label.length))}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {

// ─── Comment rows are skipped ────────────────────────────────────────────────

section('Comment row skipping');
{
  const csv = [
    'titulo,descripcion_corta,marca,condicion,precio,stock',
    '# Esta es una línea de ayuda — debe ignorarse',
    '# ejemplo: Heladera Samsung,...',
    'Heladera Samsung 320L,Heladera Samsung no frost 320 litros blanca nueva,Samsung,nuevo,250000,1',
  ].join('\n');
  const result = await parseCsvText(csv);
  ok(result.rows.length === 1, 'Only 1 data row (comments skipped)');
  ok(result.rows[0].status !== 'error', 'Row parsed without error', result.rows[0].errors);
}

// ─── CSV template re-upload ───────────────────────────────────────────────────

section('CSV template re-upload');
{
  const template = generateCsvTemplate();
  const result = await parseCsvText(template);
  ok(result.rows.length === 0, 'Template re-upload → 0 data rows (hint/example rows are #-prefixed)');
}

// ─── BOM stripping ───────────────────────────────────────────────────────────

section('UTF-8 BOM stripping');
{
  const csv = '﻿titulo,descripcion_corta,marca,condicion,precio\n' +
    'Heladera Samsung 320L,Heladera Samsung no frost 320 litros blanca nueva,Samsung,nuevo,250000';
  const result = await parseCsvText(csv);
  ok(result.rows.length === 1, 'BOM-prefixed CSV parses correctly');
}

// ─── Valid CSV fixtures ───────────────────────────────────────────────────────

section('Valid CSV fixtures');
{
  const csv = readFileSync(resolve(FIXTURES, 'valid-appliances.csv'), 'utf-8');
  const result = await parseCsvText(csv);

  ok(result.rows.length === 3, `3 rows parsed (got ${result.rows.length})`);
  ok(result.totalErrors === 0, `0 errors (got ${result.totalErrors})`,
    result.rows.filter(r => r.status === 'error').map(r => ({ row: r.rowIndex, errors: r.errors })));

  const row0 = result.rows[0];
  ok(row0.draft?.brand === 'Samsung', `Row0 brand = Samsung (got ${row0.draft?.brand})`);
  ok(row0.draft?.applianceType === 'refrigerator', `Row0 type = refrigerator (got ${row0.draft?.applianceType})`);
  ok(row0.draft?.price === 250000, `Row0 price = 250000 (got ${row0.draft?.price})`);
  ok(row0.draft?.condition === 'new', `Row0 condition = new (got ${row0.draft?.condition})`);
  ok(row0.draft?.capacity === '320', `Row0 capacity = 320 (got ${row0.draft?.capacity})`);
  ok((row0.draft?.images?.length ?? 0) >= 1, `Row0 has images`);

  const row1 = result.rows[1];
  ok(row1.draft?.applianceType === 'washing_machine', `Row1 type = washing_machine (got ${row1.draft?.applianceType})`);
  ok(row1.draft?.capacity === '8', `Row1 capacity_kg = 8 (got ${row1.draft?.capacity})`);
  ok(row1.draft?.shipping?.localPickUp === true, `Row1 localPickUp = true`);

  const row2 = result.rows[2];
  ok((row2.draft?.images?.length ?? 0) === 2, `Row2 pipe-separated images = 2 (got ${row2.draft?.images?.length})`);
}

// ─── tipo_producto override ───────────────────────────────────────────────────

section('tipo_producto column overrides inference');
{
  const csv = [
    'descripcion_corta,tipo_producto,marca,condicion,precio',
    // Generic description that inference might get wrong → override with tipo_producto
    'Electrodoméstico Philco moderno nuevo,microondas,Philco,nuevo,35000',
  ].join('\n');
  const result = await parseCsvText(csv);
  ok(result.rows.length === 1, '1 row');
  ok(result.rows[0].draft?.applianceType === 'microwave',
    `tipo_producto=microondas → microwave (got ${result.rows[0].draft?.applianceType})`);
}

{
  const csv = [
    'descripcion_corta,tipo_producto,marca,condicion,precio',
    'Electrodoméstico Philco nuevo,cafetera,Philco,nuevo,45000',
  ].join('\n');
  const result = await parseCsvText(csv);
  ok(result.rows[0]?.draft?.applianceType === 'coffee_maker',
    `tipo_producto=cafetera → coffee_maker (got ${result.rows[0]?.draft?.applianceType})`);
}

// ─── Condition normalization ──────────────────────────────────────────────────

section('Condition normalization');
{
  const cases: Array<{ input: string; expected: string }> = [
    { input: 'nuevo', expected: 'new' },
    { input: 'nueva', expected: 'new' },
    { input: 'new', expected: 'new' },
    { input: '0km', expected: 'new' },
    { input: 'usado', expected: 'used' },
    { input: 'usada', expected: 'used' },
    { input: 'segunda mano', expected: 'used' },
    { input: 'reacondicionado', expected: 'refurbished' },
    { input: 'refurbished', expected: 'refurbished' },
  ];
  for (const { input, expected } of cases) {
    const csv = [
      'descripcion_corta,marca,condicion,precio',
      `Heladera Samsung no frost 320 litros blanca,Samsung,${input},250000`,
    ].join('\n');
    const result = await parseCsvText(csv);
    ok(result.rows[0]?.draft?.condition === expected,
      `"${input}" → ${expected} (got ${result.rows[0]?.draft?.condition})`);
  }
}

// ─── Image separators ────────────────────────────────────────────────────────

section('Image separators (pipe, semicolon, comma-in-quotes)');
{
  const img1 = 'https://http2.mlstatic.com/D_NQ_NP_img1.jpg';
  const img2 = 'https://http2.mlstatic.com/D_NQ_NP_img2.jpg';

  const cases: Array<{ raw: string; label: string }> = [
    { raw: `${img1}|${img2}`, label: 'pipe (|)' },
    { raw: `${img1};${img2}`, label: 'semicolon (;)' },
    { raw: `"${img1},${img2}"`, label: 'comma-in-quotes (,)' },
  ];
  for (const { raw, label } of cases) {
    const csv = [
      'descripcion_corta,marca,condicion,precio,imagenes',
      `Heladera Samsung no frost 320 litros blanca,Samsung,nuevo,250000,${raw}`,
    ].join('\n');
    const result = await parseCsvText(csv);
    const images = result.rows[0]?.draft?.images ?? [];
    ok(images.length === 2, `${label} → 2 images (got ${images.length})`, images);
  }
}

// ─── Price parsing ────────────────────────────────────────────────────────────

section('Price parsing (dot/comma as thousands separator)');
{
  const cases: Array<{ input: string; expected: number }> = [
    { input: '250000', expected: 250000 },
    { input: '250.000', expected: 250000 },   // dot as thousands sep (European style)
    { input: '"250,000"', expected: 250000 }, // quoted comma-separated (user quotes the field)
    { input: '1500000', expected: 1500000 },
  ];
  for (const { input, expected } of cases) {
    const csv = [
      'descripcion_corta,marca,condicion,precio',
      `Heladera Samsung no frost 320 litros blanca,Samsung,nuevo,${input}`,
    ].join('\n');
    const result = await parseCsvText(csv);
    ok(result.rows[0]?.draft?.price === expected,
      `"${input}" → ${expected} (got ${result.rows[0]?.draft?.price})`);
  }
}

// ─── Numeric fields ───────────────────────────────────────────────────────────

section('Numeric fields (stock, capacity, watts)');
{
  const csv = [
    'descripcion_corta,marca,condicion,precio,stock,capacidad_litros,potencia_watts',
    'Microondas Panasonic 25L 800W nuevo,Panasonic,nuevo,45000,3,25,800',
  ].join('\n');
  const result = await parseCsvText(csv);
  const draft = result.rows[0]?.draft;
  ok(draft?.stock === 3, `Stock = 3 (got ${draft?.stock})`);
  ok(draft?.capacity === '25', `Capacity = '25' (got ${draft?.capacity})`);
  ok(draft?.watts === 800, `Watts = 800 (got ${draft?.watts})`);
}

// ─── Boolean fields ───────────────────────────────────────────────────────────

section('Boolean shipping fields (si/sí/yes/1/true → true)');
{
  const truthy = ['si', 'sí', 'yes', '1', 'true'];
  const falsy = ['no', 'false', '0'];

  for (const val of truthy) {
    const csv = `descripcion_corta,marca,condicion,precio,retiro_en_persona\nHeladera Samsung no frost,Samsung,nuevo,250000,${val}`;
    const result = await parseCsvText(csv);
    ok(result.rows[0]?.draft?.shipping?.localPickUp === true,
      `"${val}" → localPickUp=true (got ${result.rows[0]?.draft?.shipping?.localPickUp})`);
  }
  for (const val of falsy) {
    const csv = `descripcion_corta,marca,condicion,precio,retiro_en_persona\nHeladera Samsung no frost,Samsung,nuevo,250000,${val}`;
    const result = await parseCsvText(csv);
    ok(result.rows[0]?.draft?.shipping?.localPickUp === false,
      `"${val}" → localPickUp=false (got ${result.rows[0]?.draft?.shipping?.localPickUp})`);
  }
}

// ─── Legacy headers ───────────────────────────────────────────────────────────

section('Legacy header aliases (imagen_url, capacidad, watts)');
{
  const csv = readFileSync(resolve(FIXTURES, 'legacy-headers.csv'), 'utf-8');
  const result = await parseCsvText(csv);
  ok(result.rows.length === 2, `2 rows (got ${result.rows.length})`);
  ok(result.totalErrors === 0, '0 errors', result.rows.filter(r=>r.status==='error').map(r=>r.errors));
  ok((result.rows[0]?.draft?.images?.length ?? 0) > 0, 'imagen_url alias works');
  ok(result.rows[0]?.draft?.capacity === '280', `capacidad alias → capacity (got ${result.rows[0]?.draft?.capacity})`);
}

// ─── Validation deduplication ─────────────────────────────────────────────────

section('Validation — invalid field not duplicated as missing');
{
  const csv = [
    'descripcion_corta,marca,condicion,precio',
    'Heladera Samsung no frost 320 litros blanca,asd,nuevo,250000',
  ].join('\n');
  const result = await parseCsvText(csv);
  const row = result.rows[0];
  const missingIds = row?.missingFields.map(f => f.id) ?? [];
  const errorMsgs = row?.errors ?? [];

  ok(!missingIds.includes('brand'), 'garbage brand NOT in missingFields');
  ok(errorMsgs.some(e => e.toLowerCase().includes('marca')), 'garbage brand IS in errors array');
  ok(row?.status === 'error', `Row with garbage brand has status=error (got ${row?.status})`);
}

// ─── Missing price → warnings ─────────────────────────────────────────────────

section('Missing required fields → warnings status');
{
  const csv = [
    'descripcion_corta,marca,condicion,precio',
    'Heladera Samsung no frost 320 litros blanca,Samsung,nuevo,',
  ].join('\n');
  const result = await parseCsvText(csv);
  const row = result.rows[0];
  ok(row?.status === 'warnings', `Missing price → status=warnings (got ${row?.status})`);
  ok(row?.missingFields.some(f => f.id === 'price'), 'price in missingFields');
}

// ─── Numeric capacity not garbage ────────────────────────────────────────────

section('Capacity value "320" not flagged as garbage');
{
  const csv = [
    'descripcion_corta,marca,condicion,precio,stock,capacidad_litros,imagenes',
    'Heladera Samsung no frost 320 litros blanca nueva,Samsung,nuevo,250000,1,320,https://http2.mlstatic.com/D_NQ_NP_sample.jpg',
  ].join('\n');
  const result = await parseCsvText(csv);
  const row = result.rows[0];
  ok(row !== undefined, 'Row exists');
  const capacityError = row?.errors.find(e => e.toLowerCase().includes('capacidad'));
  ok(!capacityError, `No capacity error (got: ${capacityError ?? 'none'})`);
  ok(row?.status !== 'error', `Status is not error (got ${row?.status})`);
}

// ─── Mixed valid/invalid CSV ──────────────────────────────────────────────────

section('Mixed valid/invalid CSV fixture');
{
  const csv = readFileSync(resolve(FIXTURES, 'mixed-appliances.csv'), 'utf-8');
  const result = await parseCsvText(csv);

  ok(result.rows.length >= 3, `At least 3 rows (got ${result.rows.length})`);

  // Row with semicolon-separated images (Cafetera Nespresso)
  const cafeteraRow = result.rows.find(r => r.draft?.applianceType === 'coffee_maker');
  ok(cafeteraRow !== undefined, 'Coffee maker row found (tipo_producto override)');
  ok((cafeteraRow?.draft?.images?.length ?? 0) === 2,
    `Semicolon-sep images = 2 (got ${cafeteraRow?.draft?.images?.length})`);
}

// ─── XLSX roundtrip ───────────────────────────────────────────────────────────

section('XLSX roundtrip (build xlsx in memory → parse back)');
{
  try {
    const XLSX = await import('xlsx');
    const headers = ['titulo','descripcion_corta','marca','condicion','precio','stock','imagenes'];
    const dataRow = [
      'Freezer Samsung 200L Blanco',
      'Freezer Samsung 200 litros blanco nuevo',
      'Samsung', 'new', '120000', '1',
      'https://http2.mlstatic.com/D_NQ_NP_sample.jpg',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, dataRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    const xlsxBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const { csv: csvText } = await parseXlsxBuffer(xlsxBuffer);
    const result = await parseCsvText(csvText);

    ok(result.rows.length === 1, `XLSX roundtrip: 1 row (got ${result.rows.length})`);
    ok(result.rows[0]?.draft?.brand === 'Samsung', `XLSX brand = Samsung`);
    ok(result.rows[0]?.draft?.price === 120000, `XLSX price = 120000`);
    ok(result.rows[0]?.draft?.applianceType === 'freezer',
      `XLSX type = freezer (got ${result.rows[0]?.draft?.applianceType})`);
    ok(result.rows[0]?.status !== 'error',
      `XLSX row status not error (got ${result.rows[0]?.status})`, result.rows[0]?.errors);
  } catch (err) {
    failed++;
    console.error('  ✗ XLSX roundtrip failed:', err);
  }
}

// ─── XLSX with multiple sheets — uses first sheet ─────────────────────────────

section('XLSX with multiple sheets — uses first sheet only');
{
  const XLSX = await import('xlsx');
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['descripcion_corta','marca','condicion','precio'],
    ['Heladera Samsung no frost 320 litros blanca nueva','Samsung','nuevo','250000'],
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([['This is a second sheet', 'should be ignored']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Productos');
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const { csv: csvText } = await parseXlsxBuffer(buf);
  const result = await parseCsvText(csvText);
  ok(result.rows.length === 1, `Only 1 data row from sheet 1 (got ${result.rows.length})`);
}

// ─── Edge cases ───────────────────────────────────────────────────────────────

section('Edge cases');
{
  const emptyResult = await parseCsvText('');
  ok(emptyResult.rows.length === 0, 'Empty string → 0 rows');

  const headerOnly = await parseCsvText('titulo,descripcion_corta,precio');
  ok(headerOnly.rows.length === 0, 'Header-only → 0 rows');

  const allEmpty = await parseCsvText('titulo,descripcion_corta\n,,');
  ok(allEmpty.rows.length === 0, 'All-empty data row → 0 rows');

  // Row with only whitespace in all fields
  const whitespace = await parseCsvText('titulo,descripcion_corta\n   ,   ');
  ok(whitespace.rows.length === 0, 'Whitespace-only row → 0 rows');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(52)}`);
const total = passed + failed;
console.log(`Results: ${passed}/${total} passed`);
if (failed > 0) {
  console.error(`FAILED: ${failed} test(s)`);
  process.exit(1);
} else {
  console.log('All tests passed ✓');
}

} // end main

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
