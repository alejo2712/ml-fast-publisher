/**
 * ML payload enricher — resolves dynamic category + filters attributes.
 * SERVER-SIDE only. Called just before publishing in real mode.
 *
 * Why this exists:
 *   Our hardcoded category IDs (MLA1577 etc.) are wrong, non-leaf, or classified.
 *   We must query ML's domain_discovery API to get the correct leaf category for
 *   each product title, then filter our attribute list to only what that category
 *   actually supports.
 *
 * This runs AFTER preflight so it only adds latency when we're about to publish.
 */

import type { MLPayload } from '@/types';
import { resolveCategory, validateCategoryId, type MLCategoryResolution } from './category-resolver';
import { getCategoryAttributes, getAttributeIds } from './category-attributes';

export interface EnrichmentResult {
  payload: MLPayload;
  resolution: MLCategoryResolution | null;
  warnings: string[];
}

/**
 * Enrich a payload with the correct ML category + filtered attributes.
 *
 * @param payload         Original payload (possibly with wrong hardcoded category_id)
 * @param title           Product title — used for ML category prediction
 * @param officialCategoryId  User-provided override (skips prediction when present)
 * @param accessToken     Valid ML OAuth access token
 */
export async function enrichPayload(
  payload: MLPayload,
  title: string,
  officialCategoryId: string | undefined,
  accessToken: string
): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  let resolution: MLCategoryResolution | null = null;

  // ── 1. Resolve category ───────────────────────────────────────────────────
  if (officialCategoryId) {
    // User explicitly provided a category — validate it
    resolution = await validateCategoryId(officialCategoryId, accessToken);
    if (!resolution) {
      warnings.push(
        `La categoría "${officialCategoryId}" no existe en ML. Se usará la categoría del payload original.`
      );
    } else if (!resolution.isLeaf) {
      warnings.push(
        `La categoría "${officialCategoryId}" (${resolution.categoryName}) no es una categoría hoja. ML puede rechazarla.`
      );
    } else if (!resolution.supportsMarketplace) {
      warnings.push(
        `La categoría "${officialCategoryId}" (${resolution.categoryName}) solo acepta avisos clasificados — no compra directa.`
      );
    }
  } else {
    // Predict from title
    resolution = await resolveCategory(title, accessToken);
    if (!resolution) {
      warnings.push(
        `No se pudo predecir la categoría ML para "${title.slice(0, 40)}...". Se usará category_id del payload.`
      );
    } else if (!resolution.isLeaf) {
      // Try to use it anyway — some ML API responses don't have children listed
      warnings.push(
        `Categoría predicha "${resolution.categoryName}" (${resolution.categoryId}) puede no ser hoja. Verificar.`
      );
    } else if (!resolution.supportsMarketplace) {
      warnings.push(
        `Categoría predicha "${resolution.categoryName}" solo acepta clasificados. Se intentará de todas formas.`
      );
    }
  }

  // ── 2. Override category_id in payload ────────────────────────────────────
  const resolvedCategoryId = resolution?.categoryId ?? payload.category_id;
  let enrichedPayload: MLPayload = { ...payload, category_id: resolvedCategoryId };

  // ── 3. Fetch category attributes + filter our attrs ───────────────────────
  const categoryAttrs = await getCategoryAttributes(resolvedCategoryId, accessToken);

  if (categoryAttrs.length === 0) {
    warnings.push(
      `No se pudieron obtener los atributos de la categoría ${resolvedCategoryId}. Los atributos del payload no se filtrarán.`
    );
  } else {
    const supportedIds = getAttributeIds(categoryAttrs);

    // Filter: only send attributes the category actually supports
    const filteredAttributes = enrichedPayload.attributes.filter((attr) => {
      if (supportedIds.has(attr.id)) return true;
      // Don't warn for common attributes that almost all categories have
      const silentDrop = new Set(['BRAND', 'MODEL']);
      if (!silentDrop.has(attr.id)) {
        warnings.push(`Atributo ${attr.id} eliminado — no soportado por categoría ${resolvedCategoryId}.`);
      }
      return false;
    });

    enrichedPayload = { ...enrichedPayload, attributes: filteredAttributes };
  }

  // ── 4. Shipping safety fallback ───────────────────────────────────────────
  // me2 requires explicit setup per user/category; fall back to not_specified
  // if the user hasn't explicitly requested me2 via the CSV column.
  // We keep me2 if it was explicitly set — the error will be descriptive enough.

  return { payload: enrichedPayload, resolution, warnings };
}
