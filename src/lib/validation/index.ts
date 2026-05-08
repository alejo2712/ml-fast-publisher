import type { MissingField, ProductDraft } from '@/types';
import { getCategoryConfig } from '@/config/categories/appliances';

const CORE_REQUIRED_FIELDS: MissingField[] = [
  { id: 'title', label: 'Título', required: true, type: 'text', placeholder: 'Ej: Heladera Samsung No Frost 320L Blanca' },
  { id: 'brand', label: 'Marca', required: true, type: 'text', placeholder: 'Ej: Samsung' },
  { id: 'condition', label: 'Condición', required: true, type: 'select', options: ['new', 'used', 'refurbished'] },
  { id: 'price', label: 'Precio (ARS)', required: true, type: 'number', placeholder: 'Ej: 250000' },
  { id: 'stock', label: 'Stock disponible', required: true, type: 'number', placeholder: 'Ej: 1' },
];

export function getMissingFields(draft: ProductDraft): MissingField[] {
  const missing: MissingField[] = [];

  // Check core required fields
  if (!draft.title || draft.title.trim().length < 5) {
    missing.push(CORE_REQUIRED_FIELDS[0]);
  }
  if (!draft.brand) {
    missing.push(CORE_REQUIRED_FIELDS[1]);
  }
  if (!draft.condition) {
    missing.push(CORE_REQUIRED_FIELDS[2]);
  }
  if (!draft.price || draft.price <= 0) {
    missing.push(CORE_REQUIRED_FIELDS[3]);
  }

  // Check category-specific required attributes
  const categoryConfig = getCategoryConfig(draft.applianceType);
  if (categoryConfig) {
    for (const attr of categoryConfig.attributes) {
      if (!attr.required) continue;
      const fieldValue = getDraftFieldValue(draft, attr.id);
      if (!fieldValue) {
        missing.push({
          id: attr.id.toLowerCase(),
          label: attr.label,
          required: true,
          type: attr.type,
          unit: attr.unit,
          options: attr.options,
          placeholder: attr.placeholder,
        });
      }
    }
  }

  // Always suggest at least one image
  if (draft.images.length === 0) {
    missing.push({
      id: 'images',
      label: 'Fotos del producto',
      required: true,
      type: 'text',
      placeholder: 'URL de imagen (ej: https://...)',
    });
  }

  return missing;
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
