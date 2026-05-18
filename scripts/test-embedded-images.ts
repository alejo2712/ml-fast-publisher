/**
 * Regression tests for embedded Excel image extraction.
 * Run: npm run test:embedded-images
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { extractEmbeddedImages } from '../src/lib/excel/extract-embedded-images';
import { parseXlsxBuffer, parseCsvText } from '../src/lib/csv/parser';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

const FIXTURE  = path.resolve(__dirname, '../tests/fixtures/ml-real-publish-embedded.xlsx');
const IMG_DIR  = path.resolve(__dirname, '../tests/fixtures/images');

// ── Helper: build a minimal xlsx WITH drawings via JSZip ──────────────────────

async function buildWorkbookWithImages(
  imageFiles: Array<{ data: Buffer; name: string }>,
  drawingRows: number[], // 0-indexed drawing row per image
): Promise<ArrayBuffer> {
  const ws  = XLSX.utils.aoa_to_sheet([['titulo', 'precio'], ['Test', '100']]);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  const xlsxBuf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const zip = await JSZip.loadAsync(xlsxBuf);

  // Add media
  const drawingAnchors: string[] = [];
  const drawingRels: string[] = [];
  imageFiles.forEach((img, idx) => {
    const mediaName = `image${idx + 1}.png`;
    zip.file(`xl/media/${mediaName}`, img.data);
    const rId = `rId${idx + 1}`;
    const fromRow = drawingRows[idx];
    drawingAnchors.push(
      `<xdr:twoCellAnchor editAs="oneCell">` +
      `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${idx + 2}" name="Pic${idx + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
      `</xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`
    );
    drawingRels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`);
  });

  zip.file('xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    drawingAnchors.join('') + `</xdr:wsDr>`
  );
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    drawingRels.join('') + `</Relationships>`
  );
  zip.file('xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
    `</Relationships>`
  );

  let sheet1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  if (!sheet1.includes('<drawing')) {
    sheet1 = sheet1.replace('</worksheet>', '<drawing r:id="rId100"/></worksheet>');
  }
  zip.file('xl/worksheets/sheet1.xml', sheet1);

  let ct = await zip.file('[Content_Types].xml')!.async('string');
  if (!ct.includes('drawing+xml')) {
    ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
  }
  if (!ct.includes('Extension="png"')) {
    ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/>\n</Types>');
  }
  zip.file('[Content_Types].xml', ct);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function buildWorkbookNoImages(): Promise<ArrayBuffer> {
  const ws  = XLSX.utils.aoa_to_sheet([['titulo', 'precio'], ['Test', '100']]);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  test-embedded-images');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ── A. Fixture file exists ────────────────────────────────────────────────
  console.log('══ A. Fixture file ══════════════════════════════════════════════\n');
  assert(fs.existsSync(FIXTURE), 'ml-real-publish-embedded.xlsx exists');
  const fixtureSize = fs.existsSync(FIXTURE) ? fs.statSync(FIXTURE).size : 0;
  assert(fixtureSize > 5_000, `fixture is > 5 KB (got ${(fixtureSize / 1024).toFixed(0)} KB)`);
  console.log();

  // ── B. No-image workbook → empty extraction ───────────────────────────────
  console.log('══ B. No-image workbook ═════════════════════════════════════════\n');
  const noImgBuf = await buildWorkbookNoImages();
  const noImgResult = await extractEmbeddedImages(noImgBuf);
  assert(noImgResult.rowImages.size === 0, 'no-image workbook → rowImages is empty');
  assert(noImgResult.totalImages === 0, 'no-image workbook → totalImages = 0');
  console.log();

  // ── C. Single-image workbook (row 1) ─────────────────────────────────────
  console.log('══ C. Single-image workbook ═════════════════════════════════════\n');
  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]); // PNG header
  const singleImgBuf = await buildWorkbookWithImages([{ data: fakePng, name: 'test.png' }], [1]);
  const singleResult = await extractEmbeddedImages(singleImgBuf);
  assert(singleResult.totalImages === 1, 'single image → totalImages = 1');
  assert(singleResult.rowImages.size === 1, 'single image → rowImages has 1 entry');
  assert(singleResult.rowImages.has(1), 'single image anchored at drawingRow 1 → productRowIndex 1');
  assert((singleResult.rowImages.get(1)?.length ?? 0) === 1, 'row 1 has exactly 1 image');
  assert(singleResult.rowImages.get(1)?.[0].mimeType === 'image/png', 'mimeType is image/png');
  assert(singleResult.rowImages.get(1)?.[0].filename.startsWith('__emb__') ?? false, 'filename uses synthetic __emb__ prefix');
  console.log();

  // ── D. Two-product workbook (2 images per row) ────────────────────────────
  console.log('══ D. Two-product workbook (2 images each) ══════════════════════\n');
  const twoRowBuf = await buildWorkbookWithImages(
    [
      { data: fakePng, name: 'prod1a.png' },
      { data: fakePng, name: 'prod1b.png' },
      { data: fakePng, name: 'prod2a.png' },
      { data: fakePng, name: 'prod2b.png' },
    ],
    [1, 1, 2, 2], // rows 1 and 2 get 2 images each
  );
  const twoRowResult = await extractEmbeddedImages(twoRowBuf);
  assert(twoRowResult.totalImages === 4, 'two-row workbook → 4 total images');
  assert(twoRowResult.rowImages.size === 2, 'two-row workbook → 2 rows with images');
  assert((twoRowResult.rowImages.get(1)?.length ?? 0) === 2, 'row 1 has 2 images');
  assert((twoRowResult.rowImages.get(2)?.length ?? 0) === 2, 'row 2 has 2 images');
  assert(!twoRowResult.rowImages.has(0), 'header row (0) has no images');
  console.log();

  // ── E. Fixture extraction ─────────────────────────────────────────────────
  console.log('══ E. Fixture extraction ════════════════════════════════════════\n');
  if (fs.existsSync(FIXTURE)) {
    const fixtureBuf = fs.readFileSync(FIXTURE);
    const fixtureAb  = fixtureBuf.buffer.slice(fixtureBuf.byteOffset, fixtureBuf.byteOffset + fixtureBuf.byteLength) as ArrayBuffer;
    const fResult = await extractEmbeddedImages(fixtureAb);
    assert(fResult.totalImages === 4, 'fixture has 4 media images');
    assert(fResult.rowImages.size === 2, 'fixture has images for 2 product rows');
    assert((fResult.rowImages.get(1)?.length ?? 0) === 2, 'row 1 (heladera) has 2 images');
    assert((fResult.rowImages.get(2)?.length ?? 0) === 2, 'row 2 (microondas) has 2 images');
    const row1Size = fResult.rowImages.get(1)?.[0].data.length ?? 0;
    assert(row1Size > 10_000, `extracted image data is real (${(row1Size / 1024).toFixed(0)} KB > 10 KB)`);
  }
  console.log();

  // ── F. parseXlsxBuffer returns perRowImages ───────────────────────────────
  console.log('══ F. parseXlsxBuffer integration ══════════════════════════════\n');
  if (fs.existsSync(FIXTURE)) {
    const fixtureBuf = fs.readFileSync(FIXTURE);
    const fixtureAb  = fixtureBuf.buffer.slice(fixtureBuf.byteOffset, fixtureBuf.byteOffset + fixtureBuf.byteLength) as ArrayBuffer;
    const { csv, perRowImages } = await parseXlsxBuffer(fixtureAb);
    assert(typeof csv === 'string' && csv.length > 0, 'parseXlsxBuffer returns csv string');
    assert(perRowImages.size === 2, 'parseXlsxBuffer returns perRowImages with 2 rows');
    const result = await parseCsvText(csv);
    assert(result.rows.length === 2, '2 rows parsed from fixture CSV');
    // Simulate BulkUpload injection
    for (const row of result.rows) {
      const imgs = perRowImages.get(row.rowIndex) ?? [];
      assert(imgs.length === 2, `row ${row.rowIndex} gets ${imgs.length} injected images`);
    }
    // localImageRefs from CSV should be empty (imagenes column is blank)
    assert(result.rows.every((r) => r.localImageRefs.length === 0),
      'CSV localImageRefs are empty (imagenes column blank — images come from drawings)');
  }
  console.log();

  // ── G. Real PNG files present ─────────────────────────────────────────────
  console.log('══ G. Source PNG files ══════════════════════════════════════════\n');
  for (const f of ['refrigerator-front-1200.png', 'refrigerator-open-1200.png', 'microwave-front-1200.png', 'microwave-side-1200.png']) {
    const fp = path.join(IMG_DIR, f);
    assert(fs.existsSync(fp), `${f} exists`);
  }
  console.log();

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${passed + failed} passed`);
  console.log();
  if (failed > 0) {
    console.log(`❌ ${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('✅ All assertions passed.');
  console.log();
  console.log('Expected UI after uploading ml-real-publish-embedded.xlsx:');
  console.log('  • No image upload panel shown (no localImageRefs from CSV)');
  console.log('  • 2 rows, both status OK after image injection');
  console.log('  • "Preparar publicación" enabled immediately');
  console.log('  • No "Imágenes locales no encontradas" in confirm modal');
}

main().catch((err) => { console.error(err); process.exit(1); });
