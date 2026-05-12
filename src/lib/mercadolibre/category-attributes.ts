/**
 * ML category attributes fetcher.
 * SERVER-SIDE only — never import in client components.
 *
 * Fetches the attribute definitions for a given ML category.
 * Results are cached in-process for the lifetime of a serverless invocation.
 */

import { mlGet } from './client';

export interface MLAttributeDefinition {
  id: string;
  name: string;
  tags?: {
    required?: boolean;
    conditionally_required?: boolean;
    hidden?: boolean;
    multivalued?: boolean;
    fixed?: boolean;
  };
  /** 'string' | 'number' | 'boolean' | 'list' | 'number_unit' */
  value_type?: string;
  /** Accepted unit for numeric attributes, e.g. 'L', 'kg', 'W', 'cm' */
  value_unit?: string;
  /** Controlled-vocab values — present when value_type === 'list' */
  values?: Array<{ id: string; name: string; metadata?: Record<string, unknown> }>;
}

// In-process cache keyed by category ID
const attrsCache = new Map<string, MLAttributeDefinition[]>();

/**
 * Fetch all attribute definitions for a category.
 * Returns an empty array when the API call fails.
 */
export async function getCategoryAttributes(
  categoryId: string,
  accessToken: string
): Promise<MLAttributeDefinition[]> {
  if (attrsCache.has(categoryId)) return attrsCache.get(categoryId)!;

  let attrs: MLAttributeDefinition[];
  try {
    attrs = await mlGet<MLAttributeDefinition[]>(
      `/categories/${categoryId}/attributes`,
      accessToken
    );
  } catch {
    attrsCache.set(categoryId, []);
    return [];
  }

  attrsCache.set(categoryId, attrs);
  return attrs;
}

/** Returns the set of attribute IDs that a category supports (for filtering) */
export function getAttributeIds(attrs: MLAttributeDefinition[]): Set<string> {
  return new Set(attrs.map((a) => a.id));
}

/** Returns only the required attributes (tags.required === true) */
export function getRequiredAttributes(attrs: MLAttributeDefinition[]): MLAttributeDefinition[] {
  return attrs.filter((a) => a.tags?.required === true);
}

/** Returns required + conditionally_required attributes */
export function getCriticalAttributes(attrs: MLAttributeDefinition[]): MLAttributeDefinition[] {
  return attrs.filter(
    (a) => a.tags?.required === true || a.tags?.conditionally_required === true
  );
}

/**
 * Returns critical attributes whose ID is not present in `sentAttributeIds`.
 * Used to detect what was missing from the payload after enrichment + defaults.
 */
export function getMissingCriticalAttributes(
  categoryAttrs: MLAttributeDefinition[],
  sentAttributeIds: Set<string>
): Array<{ id: string; name: string; conditionalRequired: boolean }> {
  return getCriticalAttributes(categoryAttrs)
    .filter((a) => !sentAttributeIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      conditionalRequired: a.tags?.conditionally_required === true && a.tags?.required !== true,
    }));
}
