/**
 * ML payload enricher — resolves dynamic category + filters/fills attributes.
 * SERVER-SIDE only. Called just before publishing in real mode.
 *
 * Why this exists:
 *   Our hardcoded category IDs (MLA1577 etc.) are wrong, non-leaf, or classified.
 *   We must query ML's domain_discovery API to get the correct leaf category for
 *   each product title, then filter our attribute list to only what that category
 *   actually supports, and fill in any missing required attributes with defaults.
 *
 * This runs AFTER preflight so it only adds latency when we're about to publish.
 */

import type { MLPayload } from '@/types';
import { resolveCategory, validateCategoryId, isCategoryCompatibleWithProductType, type MLCategoryResolution } from './category-resolver';
import { getCategoryAttributes, getAttributeIds, getMissingCriticalAttributes } from './category-attributes';
import { buildDefaultAttribute } from './attribute-defaults';
import { logger } from '@/lib/logger';

export interface MissingAttr {
  id: string;
  name: string;
  conditionalRequired: boolean;
}

export interface EnrichmentResult {
  payload: MLPayload;
  resolution: MLCategoryResolution | null;
  warnings: string[];
  /** Attrs that were still missing after filtering + applying defaults */
  missingRequired: MissingAttr[];
  /** True when there are still non-conditional required attrs missing (should block publish) */
  hasBlockingMissing: boolean;
  /** Set when the resolved category is incompatible with the declared product type */
  categoryIncompatibilityReason?: string;
}

/**
 * Enrich a payload with the correct ML category + filtered/filled attributes.
 *
 * @param payload             Original payload (possibly with wrong hardcoded category_id)
 * @param title               Product title — used for ML category prediction
 * @param officialCategoryId  User-provided override (skips prediction when present)
 * @param accessToken         Valid ML OAuth access token
 * @param productType         Appliance type (e.g. "microwave") — used to validate category compatibility
 */
export async function enrichPayload(
  payload: MLPayload,
  title: string,
  officialCategoryId: string | undefined,
  accessToken: string,
  productType?: string
): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  let resolution: MLCategoryResolution | null = null;
  let categoryIncompatibilityReason: string | undefined;

  // ── 1. Resolve category ───────────────────────────────────────────────────
  if (officialCategoryId) {
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
    // Pass productType so resolveCategory can retry with a type-specific query when needed
    resolution = await resolveCategory(title, accessToken, productType);

    // resolveCategory may return a resolution flagged as incompatible (both title + retry failed)
    const flagged = resolution as (MLCategoryResolution & { _incompatible?: boolean; _incompatibilityReason?: string }) | null;
    if (flagged?._incompatible) {
      categoryIncompatibilityReason = flagged._incompatibilityReason;
      warnings.push(
        `CATEGORÍA INCOMPATIBLE: ${categoryIncompatibilityReason} — La publicación se bloqueará para evitar publicar en la categoría incorrecta. Usá la columna categoria_ml para especificar el ID correcto.`
      );
      // Treat as unresolved — don't override the payload's category_id with a wrong one
      resolution = null;
    } else if (!resolution) {
      warnings.push(
        `No se pudo predecir la categoría ML para "${title.slice(0, 40)}...". Se usará category_id del payload.`
      );
    } else if (!resolution.isLeaf) {
      warnings.push(
        `Categoría predicha "${resolution.categoryName}" (${resolution.categoryId}) puede no ser hoja. Verificar.`
      );
    } else if (!resolution.supportsMarketplace) {
      warnings.push(
        `Categoría predicha "${resolution.categoryName}" solo acepta clasificados. Se intentará de todas formas.`
      );
    } else if (productType) {
      // Even if resolveCategory returned a result without flagging it, double-check compatibility
      const { compatible, reason } = isCategoryCompatibleWithProductType(resolution, productType);
      if (!compatible) {
        categoryIncompatibilityReason = reason;
        warnings.push(
          `CATEGORÍA INCOMPATIBLE: ${reason} — Usá la columna categoria_ml para especificar el ID correcto.`
        );
        resolution = null;
      }
    }
  }

  const resolvedCategoryId = resolution?.categoryId ?? payload.category_id;
  let enrichedPayload: MLPayload = { ...payload, category_id: resolvedCategoryId };

  logger.info('publish', `Enrichment — resolved category`, {
    title: title.slice(0, 50),
    categoryId: resolvedCategoryId,
    categoryName: resolution?.categoryName ?? '(unknown)',
    isLeaf: resolution?.isLeaf,
    supportsMarketplace: resolution?.supportsMarketplace,
  });

  // ── 2. Fetch category attributes ──────────────────────────────────────────
  const categoryAttrs = await getCategoryAttributes(resolvedCategoryId, accessToken);

  if (categoryAttrs.length === 0) {
    warnings.push(
      `No se pudieron obtener los atributos de la categoría ${resolvedCategoryId}. Los atributos del payload no se filtrarán.`
    );
    logger.warn('publish', `Could not fetch category attributes`, { categoryId: resolvedCategoryId });
    return { payload: enrichedPayload, resolution, warnings, missingRequired: [], hasBlockingMissing: !!categoryIncompatibilityReason, categoryIncompatibilityReason };
  }

  const supportedIds = getAttributeIds(categoryAttrs);

  logger.debug('publish', `Category attributes`, {
    categoryId: resolvedCategoryId,
    total: categoryAttrs.length,
    required: categoryAttrs.filter((a) => a.tags?.required).length,
    conditionalRequired: categoryAttrs.filter((a) => a.tags?.conditionally_required).length,
    requiredIds: categoryAttrs.filter((a) => a.tags?.required).map((a) => a.id).join(', '),
    conditionalRequiredIds: categoryAttrs.filter((a) => a.tags?.conditionally_required).map((a) => a.id).join(', '),
  });

  // ── 3. Filter: remove attributes not supported by the category ────────────
  const filteredAttributes = enrichedPayload.attributes.filter((attr) => {
    if (supportedIds.has(attr.id)) return true;
    const silentDrop = new Set(['BRAND', 'MODEL']);
    if (!silentDrop.has(attr.id)) {
      warnings.push(`Atributo ${attr.id} eliminado — no soportado por categoría ${resolvedCategoryId}.`);
    }
    return false;
  });

  enrichedPayload = { ...enrichedPayload, attributes: filteredAttributes };

  logger.debug('publish', `Attribute filtering`, {
    sent: payload.attributes.map((a) => a.id).join(', '),
    afterFilter: filteredAttributes.map((a) => a.id).join(', '),
  });

  // ── 4. Detect missing required/conditional-required attrs ─────────────────
  const sentIds = new Set(filteredAttributes.map((a) => a.id));
  const missingBeforeDefaults = getMissingCriticalAttributes(categoryAttrs, sentIds);

  logger.info('publish', `Missing critical attributes before defaults`, {
    missing: missingBeforeDefaults.map((m) => `${m.id}(${m.conditionalRequired ? 'conditional' : 'required'})`).join(', ') || 'none',
  });

  // ── 5. Apply intelligent defaults for missing attrs ───────────────────────
  const filledAttributes = [...filteredAttributes];

  for (const missing of missingBeforeDefaults) {
    const attrDef = categoryAttrs.find((a) => a.id === missing.id);
    if (!attrDef) continue;

    const defaultAttr = buildDefaultAttribute(attrDef, filteredAttributes);
    if (defaultAttr) {
      filledAttributes.push(defaultAttr);
      logger.info('publish', `Applied default for ${missing.id}`, {
        value: defaultAttr.value_name,
        conditional: missing.conditionalRequired,
      });
    }
  }

  enrichedPayload = { ...enrichedPayload, attributes: filledAttributes };

  // ── 6. Re-check what's still missing after defaults ───────────────────────
  const finalSentIds = new Set(filledAttributes.map((a) => a.id));
  const stillMissing = getMissingCriticalAttributes(categoryAttrs, finalSentIds);

  if (stillMissing.length > 0) {
    logger.warn('publish', `Attributes still missing after defaults`, {
      missing: stillMissing.map((m) => `${m.id}(${m.conditionalRequired ? 'conditional' : 'required'})`).join(', '),
    });
  }

  // Non-conditional required attrs missing after defaults = blocking
  const hasBlockingMissing = stillMissing.some((m) => !m.conditionalRequired);

  if (hasBlockingMissing) {
    const blocking = stillMissing.filter((m) => !m.conditionalRequired);
    warnings.push(
      `Atributos obligatorios faltantes (ML los requiere): ${blocking.map((m) => `${m.id} (${m.name})`).join(', ')}`
    );
  }

  logger.info('publish', `Enrichment complete`, {
    categoryId: resolvedCategoryId,
    finalAttributes: filledAttributes.map((a) => a.id).join(', '),
    stillMissing: stillMissing.map((m) => m.id).join(', ') || 'none',
    hasBlockingMissing,
  });

  return { payload: enrichedPayload, resolution, warnings, missingRequired: stillMissing, hasBlockingMissing: hasBlockingMissing || !!categoryIncompatibilityReason, categoryIncompatibilityReason };
}
