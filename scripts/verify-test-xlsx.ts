/**
 * Verifies tests/fixtures/test-products-appliances.xlsx through the real parser.
 * Run: npx tsx scripts/verify-test-xlsx.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

async function main() {
  const filePath = path.resolve(__dirname, '../tests/fixtures/test-products-appliances.xlsx');
  const buffer = fs.readFileSync(filePath);
  const csvText = await parseXlsxBuffer(buffer.buffer as ArrayBuffer);
  const result = await parseCsvText(csvText);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  XLSX PARSER VERIFICATION — test-products-appliances.xlsx');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total rows parsed : ${result.rows.length}`);
  console.log(`  ✅ ok             : ${result.totalOk}`);
  console.log(`  ⚠️  warnings       : ${result.totalWarnings}`);
  console.log(`  ❌ errors         : ${result.totalErrors}`);
  console.log('');

  const EXPECTED: Array<{ label: string; status: 'ok' | 'warnings' | 'error' }> = [
    { label: 'Heladera Samsung 320L (valid)',            status: 'ok' },
    { label: 'Lavarropas LG 9kg (valid)',                status: 'ok' },
    { label: 'Microondas Whirlpool 25L (valid)',         status: 'ok' },
    { label: 'Freidora Philips 4.1L (valid)',            status: 'ok' },
    { label: 'Aspiradora Dyson V10 (valid)',             status: 'ok' },
    { label: 'Licuadora Oster 750W (valid)',             status: 'ok' },
    { label: 'Horno Ultracomb sin imágenes (warning)',   status: 'warnings' },
    { label: 'Lavarropas sin condición (warning)',       status: 'warnings' },
    { label: 'Microondas sin marca (warning)',           status: 'warnings' },
    { label: 'Heladera sin descripcion_corta (error)',     status: 'error' },
    { label: 'Freidora marca garbage (error)',           status: 'error' },
    { label: 'Aspiradora URL inválida (error)',          status: 'error' },
  ];

  let passed = 0;
  let failed = 0;

  result.rows.forEach((row, i) => {
    const expected = EXPECTED[i];
    const ok = row.status === expected?.status;
    if (ok) passed++;
    else failed++;

    const icon = ok ? '✅' : '❌';
    const statusLabel = row.status.padEnd(8);
    console.log(`  Row ${String(row.rowIndex).padStart(2)} ${icon} [${statusLabel}] ${expected?.label ?? '?'}`);

    if (row.errors.length > 0) {
      row.errors.forEach((e) => console.log(`           error: ${e}`));
    }
    if (row.missingFields.length > 0) {
      console.log(`           missing: ${row.missingFields.map((f) => f.label).join(', ')}`);
    }
    if (!ok) {
      console.log(`           EXPECTED status="${expected?.status}" but got "${row.status}"`);
    }
  });

  console.log('');
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Result: ${passed}/${EXPECTED.length} assertions passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
