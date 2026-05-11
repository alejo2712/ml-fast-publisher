import type { ApplianceType, Condition, ProductDraft } from '@/types';
import { inferProduct } from '@/lib/inference';
import { buildProductDraft, buildMLPayload } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import { CSV_COLUMNS } from './template';
import type { MLPayload, MissingField } from '@/types';

export interface CsvRowResult {
  rowIndex: number;           // 1-based, excluding header
  rawRow: Record<string, string>;
  draft: ProductDraft | null;
  payload: MLPayload | null;
  missingFields: MissingField[];
  errors: string[];           // hard parse errors + field validation errors
  status: 'ok' | 'warnings' | 'error';
}

export interface CsvParseResult {
  rows: CsvRowResult[];
  totalOk: number;
  totalWarnings: number;
  totalErrors: number;
}

// Minimal CSV parser — handles quoted fields with commas, no external deps.
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, '').replace(/^﻿/, '')) // strip BOM if present
    .filter((l) => l.trim().length > 0)
    .filter((l) => !l.trimStart().startsWith('#')); // skip comment/hint rows

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function normalizeCondition(raw: string): Condition | undefined {
  const v = raw.toLowerCase().trim();
  if (!v) return undefined;
  if (v === 'new' || v === 'nuevo' || v === 'nueva' || v === '0km') return 'new';
  if (v === 'used' || v === 'usado' || v === 'usada' || v === 'segunda mano') return 'used';
  if (v === 'refurbished' || v === 'reacondicionado' || v === 'renovado') return 'refurbished';
  return undefined;
}

/**
 * Maps Spanish/common product type names to ApplianceType enum values.
 * Lets the tipo_producto column override inference when provided.
 */
const PRODUCT_TYPE_MAP: Record<string, ApplianceType> = {
  heladera: 'refrigerator',
  refrigerador: 'refrigerator',
  frigorífico: 'refrigerator',
  frigorifico: 'refrigerator',
  lavarropas: 'washing_machine',
  lavadora: 'washing_machine',
  secadora: 'dryer',
  secarropas: 'dryer',
  lavavajillas: 'dishwasher',
  lavaplatos: 'dishwasher',
  horno: 'oven',
  cocina: 'stove',
  anafe: 'stove',
  freezer: 'freezer',
  congelador: 'freezer',
  microondas: 'microwave',
  'freidora de aire': 'air_fryer',
  'air fryer': 'air_fryer',
  airfryer: 'air_fryer',
  freidora: 'air_fryer',
  licuadora: 'blender',
  procesadora: 'blender',
  cafetera: 'coffee_maker',
  'pava eléctrica': 'electric_kettle',
  'pava electrica': 'electric_kettle',
  hervidor: 'electric_kettle',
  aspiradora: 'vacuum_cleaner',
  plancha: 'iron',
  tostadora: 'toaster',
  mixer: 'mixer',
  batidora: 'mixer',
};

function normalizeProductType(raw: string): ApplianceType | undefined {
  const v = raw.toLowerCase().trim();
  if (!v) return undefined;
  return PRODUCT_TYPE_MAP[v];
}

// Legacy header aliases for backward compatibility with old CSV templates
const LEGACY_HEADERS: Record<string, string> = {
  imagen_url: 'imagenes',
  capacidad: 'capacidad_litros',
  watts: 'potencia_watts',
};

/**
 * Split image URLs — supports pipe (|), semicolon (;) and comma (,) separators.
 * Priority: pipe > semicolon > comma (comma is last since it's ambiguous in CSV).
 */
function splitImageUrls(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.includes('|')) return trimmed.split('|').map((u) => u.trim()).filter(Boolean);
  if (trimmed.includes(';')) return trimmed.split(';').map((u) => u.trim()).filter(Boolean);
  if (trimmed.includes(',')) return trimmed.split(',').map((u) => u.trim()).filter(Boolean);
  return [trimmed];
}

function mapRowToOverrides(row: Record<string, string>): Partial<ProductDraft> {
  // Normalize row: apply legacy aliases so old column names still work
  const normalizedRow: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const canonical = LEGACY_HEADERS[k] ?? k;
    normalizedRow[canonical] = v;
  }

  const get = (key: string) => {
    const col = CSV_COLUMNS.find((c) => c.key === key);
    return col ? (normalizedRow[col.header] ?? '') : '';
  };

  const overrides: Partial<ProductDraft> = {};

  const title = get('title');
  if (title) overrides.title = title.slice(0, 60);

  const brand = get('brand');
  if (brand) overrides.brand = brand;

  const model = get('model');
  if (model) overrides.model = model;

  const condition = normalizeCondition(get('condition'));
  if (condition) overrides.condition = condition;

  const price = parseFloat(get('price').replace(/[.,\s]/g, ''));
  if (!isNaN(price) && price > 0) overrides.price = price;

  const stock = parseInt(get('stock'), 10);
  if (!isNaN(stock) && stock > 0) overrides.stock = stock;

  const sku = get('sku');
  if (sku) overrides.sku = sku;

  const color = get('color');
  if (color) overrides.color = color;

  const voltage = get('voltage');
  if (voltage) overrides.voltage = voltage;

  // capacity_litros preferred over capacity_kg (both map to ProductDraft.capacity)
  const capacityL = get('capacity');
  const capacityKg = get('capacity_kg');
  if (capacityL && !isNaN(parseFloat(capacityL))) {
    overrides.capacity = capacityL;
  } else if (capacityKg && !isNaN(parseFloat(capacityKg))) {
    overrides.capacity = capacityKg;
  }

  const watts = parseFloat(get('watts'));
  if (!isNaN(watts) && watts > 0) overrides.watts = watts;

  const technology = get('technology');
  if (technology) overrides.technology = technology;

  const warranty = get('warranty');
  if (warranty) overrides.warranty = warranty;

  const description = get('description');
  if (description) overrides.description = description;

  // Images — pipe, semicolon or comma separated
  const imageRaw = get('images');
  if (imageRaw) {
    overrides.images = splitImageUrls(imageRaw);
  }

  // Shipping overrides
  const shippingMode = get('shipping_mode');
  const localPickupRaw = get('local_pickup');
  const freeShippingRaw = get('free_shipping');
  if (shippingMode || localPickupRaw || freeShippingRaw) {
    const parseBool = (v: string) => {
      const lc = v.toLowerCase();
      return lc === 'si' || lc === 'sí' || lc === 'yes' || v === '1' || lc === 'true';
    };
    overrides.shipping = {
      mode: (['me2', 'custom', 'not_specified'].includes(shippingMode) ? shippingMode : 'me2') as import('@/types').ShippingMode,
      localPickUp: localPickupRaw ? parseBool(localPickupRaw) : false,
      freeShipping: freeShippingRaw ? parseBool(freeShippingRaw) : false,
    };
  }

  return overrides;
}

/**
 * Extract tipo_producto override from a row (used to override inference.applianceType).
 * Returns undefined if column is absent or value is unrecognized.
 */
function extractProductType(row: Record<string, string>): ApplianceType | undefined {
  const col = CSV_COLUMNS.find((c) => c.key === 'product_type');
  if (!col) return undefined;
  const raw = row[col.header] ?? '';
  return normalizeProductType(raw);
}

/**
 * Parse an Excel (.xlsx / .xls) ArrayBuffer into CSV text for processing.
 * Uses the xlsx library (already in package.json).
 */
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  // Use the first sheet
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Convert to CSV text — parseCsvText handles the rest
  return XLSX.utils.sheet_to_csv(ws);
}

export async function parseCsvText(text: string): Promise<CsvParseResult> {
  const { headers, rows: rawRows } = parseCSV(text);

  if (headers.length === 0) {
    return { rows: [], totalOk: 0, totalWarnings: 0, totalErrors: 0 };
  }

  // Check for known headers
  const inputHeader = CSV_COLUMNS.find((c) => c.key === 'input')!.header;
  const hasInputCol = headers.includes(inputHeader);

  const results: CsvRowResult[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const errors: string[] = [];

    // Skip fully empty rows
    if (Object.values(row).every((v) => !v)) continue;

    const inputText = hasInputCol ? (row[inputHeader] ?? '') : Object.values(row).join(' ');

    if (!inputText.trim()) {
      errors.push('La columna "descripcion_corta" está vacía.');
      results.push({ rowIndex: i + 1, rawRow: row, draft: null, payload: null, missingFields: [], errors, status: 'error' });
      continue;
    }

    try {
      const inference = await inferProduct(inputText);

      // Apply product type override if provided — takes priority over inference
      const productTypeOverride = extractProductType(row);
      const effectiveInference = productTypeOverride
        ? { ...inference, applianceType: productTypeOverride }
        : inference;

      const overrides = mapRowToOverrides(row);
      const draft = buildProductDraft(effectiveInference, overrides);
      const payload = buildMLPayload(draft);
      const validation = validateDraft(draft);

      // Capture field errors (invalid values) as error strings for display
      const fieldErrorStrings = validation.fieldErrors.map(
        (fe) => `${fe.label}: ${fe.message}`
      );
      errors.push(...fieldErrorStrings);

      // Status: error if parse errors or field validation errors; warnings if only missing fields
      const status: CsvRowResult['status'] =
        errors.length > 0 ? 'error' :
        validation.missingFields.length > 0 ? 'warnings' :
        'ok';

      results.push({
        rowIndex: i + 1,
        rawRow: row,
        draft,
        payload,
        missingFields: validation.missingFields,
        errors,
        status,
      });
    } catch (err) {
      errors.push(`Error al procesar: ${String(err)}`);
      results.push({ rowIndex: i + 1, rawRow: row, draft: null, payload: null, missingFields: [], errors, status: 'error' });
    }
  }

  return {
    rows: results,
    totalOk: results.filter((r) => r.status === 'ok').length,
    totalWarnings: results.filter((r) => r.status === 'warnings').length,
    totalErrors: results.filter((r) => r.status === 'error').length,
  };
}

export function exportAllPayloads(rows: CsvRowResult[]): void {
  const payloads = rows
    .filter((r) => r.payload !== null)
    .map((r) => ({ row: r.rowIndex, draft_title: r.draft?.title, ...r.payload }));

  const json = JSON.stringify(payloads, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ml-bulk-drafts-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
