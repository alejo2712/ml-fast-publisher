import type { Condition, MissingField, ProductDraft } from '@/types';
import { getCategoryConfig } from '@/config/categories/appliances';

// ─── Garbage / placeholder detection ────────────────────────────────────────

const GARBAGE_PATTERNS = [
  /^(test|asd|asdf|qwerty|xxx|yyy|zzz|abc|foo|bar|baz|lol|123|1234|12345|none|null|undefined|n\/a|na)$/i,
  /^(.)\1{3,}$/,   // aaaa, 1111, ....
  /^[\d\W]+$/,     // only digits / symbols → not a valid brand/title
];

function isGarbage(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false; // empty is caught separately
  return GARBAGE_PATTERNS.some((p) => p.test(v));
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const VALID_CONDITIONS: Condition[] = ['new', 'used', 'refurbished'];

// ─── Per-field error messages ────────────────────────────────────────────────

export interface FieldError {
  id: string;
  label: string;
  message: string;
}

export interface ValidationResult {
  /** Fields that are empty and required */
  missingFields: MissingField[];
  /** Fields that have a value but the value is invalid */
  fieldErrors: FieldError[];
  /** Overall readiness */
  isReady: boolean;
  /** Human-readable status for the publish button */
  status: 'ready' | 'missing' | 'invalid';
}

export function validateDraft(draft: ProductDraft): ValidationResult {
  const missingFields: MissingField[] = [];
  const fieldErrors: FieldError[] = [];

  // ── Title ──────────────────────────────────────────────────────────────────
  if (!draft.title || draft.title.trim().length === 0) {
    missingFields.push({ id: 'title', label: 'Título', required: true, type: 'text', placeholder: 'Ej: Heladera Samsung No Frost 320L Blanca' });
  } else if (draft.title.trim().length < 10) {
    fieldErrors.push({ id: 'title', label: 'Título', message: 'Debe tener al menos 10 caracteres.' });
  } else if (draft.title.trim().length > 60) {
    fieldErrors.push({ id: 'title', label: 'Título', message: 'No puede superar los 60 caracteres.' });
  } else if (isGarbage(draft.title)) {
    fieldErrors.push({ id: 'title', label: 'Título', message: 'Ingresá un título real del producto.' });
  }

  // ── Brand ──────────────────────────────────────────────────────────────────
  if (!draft.brand || draft.brand.trim().length === 0) {
    missingFields.push({ id: 'brand', label: 'Marca', required: true, type: 'text', placeholder: 'Ej: Samsung' });
  } else if (isGarbage(draft.brand)) {
    fieldErrors.push({ id: 'brand', label: 'Marca', message: 'Ingresá una marca válida.' });
  } else if (draft.brand.trim().length < 2) {
    fieldErrors.push({ id: 'brand', label: 'Marca', message: 'La marca debe tener al menos 2 caracteres.' });
  }

  // ── Condition ──────────────────────────────────────────────────────────────
  if (!draft.condition) {
    missingFields.push({ id: 'condition', label: 'Condición', required: true, type: 'select', options: ['new', 'used', 'refurbished'] });
  } else if (!VALID_CONDITIONS.includes(draft.condition)) {
    fieldErrors.push({ id: 'condition', label: 'Condición', message: 'Debe ser: nuevo, usado o reacondicionado.' });
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  if (draft.price === undefined || draft.price === null) {
    missingFields.push({ id: 'price', label: 'Precio (ARS)', required: true, type: 'number', placeholder: 'Ej: 250000' });
  } else if (!Number.isFinite(draft.price) || draft.price <= 0) {
    fieldErrors.push({ id: 'price', label: 'Precio (ARS)', message: 'Debe ser un número mayor a 0.' });
  } else if (draft.price < 100) {
    fieldErrors.push({ id: 'price', label: 'Precio (ARS)', message: 'El precio parece muy bajo. ¿Es correcto?' });
  }

  // ── Stock ──────────────────────────────────────────────────────────────────
  if (draft.stock <= 0 || !Number.isInteger(draft.stock)) {
    fieldErrors.push({ id: 'stock', label: 'Stock', message: 'Debe ser un número entero mayor a 0.' });
  }

  // ── Description ────────────────────────────────────────────────────────────
  if (draft.description) {
    if (draft.description.trim().length < 20) {
      fieldErrors.push({ id: 'description', label: 'Descripción', message: 'Debe tener al menos 20 caracteres.' });
    }
    if (/(?:\d[\s.\-()]){7,}/.test(draft.description)) {
      fieldErrors.push({ id: 'description', label: 'Descripción', message: 'No puede contener números de teléfono ni datos de contacto (regla de ML).' });
    }
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  if (draft.images.length === 0) {
    missingFields.push({ id: 'images', label: 'Fotos del producto', required: true, type: 'text', placeholder: 'URL de imagen (https://...)' });
  } else {
    const badUrls = draft.images.filter((url) => !isValidUrl(url));
    if (badUrls.length > 0) {
      fieldErrors.push({ id: 'images', label: 'Fotos', message: `URL inválida: ${badUrls[0]}. Debe empezar con https://` });
    }
  }

  // ── Category-specific required attributes ──────────────────────────────────
  const categoryConfig = getCategoryConfig(draft.applianceType);
  if (categoryConfig) {
    for (const attr of categoryConfig.attributes) {
      if (!attr.required) continue;
      const fieldValue = getDraftFieldValue(draft, attr.id);
      if (!fieldValue && fieldValue !== 0) {
        missingFields.push({
          id: attr.id.toLowerCase(),
          label: attr.label,
          required: true,
          type: attr.type,
          unit: attr.unit,
          options: attr.options,
          placeholder: attr.placeholder,
        });
      } else if (typeof fieldValue === 'string' && isGarbage(fieldValue)) {
        fieldErrors.push({ id: attr.id.toLowerCase(), label: attr.label, message: `Ingresá un valor válido para ${attr.label}.` });
      }
    }
  }

  const isReady = missingFields.length === 0 && fieldErrors.length === 0;
  const status: ValidationResult['status'] = isReady
    ? 'ready'
    : fieldErrors.length > 0
    ? 'invalid'
    : 'missing';

  return { missingFields, fieldErrors, isReady, status };
}

// Backwards-compatible alias used by csv/parser
export function getMissingFields(draft: ProductDraft): MissingField[] {
  return validateDraft(draft).missingFields;
}

function getDraftFieldValue(draft: ProductDraft, attributeId: string): string | number | undefined {
  const map: Record<string, keyof ProductDraft> = {
    BRAND: 'brand',
    MODEL: 'model',
    COLOR: 'color',
    VOLTAGE: 'voltage',
    CAPACITY: 'capacity',
    POWER_CONSUMPTION: 'watts',
    COOLING_TYPE: 'technology',
    TYPE: 'technology',
    HEIGHT: 'height',
    WIDTH: 'width',
    DEPTH: 'depth',
    WEIGHT: 'weight',
  };
  const key = map[attributeId];
  if (!key) return undefined;
  const val = draft[key];
  return val as string | number | undefined;
}
