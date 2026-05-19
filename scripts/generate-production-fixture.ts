/**
 * Generates tests/fixtures/ml-real-publish-production.xlsx
 *
 * Two products (Heladera + Microondas) with:
 *  - Confirmed leaf ML category IDs (via domain_discovery API)
 *  - 1200×1200 PNG images embedded as native OOXML drawing objects
 *  - GTIN, dimensions, manufacturer, power supply type, warranty
 *  - All required ML attributes for real publishing
 *
 * This is the recommended fixture for production publishing tests.
 * Upload a single file — no separate PNG upload needed.
 *
 * Run: npx tsx scripts/generate-production-fixture.ts
 * Requires: npm run gen:images (to create tests/fixtures/images/*.png)
 */
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import { extractEmbeddedImages } from '../src/lib/excel/extract-embedded-images';

const IMAGES_DIR = path.resolve(__dirname, '../tests/fixtures/images');
const OUT_PATH   = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-production.xlsx');

// Confirmed leaf categories via GET /sites/MLA/domain_discovery/search (no auth needed)
// Verified: children_categories: 0, listing_allowed: true
const FRIDGE_CATEGORY_ID    = 'MLA398582'; // Electrodomésticos > Refrigeración > Heladeras
const MICROWAVE_CATEGORY_ID = 'MLA1577';   // Electrodomésticos > Cocción > Microondas

const HEADERS = [
  'titulo', 'descripcion_corta', 'tipo_producto', 'marca', 'modelo', 'condicion',
  'precio', 'stock', 'sku', 'color', 'voltaje', 'capacidad_litros', 'capacidad_kg',
  'potencia_watts', 'tecnologia', 'garantia', 'envio', 'retiro_en_persona',
  'envio_gratis', 'imagenes', 'descripcion_larga', 'codigo_gtin', 'fabricante',
  'tipo_alimentacion', 'requiere_armado', 'incluye_manual_armado',
  'alto_cm', 'ancho_cm', 'profundidad_cm', 'categoria_ml',
];

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
    imagenes:           '',
    descripcion_larga:  [
      'Heladera Samsung No Frost RT29FARADWW de 290 litros.',
      'Tecnologia No Frost elimina la escarcha automaticamente.',
      'Capacidad total 290 litros (210L heladera mas 80L freezer).',
      'Panel de control en la puerta. Alarma de puerta abierta.',
      'Iluminacion LED interior. Estantes de vidrio templado.',
      'Garantia oficial Samsung de 12 meses.',
    ].join(' '),
    codigo_gtin:           '7709545018831',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    alto_cm:               '172',
    ancho_cm:              '60',
    profundidad_cm:        '65',
    categoria_ml:          FRIDGE_CATEGORY_ID,
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
    imagenes:           '',
    descripcion_larga:  [
      'Microondas Samsung MS23K3513AW de 23 litros y 1150 watts.',
      'Panel de control con perillas de tiempo y potencia.',
      '5 niveles de potencia ajustables.',
      'Funcion de descongelado automatico por peso.',
      'Plato giratorio de vidrio de 28.8 cm de diametro.',
      'Garantia oficial Samsung de 12 meses.',
    ].join(' '),
    codigo_gtin:           '7709545018848',
    fabricante:            'Samsung Electronics Argentina S.A.',
    tipo_alimentacion:     '220V',
    requiere_armado:       'no',
    incluye_manual_armado: 'no',
    alto_cm:               '27',
    ancho_cm:              '52',
    profundidad_cm:        '40',
    categoria_ml:          MICROWAVE_CATEGORY_ID,
  };
}

// ── OOXML drawing helpers ─────────────────────────────────────────────────────

function buildAnchor(fromRow: number, imageIndex: number, rId: string, colOffset: number): string {
  return `
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>${colOffset}</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${colOffset + 2}</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>${fromRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="${imageIndex + 1}" name="Picture ${imageIndex}"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="${rId}"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
}

function buildDrawingXml(anchors: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors.join('\n')}
</xdr:wsDr>`;
}

function buildDrawingRels(entries: Array<{ id: string; mediaFile: string }>): string {
  const rels = entries
    .map((e) => `  <Relationship Id="${e.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${e.mediaFile}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`;
}

function buildSheetRels(drawingRId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
}

// ── Read PNG dimensions (for verification) ────────────────────────────────────

function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const sig = buf.slice(0, 8);
  if (!sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ generate-production-fixture ═════════════════════════════════\n');
  console.log('Category IDs:');
  console.log(`  Heladera   → ${FRIDGE_CATEGORY_ID}  (Electrodomésticos > Refrigeración > Heladeras)`);
  console.log(`  Microondas → ${MICROWAVE_CATEGORY_ID}   (Electrodomésticos > Cocción > Microondas)`);
  console.log();

  const imageSpec = [
    { file: 'refrigerator-front-1200.png', productRow: 1, colOffset: 0, rId: 'rId1' },
    { file: 'refrigerator-open-1200.png',  productRow: 1, colOffset: 3, rId: 'rId2' },
    { file: 'microwave-front-1200.png',    productRow: 2, colOffset: 0, rId: 'rId3' },
    { file: 'microwave-side-1200.png',     productRow: 2, colOffset: 3, rId: 'rId4' },
  ];

  console.log('── Image file check + dimension validation ──────────────────────');
  for (const img of imageSpec) {
    const fp = path.join(IMAGES_DIR, img.file);
    if (!fs.existsSync(fp)) {
      console.error(`❌ Missing: ${fp}\n   Run: npm run gen:images`);
      process.exit(1);
    }
    const buf = fs.readFileSync(fp);
    const dims = readPngDimensions(buf);
    const sizeKB = (buf.length / 1024).toFixed(1);
    if (!dims) {
      console.error(`❌ ${img.file}: not a valid PNG`);
      process.exit(1);
    }
    if (dims.width < 500 || dims.height < 500) {
      console.error(`❌ ${img.file}: ${dims.width}×${dims.height} px — ML requires minimum 500×500`);
      process.exit(1);
    }
    const sizeOk = dims.width >= 1200 && dims.height >= 1200;
    console.log(`  ${sizeOk ? '✅' : '⚠️ '} ${img.file}  ${dims.width}×${dims.height} px  ${sizeKB} KB${!sizeOk ? '  (< 1200×1200 recommended)' : ''}`);
  }
  console.log();

  // ── Build xlsx data layer ─────────────────────────────────────────────────
  const fridge    = buildFridge();
  const microwave = buildMicrowave();
  const buildRow  = (data: Row) => HEADERS.map((h) => data[h] ?? '');

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, buildRow(fridge), buildRow(microwave)]);
  ws['!cols'] = HEADERS.map(() => ({ wch: 22 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  const xlsxBuf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // ── Inject drawing layer ──────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(xlsxBuf);

  for (const img of imageSpec) {
    const pngData   = fs.readFileSync(path.join(IMAGES_DIR, img.file));
    const mediaName = `image${imageSpec.indexOf(img) + 1}.png`;
    zip.file(`xl/media/${mediaName}`, pngData);
  }

  const anchors = imageSpec.map((img, idx) =>
    buildAnchor(img.productRow, idx + 1, img.rId, img.colOffset)
  );
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml(anchors));

  const drawingRelsEntries = imageSpec.map((img, idx) => ({
    id: img.rId,
    mediaFile: `image${idx + 1}.png`,
  }));
  zip.file('xl/drawings/_rels/drawing1.xml.rels', buildDrawingRels(drawingRelsEntries));

  const sheetDrawingRId = 'rId100';
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', buildSheetRels(sheetDrawingRId));

  const sheet1File = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet1File) throw new Error('sheet1.xml not found');
  let sheet1Xml = await sheet1File.async('string');
  if (!sheet1Xml.includes('<drawing')) {
    sheet1Xml = sheet1Xml.replace('</worksheet>', `<drawing r:id="${sheetDrawingRId}"/></worksheet>`);
  }
  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('string');
    if (!ctXml.includes('drawing+xml')) {
      ctXml = ctXml.replace('</Types>', '  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
    }
    if (!ctXml.includes('Extension="png"')) {
      ctXml = ctXml.replace('</Types>', '  <Default Extension="png" ContentType="image/png"/>\n</Types>');
    }
    zip.file('[Content_Types].xml', ctXml);
  }

  const finalBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(OUT_PATH, finalBuf);
  console.log(`✅ Generated: ${OUT_PATH}  (${(finalBuf.length / 1024 / 1024).toFixed(2)} MB)\n`);

  // ── Validate extraction ───────────────────────────────────────────────────
  console.log('── Extraction validation ────────────────────────────────────────');
  const testBuf = fs.readFileSync(OUT_PATH);
  const ab = testBuf.buffer.slice(testBuf.byteOffset, testBuf.byteOffset + testBuf.byteLength) as ArrayBuffer;

  const { rowImages, totalImages } = await extractEmbeddedImages(ab);
  console.log(`Images in xl/media: ${totalImages}`);
  console.log(`Rows with images:   ${rowImages.size}`);

  for (const [rowIdx, imgs] of rowImages.entries()) {
    console.log(`  Row ${rowIdx}: ${imgs.map((i) => `${i.filename} (${(i.data.length / 1024).toFixed(1)} KB)`).join(', ')}`);
  }

  if (rowImages.size !== 2) {
    console.error(`❌ Expected images for 2 rows, got ${rowImages.size}`);
    process.exit(1);
  }

  // ── Parse validation ──────────────────────────────────────────────────────
  console.log('\n── Parse validation ─────────────────────────────────────────────');
  const { csv } = await parseXlsxBuffer(ab);
  const result  = await parseCsvText(csv);
  console.log(`Rows: ${result.rows.length}  ok=${result.totalOk}  warnings=${result.totalWarnings}  errors=${result.totalErrors}`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    const cat  = row.draft?.officialCategoryId ?? row.draft?.mlCategoryId ?? '(none)';
    console.log(`  Row ${row.rowIndex}: ${icon} ${row.draft?.title ?? '?'}`);
    console.log(`    categoria_ml: ${cat}`);
    console.log(`    gtin: ${row.draft?.gtin ?? '(none)'}`);
    console.log(`    embedded images: ${(rowImages.get(row.rowIndex) ?? []).length}`);
    if (row.errors?.length) console.log(`    errors: ${row.errors.join('; ')}`);
  }

  if (result.rows.filter((r) => r.status !== 'error').length < 2) {
    console.error('\n❌ Expected 2 rows ready, found fewer');
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ Production fixture ready.\n');
  console.log('Upload this file: tests/fixtures/ml-real-publish-production.xlsx');
  console.log('No separate PNG upload needed — 4 images embedded in the Excel.\n');
  console.log('Expected image requirements:');
  console.log('  • Min 500×500 px per image ✓');
  console.log('  • Recommended 1200×1200 px ✓');
  console.log('  • Format: PNG ✓');
  console.log('  • White background (test images — replace with real photos for production)\n');
  console.log('After "Preparar publicación":');
  console.log(`  Row 1 (Heladera):   categoria → ${FRIDGE_CATEGORY_ID}  (Heladeras)`);
  console.log(`  Row 2 (Microondas): categoria → ${MICROWAVE_CATEGORY_ID}  (Microondas)`);
  console.log('  All images: uploaded to ML CDN → https://http2.mlstatic.com/...');
}

main().catch((err) => { console.error(err); process.exit(1); });
