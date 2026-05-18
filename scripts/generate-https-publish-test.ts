/**
 * Generates tests/fixtures/ml-real-publish-https.xlsx
 * Same 2 products as ml-real-publish-final.xlsx but with HTTPS image URLs
 * so the user only needs to upload ONE file — no separate PNG upload required.
 *
 * Run: npx tsx scripts/generate-https-publish-test.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';

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

// Public HTTPS image URLs — no local file upload needed
const FRIDGE_IMG1  = 'https://placehold.co/1200x1200/FFFFFF/333333.png?text=Heladera+Samsung+RT29FARADWW';
const FRIDGE_IMG2  = 'https://placehold.co/1200x1200/F5F5F5/333333.png?text=Heladera+Samsung+Abierta';
const MICRO_IMG1   = 'https://placehold.co/1200x1200/FFFFFF/333333.png?text=Microondas+Samsung+MS23K3513AW';
const MICRO_IMG2   = 'https://placehold.co/1200x1200/F5F5F5/333333.png?text=Microondas+Samsung+Lateral';

type Row = Record<string, string>;

function buildFridge(): Row {
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
    imagenes:           `${FRIDGE_IMG1}|${FRIDGE_IMG2}`,
    descripcion_larga:  [
      'Heladera Samsung No Frost RT29FARADWW de 290 litros.',
      'Tecnologia No Frost: elimina la escarcha automaticamente.',
      'Capacidad total: 290 litros (210L heladera + 80L freezer).',
      'Panel de control en la puerta. Alarma de puerta abierta.',
      'Iluminacion LED interior. Estantes de vidrio templado.',
      'Incluye garantia oficial Samsung de 12 meses.',
    ].join(' '),
    codigo_gtin:           '7709545018831',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    alto_cm:               '172',
    ancho_cm:              '60',
    profundidad_cm:        '65',
    categoria_ml:          '',
  };
}

function buildMicrowave(): Row {
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
    imagenes:           `${MICRO_IMG1}|${MICRO_IMG2}`,
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
    alto_cm:               '27',
    ancho_cm:              '52',
    profundidad_cm:        '40',
    categoria_ml:          '',
  };
}

async function main() {
  console.log('\n══ generate-https-publish-test ════════════════════════════════\n');

  const fridge    = buildFridge();
  const microwave = buildMicrowave();

  const buildRow = (data: Row) => HEADERS.map((h) => data[h] ?? '');
  const dataRows = [fridge, microwave].map(buildRow);

  const instrRows: string[][] = [
    ['ARCHIVO DE TEST — PUBLICACION EN MERCADO LIBRE (URLs HTTPS)'],
    [''],
    ['Este archivo usa URLs de imagen públicas — NO se necesitan PNGs separados.'],
    ['Solo subí ESTE archivo en FastPublisher → modo bulk → "Subir archivo".'],
    [''],
    ['PRODUCTOS'],
    ['Heladera Samsung No Frost 290L — $450.000'],
    ['Microondas Samsung 23L 1150W  — $115.000'],
    [''],
    ['IMAGENES'],
    ['Las imágenes son URLs públicas de placehold.co (1200×1200).'],
    ['Para publicación real en ML, reemplazá con URLs de imágenes reales del producto.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));

  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const outDir = path.resolve(__dirname, '../tests/fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ml-real-publish-https.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`✅ Generated: ${outPath}`);

  // Parse + validate
  const fileBuffer = fs.readFileSync(outPath);
  const ab = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
  const { csv: csvText } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csvText);

  console.log(`\nRows: ${result.rows.length} (${result.totalOk} ok, ${result.totalWarnings} warnings, ${result.totalErrors} errors)`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    console.log(`Row ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${row.draft?.title ?? row.errors[0]}`);
    console.log(`  localImageRefs : ${row.localImageRefs.length === 0 ? '(none — HTTPS only)' : row.localImageRefs.join(', ')}`);
    console.log(`  images         : ${row.draft?.images.map((i) => i.substring(0, 60) + (i.length > 60 ? '…' : '')).join(', ')}`);
    if (row.errors.length > 0) console.log(`  errors: ${row.errors.join('; ')}`);
  }

  if (result.totalErrors > 0) {
    console.error('\n❌ Parse errors — fixture has invalid rows');
    process.exit(1);
  }

  console.log('\n✅ Ready. Upload tests/fixtures/ml-real-publish-https.xlsx — no PNGs needed.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
