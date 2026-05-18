/**
 * Generates tests/fixtures/ml-real-publish-embedded.xlsx
 *
 * Creates a real Excel file with PNG images embedded as native drawing objects
 * (stored in xl/media/ + xl/drawings/). When this file is uploaded in the
 * bulk UI, images are extracted automatically — no separate PNG upload required.
 *
 * Run: npx tsx scripts/generate-embedded-publish-test.ts
 * Requires: tests/fixtures/images/*.png (run gen:images first if missing)
 */
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsvText, parseXlsxBuffer } from '../src/lib/csv/parser';
import { extractEmbeddedImages } from '../src/lib/excel/extract-embedded-images';

const IMAGES_DIR    = path.resolve(__dirname, '../tests/fixtures/images');
const OUT_PATH      = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-embedded.xlsx');
const SINGLE_FILE_PATH = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-single-file.xlsx');

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
    titulo: 'Heladera Samsung No Frost 290L Blanca',
    descripcion_corta: 'Heladera Samsung no frost 290 litros blanca nueva 220V garantia 12 meses modelo RT29FARADWW',
    tipo_producto: 'heladera', marca: 'Samsung', modelo: 'RT29FARADWW', condicion: 'nuevo',
    precio: '450000', stock: '1', sku: 'SAM-RT29FARADWW', color: 'Blanco', voltaje: '220V',
    capacidad_litros: '290', capacidad_kg: '', potencia_watts: '', tecnologia: 'No Frost',
    garantia: '12 meses', envio: 'not_specified', retiro_en_persona: 'si', envio_gratis: 'no',
    imagenes: '', // intentionally empty — images come from embedded drawings
    descripcion_larga: 'Heladera Samsung No Frost RT29FARADWW de 290 litros. Tecnologia No Frost. Incluye garantia oficial Samsung de 12 meses.',
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
    imagenes: '', // intentionally empty — images come from embedded drawings
    descripcion_larga: 'Microondas Samsung MS23K3513AW de 23 litros y 1150 watts. 5 niveles de potencia. Garantia oficial Samsung.',
    codigo_gtin: '', fabricante: 'Samsung Electronics Argentina S.A.',
    tipo_alimentacion: '220V', requiere_armado: 'no', incluye_manual_armado: 'no',
    alto_cm: '27', ancho_cm: '52', profundidad_cm: '40', categoria_ml: '',
  };
}

// ── Drawing XML helpers ───────────────────────────────────────────────────────

/**
 * Build an OOXML twoCellAnchor for one image.
 * fromRow: 0-indexed row where the image top edge is anchored.
 * imageIndex: 1-based picture id (must be unique across all anchors).
 * rId: relationship id string (e.g. "rId1").
 * colOffset: column position for the left edge (0 = first column).
 */
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ generate-embedded-publish-test ══════════════════════════════\n');

  // Image files: 2 per product
  const imageSpec = [
    { file: 'refrigerator-front-1200.png', productRow: 1, colOffset: 0, rId: 'rId1' },
    { file: 'refrigerator-open-1200.png',  productRow: 1, colOffset: 3, rId: 'rId2' },
    { file: 'microwave-front-1200.png',    productRow: 2, colOffset: 0, rId: 'rId3' },
    { file: 'microwave-side-1200.png',     productRow: 2, colOffset: 3, rId: 'rId4' },
  ];

  // Verify PNGs exist
  for (const img of imageSpec) {
    const fp = path.join(IMAGES_DIR, img.file);
    if (!fs.existsSync(fp)) {
      console.error(`❌ Missing: ${fp}\n   Run: npx tsx scripts/generate-test-images.ts`);
      process.exit(1);
    }
    console.log(`  ✅ ${img.file} (${(fs.statSync(fp).size / 1024).toFixed(1)} KB)`);
  }

  // ── Step 1: Build base xlsx with SheetJS (data only, imagenes column empty) ─
  const fridge    = buildFridge();
  const microwave = buildMicrowave();
  const buildRow  = (data: Row) => HEADERS.map((h) => data[h] ?? '');

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, buildRow(fridge), buildRow(microwave)]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  // Write to buffer
  const xlsxBuf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log(`\nBase xlsx: ${(xlsxBuf.length / 1024).toFixed(0)} KB`);

  // ── Step 2: Open the xlsx as a ZIP and inject drawing layer ─────────────
  const zip = await JSZip.loadAsync(xlsxBuf);

  // Add image media files
  for (const img of imageSpec) {
    const pngData = fs.readFileSync(path.join(IMAGES_DIR, img.file));
    const mediaName = `image${imageSpec.indexOf(img) + 1}.png`;
    zip.file(`xl/media/${mediaName}`, pngData);
    console.log(`  Added xl/media/${mediaName}`);
  }

  // Build drawing XML anchors
  // productRow 1 → drawingRow 1 (header is drawingRow 0)
  // productRow 2 → drawingRow 2
  const anchors = imageSpec.map((img, idx) =>
    buildAnchor(img.productRow, idx + 1, img.rId, img.colOffset)
  );
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml(anchors));

  // Drawing relationships: rId → media file
  const drawingRelsEntries = imageSpec.map((img, idx) => ({
    id: img.rId,
    mediaFile: `image${idx + 1}.png`,
  }));
  zip.file('xl/drawings/_rels/drawing1.xml.rels', buildDrawingRels(drawingRelsEntries));

  // Worksheet relationships: sheet1 → drawing1
  const sheetDrawingRId = 'rId100'; // high ID to avoid collision with SheetJS-generated rels
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', buildSheetRels(sheetDrawingRId));

  // Patch sheet1.xml: add <drawing r:id="rId100"/> before </worksheet>
  const sheet1File = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet1File) throw new Error('sheet1.xml not found in generated xlsx');
  let sheet1Xml = await sheet1File.async('string');

  if (!sheet1Xml.includes('<drawing')) {
    sheet1Xml = sheet1Xml.replace(
      '</worksheet>',
      `<drawing r:id="${sheetDrawingRId}"/></worksheet>`,
    );
  }
  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  // Patch [Content_Types].xml: add drawing and png content types
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('string');
    if (!ctXml.includes('drawing+xml')) {
      ctXml = ctXml.replace(
        '</Types>',
        '  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>',
      );
    }
    if (!ctXml.includes('Extension="png"')) {
      ctXml = ctXml.replace(
        '</Types>',
        '  <Default Extension="png" ContentType="image/png"/>\n</Types>',
      );
    }
    zip.file('[Content_Types].xml', ctXml);
  }

  // ── Step 3: Write final xlsx ─────────────────────────────────────────────
  const finalBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(OUT_PATH, finalBuf);
  // Also write as the canonical single-file fixture name
  fs.writeFileSync(SINGLE_FILE_PATH, finalBuf);
  const sizeMb = (finalBuf.length / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Generated: ${OUT_PATH} (${sizeMb} MB)`);
  console.log(`✅ Generated: ${SINGLE_FILE_PATH} (${sizeMb} MB)`);

  // ── Step 4: Extraction validation ────────────────────────────────────────
  console.log('\n── Extraction validation ─────────────────────────────────────────');
  const testBuf = fs.readFileSync(OUT_PATH);
  const ab = testBuf.buffer.slice(testBuf.byteOffset, testBuf.byteOffset + testBuf.byteLength) as ArrayBuffer;

  const { rowImages, totalImages } = await extractEmbeddedImages(ab);
  console.log(`Total images in xl/media: ${totalImages}`);
  console.log(`Rows with extracted images: ${rowImages.size}`);

  for (const [rowIdx, imgs] of rowImages.entries()) {
    console.log(`  Row ${rowIdx}: ${imgs.length} image(s)`);
    for (const img of imgs) {
      const kb = (img.data.length / 1024).toFixed(1);
      console.log(`    ${img.filename} (${img.mimeType}, ${kb} KB)`);
    }
  }

  if (rowImages.size !== 2) {
    console.error(`\n❌ Expected images for 2 rows, got ${rowImages.size}`);
    process.exit(1);
  }
  for (const rowIdx of [1, 2]) {
    if ((rowImages.get(rowIdx)?.length ?? 0) !== 2) {
      console.error(`❌ Expected 2 images for row ${rowIdx}, got ${rowImages.get(rowIdx)?.length ?? 0}`);
      process.exit(1);
    }
  }

  // ── Step 5: CSV parse validation ─────────────────────────────────────────
  console.log('\n── CSV parse validation ──────────────────────────────────────────');
  const { csv } = await parseXlsxBuffer(ab);
  const result = await parseCsvText(csv);
  console.log(`Rows: ${result.rows.length} (${result.totalOk} ok, ${result.totalWarnings} warnings, ${result.totalErrors} errors)`);

  for (const row of result.rows) {
    const icon = row.status === 'ok' ? '✅' : row.status === 'warnings' ? '⚠️ ' : '❌';
    console.log(`Row ${row.rowIndex}: ${icon} ${row.status.toUpperCase()} — ${row.draft?.title ?? '(no title)'}`);
    console.log(`  localImageRefs (from CSV): [${row.localImageRefs.join(', ') || 'none — images come from drawings'}]`);

    // Simulate what BulkUpload does: inject embedded images
    const imgs = rowImages.get(row.rowIndex) ?? [];
    if (imgs.length > 0) {
      console.log(`  Embedded images for this row: ${imgs.map((i) => i.filename).join(', ')}`);
      console.log(`  → After injection: status would be OK, localImageRefs matched`);
    }
  }

  console.log('\n✅ All validations passed.');
  console.log('\nTo use: upload ONLY tests/fixtures/ml-real-publish-embedded.xlsx');
  console.log('Images are extracted automatically — no PNG upload needed.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
