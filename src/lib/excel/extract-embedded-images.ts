/**
 * Extract images embedded as Excel drawing objects from an .xlsx file.
 *
 * An xlsx is a ZIP archive. When you embed images in Excel (Insert → Pictures),
 * the image data is stored in xl/media/ and anchored to worksheet rows via
 * xl/drawings/drawing1.xml using OOXML twoCellAnchor / oneCellAnchor elements.
 *
 * This module reads those structures and returns a map from product row index
 * (1-based, header = row 0) to the image data for each row.
 *
 * Works in both Node.js (scripts) and browser (BulkUpload component).
 */

export interface EmbeddedImage {
  /** Raw image bytes */
  data: Uint8Array;
  mimeType: string;
  /** Synthetic filename used as imageFiles Map key — unique per row+image */
  filename: string;
}

export interface EmbeddedImageExtraction {
  /** 1-based product row index → images found in that row's drawing anchor */
  rowImages: Map<number, EmbeddedImage[]>;
  totalImages: number;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Extract all matches of a regex (with /g flag) as an array */
function matchAll(xml: string, re: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = r.exec(xml)) !== null) results.push(m);
  return results;
}

/**
 * Find the xlsx file path for a given sheet r:id by reading workbook relationships.
 * Returns a path relative to the ZIP root, e.g. "xl/worksheets/sheet1.xml".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveSheetPath(zip: any, sheetRId: string): Promise<string | null> {
  const wbRels = zip.file('xl/_rels/workbook.xml.rels');
  if (!wbRels) return null;
  const xml = await wbRels.async('string');
  const m = new RegExp(`Id="${sheetRId}"[^>]*Target="([^"]+)"`).exec(xml)
    ?? new RegExp(`Target="([^"]+)"[^>]*Id="${sheetRId}"`).exec(xml);
  if (!m) return null;
  const target = m[1]; // e.g. "worksheets/sheet1.xml"
  return target.startsWith('xl/') ? target : `xl/${target}`;
}

/**
 * Find the r:id of the first sheet listed in workbook.xml.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function firstSheetRId(zip: any): Promise<string | null> {
  const wbFile = zip.file('xl/workbook.xml');
  if (!wbFile) return null;
  const xml = await wbFile.async('string');
  // <sheet name="..." sheetId="1" r:id="rId2"/>
  const m = /<sheet[^>]*r:id="(rId\d+)"/.exec(xml);
  return m ? m[1] : null;
}

export async function extractEmbeddedImages(
  buffer: ArrayBuffer,
): Promise<EmbeddedImageExtraction> {
  const empty: EmbeddedImageExtraction = { rowImages: new Map(), totalImages: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let zip: any;
  try {
    const mod = await import('jszip');
    const JSZip = (mod as any).default ?? mod;
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return empty;
  }

  // ── 1. Collect all media files ───────────────────────────────────────────
  const mediaFiles = new Map<string, Uint8Array>(); // "xl/media/imageN.ext" → bytes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [filePath, file] of Object.entries(zip.files) as [string, any][]) {
    if (filePath.startsWith('xl/media/') && !file.dir) {
      mediaFiles.set(filePath, await file.async('uint8array'));
    }
  }
  if (mediaFiles.size === 0) return empty;

  // ── 2. Find which drawing file is used by the first sheet ────────────────
  const sheetRId = await firstSheetRId(zip);
  const sheetPath = sheetRId
    ? await resolveSheetPath(zip, sheetRId)
    : 'xl/worksheets/sheet1.xml'; // fallback for simple single-sheet files

  if (!sheetPath) return empty;

  // Worksheet relationships: xl/worksheets/_rels/sheet1.xml.rels
  const sheetFilename = sheetPath.split('/').pop()!; // "sheet1.xml"
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFilename}.rels`;
  const sheetRelsFile = zip.file(sheetRelsPath);
  if (!sheetRelsFile) return empty;

  const sheetRelsXml = await sheetRelsFile.async('string');

  // Find the drawing relationship Target
  const drawingRef = (
    /Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/.exec(sheetRelsXml)
    ?? /Target="([^"]+)"[^>]*Type="[^"]*\/drawing"/.exec(sheetRelsXml)
  )?.[1];
  if (!drawingRef) return empty;

  const drawingFilename = drawingRef.replace(/^.*\//, ''); // "drawing1.xml"

  // ── 3. Load drawing relationships: rId → media path ─────────────────────
  const drawingRelsFile = zip.file(`xl/drawings/_rels/${drawingFilename}.rels`);
  if (!drawingRelsFile) return empty;

  const drawingRelsXml = await drawingRelsFile.async('string');
  const rIdToMedia = new Map<string, string>();
  for (const m of matchAll(drawingRelsXml, /Id="([^"]+)"[^>]*Target="([^"]+)"/)) {
    const target = m[2]; // "../media/image1.png"
    const mediaPath = 'xl/media/' + target.replace(/^.*\//, '');
    rIdToMedia.set(m[1], mediaPath);
  }

  // ── 4. Parse drawing XML: anchor → row + rId ────────────────────────────
  const drawingFile = zip.file(`xl/drawings/${drawingFilename}`);
  if (!drawingFile) return empty;

  const drawingXml = await drawingFile.async('string');
  const rowImages = new Map<number, EmbeddedImage[]>();

  // Collect all anchors: twoCellAnchor, oneCellAnchor, absoluteAnchor
  const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g;
  const anchors = matchAll(drawingXml, anchorRe);

  // First pass: extract all anchors with resolved rows (twoCellAnchor / oneCellAnchor)
  // to build a sorted list for nearest-row fallback used by absoluteAnchor images.
  const resolvedRows: number[] = [];

  const anchorData: Array<{ content: string; fromRow: number | null }> = anchors.map((anchor) => {
    const content = anchor[1];
    const fromBlock = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(content)?.[1] ?? '';
    const fromRowStr = /<xdr:row>(\d+)<\/xdr:row>/.exec(fromBlock)?.[1];
    const fromRow = fromRowStr !== undefined ? parseInt(fromRowStr, 10) : null;
    if (fromRow !== null && fromRow >= 1) resolvedRows.push(fromRow);
    return { content, fromRow };
  });

  resolvedRows.sort((a, b) => a - b);

  for (const { content, fromRow: rawFromRow } of anchorData) {
    let fromRow = rawFromRow;

    if (fromRow === null) {
      // absoluteAnchor: fall back to the smallest resolved product row (≥ 1) seen so far,
      // or use 1 if none have been seen yet.
      fromRow = resolvedRows.length > 0 ? resolvedRows[0] : 1;
    }

    // rId from blipFill — allow any rId string (not just rId\d+)
    const rId = /r:embed="([^"]+)"/.exec(content)?.[1];
    if (!rId) continue;

    const mediaPath = rIdToMedia.get(rId);
    if (!mediaPath) continue;

    const imgData = mediaFiles.get(mediaPath);
    if (!imgData) continue;

    // Drawing row 0 = Excel header; product row index (1-based) = fromRow
    const productRowIndex = fromRow;
    if (productRowIndex < 1) continue; // skip header-anchored images

    const ext = mediaPath.split('.').pop()?.toLowerCase() ?? 'png';
    const existing = rowImages.get(productRowIndex) ?? [];
    existing.push({
      data: imgData,
      mimeType: MIME_BY_EXT[ext] ?? 'image/png',
      filename: `__emb__row${productRowIndex}img${existing.length}.${ext}`,
    });
    rowImages.set(productRowIndex, existing);
  }

  return { rowImages, totalImages: mediaFiles.size };
}
