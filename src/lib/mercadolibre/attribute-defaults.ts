/**
 * Intelligent attribute defaults for common appliance categories.
 * Applied during enrichment when required/conditional-required attributes are missing.
 *
 * Strategy:
 * - For `list` attributes: pick the first candidate from the ordered defaults list
 *   that exists in the category's accepted values.
 * - For `number_unit` / `number` attributes: derive from an existing payload attribute
 *   where a logical mapping exists (e.g. POWER → POWER_CONSUMPTION).
 * - Returns null if no default can be determined.
 */

import type { MLAttributeDefinition } from './category-attributes';
import type { MLAttribute } from '@/types';

/**
 * Ordered default candidates per attribute ID.
 * First value whose name appears in the category's accepted values (case-insensitive) wins.
 */
const LIST_DEFAULTS: Record<string, string[]> = {
  // ── Refrigerators / freezers ─────────────────────────────────────────────
  ENERGY_EFFICIENCY_CLASS: ['A', 'A+', 'A++', 'B', 'C'],
  DEFROST_SYSTEM: ['No Frost', 'Frost Free', 'Frío directo', 'Frío seco', 'Estático'],
  REFRIGERATOR_TYPE: ['Combinada', 'Simple', 'Americana'],

  // ── Microwaves ────────────────────────────────────────────────────────────
  PANEL_TYPE: ['Digital', 'Electrónico', 'Analógico'],
  MICROWAVE_TYPE: ['De cocina', 'Standard', 'Convencional', 'Compacto'],
  HAS_GRILL: ['No', 'Sí'],

  // ── Washing machines / dryers ────────────────────────────────────────────
  LOAD_TYPE: ['Carga frontal', 'Carga superior'],
  WITH_DRYER: ['No', 'Sí'],

  // ── General ───────────────────────────────────────────────────────────────
  ENERGY_SOURCE: ['Eléctrico', 'Electric'],
  CONNECTIVITY: ['Sin conectividad', 'Ninguna'],
  LINE: ['Línea blanca', 'Doméstico'],
  WITH_DISPLAY: ['Sí', 'No'],
};

/**
 * Numeric attribute derivation table.
 * Maps target attribute ID → source attribute ID in the existing payload.
 */
const NUMERIC_DERIVE_FROM: Record<string, string> = {
  TOTAL_CAPACITY: 'CAPACITY',
  POWER: 'POWER_CONSUMPTION',
  // CAPACITY is the same id in both fridges and microwaves — no mapping needed
};

/**
 * Try to build a default attribute for a missing required/conditional attribute.
 *
 * @param attrDef        Attribute definition from ML categories API
 * @param existingAttrs  Attributes already present in the (filtered) payload
 */
export function buildDefaultAttribute(
  attrDef: MLAttributeDefinition,
  existingAttrs: MLAttribute[]
): MLAttribute | null {
  const { id, value_type, values, value_unit } = attrDef;

  // ── List (controlled vocab) ───────────────────────────────────────────────
  if (value_type === 'list' && values && values.length > 0) {
    const candidates = LIST_DEFAULTS[id];
    if (!candidates) return null;

    // Build lookup by lowercase name
    const byName = new Map(values.map((v) => [v.name.toLowerCase(), v]));

    for (const candidate of candidates) {
      const match = byName.get(candidate.toLowerCase());
      if (match) {
        return {
          id,
          value_name: match.name,
          ...(match.id ? { value_id: match.id } : {}),
        };
      }
    }
    return null;
  }

  // ── Number / number_unit ──────────────────────────────────────────────────
  if (value_type === 'number_unit' || value_type === 'number') {
    const sourceId = NUMERIC_DERIVE_FROM[id];
    if (sourceId) {
      const source = existingAttrs.find((a) => a.id === sourceId);
      if (source?.value_struct) {
        const unit = value_unit ?? source.value_struct.unit;
        return {
          id,
          value_name: `${source.value_struct.number} ${unit}`,
          value_struct: { number: source.value_struct.number, unit },
        };
      }
    }
  }

  return null;
}
