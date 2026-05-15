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

import type { MLPayload, ApplianceType } from '@/types';
import { resolveCategory, validateCategoryId, validatePathForApplianceType, APPLIANCE_PATH_KEYWORDS, type MLCategoryResolution } from './category-resolver';
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
  /** True when domain_discovery was rejected and we fell back to a hardcoded category */
  usedFallback: boolean;
  /** Human-readable category path, e.g. "Electrodomésticos > Cocción > Microondas" */
  categoryPath: string;
  /**
   * Blocking category error — set when the resolved category is not a leaf node.
   * ML accepts non-leaf category IDs on publish but immediately finalizes/closes the listing.
   * When set, publish MUST be blocked. User must provide an exact leaf category via categoria_ml.
   */
  categoryError?: string;
}

/**
 * Enrich a payload with the correct ML category + filtered/filled attributes.
 *
 * @param payload             Original payload (possibly with wrong hardcoded category_id)
 * @param title               Product title — used for ML category prediction
 * @param officialCategoryId  User-provided override (skips prediction when present)
 * @param accessToken         Valid ML OAuth access token
 * @param applianceType       Product type — used to validate resolved category path
 */
export async function enrichPayload(
  payload: MLPayload,
  title: string,
  officialCategoryId: string | undefined,
  accessToken: string,
  applianceType?: ApplianceType
): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  let resolution: MLCategoryResolution | null = null;

  // ── 1. Resolve category ───────────────────────────────────────────────────
  if (officialCategoryId) {
    resolution = await validateCategoryId(officialCategoryId, accessToken);
    if (!resolution) {
      warnings.push(
        `La categoría "${officialCategoryId}" no existe en ML. Se usará la categoría del payload original.`
      );
    } else if (!resolution.supportsMarketplace) {
      warnings.push(
        `La categoría "${officialCategoryId}" (${resolution.categoryName}) solo acepta avisos clasificados — no compra directa.`
      );
    }
  } else {
    // Pass applianceType so resolveCategory can validate the path and fall back if needed
    resolution = await resolveCategory(title, accessToken, applianceType);
    if (!resolution) {
      warnings.push(
        `No se pudo predecir la categoría ML para "${title.slice(0, 40)}...". Se usará category_id del payload.`
      );
    } else {
      if (resolution.usedFallback && resolution.fallbackReason) {
        warnings.push(`Categoría de respaldo: ${resolution.fallbackReason}`);
      }
      if (!resolution.supportsMarketplace) {
        warnings.push(
          `Categoría "${resolution.categoryName}" solo acepta clasificados. Se intentará de todas formas.`
        );
      }
    }
  }

  // ── Hard path validation — BLOCKING ──────────────────────────────────────────
  // Second line of defense: even if resolveCategory returned something (via fallback or
  // user-provided ID), verify its path actually matches the expected product type.
  // This prevents publishing a microwave in "Mesas Ratonas" if the category resolver
  // had an API failure and we somehow still got a resolution back.
  if (resolution && applianceType) {
    const pathValid = validatePathForApplianceType(resolution.pathFromRoot, applianceType);
    if (!pathValid) {
      const keywords = APPLIANCE_PATH_KEYWORDS[applianceType] ?? [];
      const expectedKwds = keywords.length > 0 ? `"${keywords.join('", "')}"` : '(sin palabras clave definidas)';
      const pathError =
        `Categoría incorrecta: se resolvió "${resolution.categoryName}" ` +
        `(${resolution.pathString}) pero el producto es "${applianceType}". ` +
        `El camino de categoría no contiene las palabras clave esperadas: ${expectedKwds}. ` +
        `Especificá la categoría exacta en la columna "categoria_ml".`;

      logger.warn('publish', 'Blocking publish: category path does not match product type', {
        applianceType,
        resolvedCategory: resolution.categoryName,
        resolvedPath: resolution.pathString,
        expectedKeywords: keywords,
        usedFallback: resolution.usedFallback,
        officialCategoryId: officialCategoryId ?? '(auto-resolved)',
      });

      return {
        payload: { ...payload, category_id: resolution.categoryId },
        resolution,
        warnings,
        missingRequired: [],
        hasBlockingMissing: false,
        usedFallback: resolution.usedFallback,
        categoryPath: resolution.pathString,
        categoryError: pathError,
      };
    }
  }

  // ── Leaf category check — BLOCKING ────────────────────────────────────────
  // ML accepts non-leaf category IDs on publish but immediately finalizes/closes the listing.
  // Root cause of "Finalizada por Mercado Libre — Estaba en una categoría incorrecta."
  if (resolution && !resolution.isLeaf) {
    const leafError = officialCategoryId
      ? `La categoría "${officialCategoryId}" (${resolution.categoryName}) no es una categoría hoja en ML. Navegá la jerarquía y especificá la subcategoría más específica en categoria_ml.`
      : `La categoría resuelta "${resolution.categoryName}" (${resolution.categoryId}) no es una categoría hoja. ML finalizará el anuncio inmediatamente. Especificá la categoría exacta en la columna categoria_ml. Ruta actual: ${resolution.pathString}`;

    logger.warn('publish', `Blocking publish: resolved category is not a leaf`, {
      categoryId: resolution.categoryId,
      categoryName: resolution.categoryName,
      pathString: resolution.pathString,
      officialCategoryId: officialCategoryId ?? '(auto-resolved)',
    });

    return {
      payload: { ...payload, category_id: resolution.categoryId },
      resolution,
      warnings,
      missingRequired: [],
      hasBlockingMissing: true,
      usedFallback: resolution.usedFallback,
      categoryPath: resolution.pathString,
      categoryError: leafError,
    };
  }

  // ── Fallback category leaf check — BLOCKING ───────────────────────────────
  // When resolveCategory returned null (API failure, wrong domain, no fallback), we fall
  // back to the hardcoded payload.category_id. But hardcoded IDs like MLA1577/MLA4749 are
  // often non-leaf. We must validate them before sending to ML.
  if (!resolution) {
    const fallbackValidation = await validateCategoryId(payload.category_id, accessToken);
    if (!fallbackValidation) {
      const err = `La categoría "${payload.category_id}" no existe en Mercado Libre. Especificá la categoría correcta en la columna "categoria_ml".`;
      logger.warn('publish', 'Blocking publish: hardcoded category_id does not exist in ML', { categoryId: payload.category_id });
      return {
        payload,
        resolution: null,
        warnings,
        missingRequired: [],
        hasBlockingMissing: true,
        usedFallback: false,
        categoryPath: payload.category_id,
        categoryError: err,
      };
    }
    if (!fallbackValidation.isLeaf) {
      const err = `La categoría "${payload.category_id}" (${fallbackValidation.categoryName}) no es una categoría hoja. ML finalizará el anuncio inmediatamente. Especificá la subcategoría exacta en "categoria_ml". Ruta: ${fallbackValidation.pathString}`;
      logger.warn('publish', 'Blocking publish: hardcoded category_id is not a leaf', {
        categoryId: payload.category_id,
        categoryName: fallbackValidation.categoryName,
        pathString: fallbackValidation.pathString,
      });
      return {
        payload,
        resolution: fallbackValidation,
        warnings,
        missingRequired: [],
        hasBlockingMissing: true,
        usedFallback: false,
        categoryPath: fallbackValidation.pathString,
        categoryError: err,
      };
    }
    // Fallback category is valid leaf — use it, with a warning
    warnings.push(`Categoría resuelta por fallback: ${fallbackValidation.categoryName} (${fallbackValidation.categoryId}). Para mayor precisión, especificá "categoria_ml".`);
    // resolution remains null but we know categoryId is valid — continue with payload.category_id
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
    return {
      payload: enrichedPayload,
      resolution,
      warnings,
      missingRequired: [],
      hasBlockingMissing: false,
      usedFallback: resolution?.usedFallback ?? false,
      categoryPath: resolution?.pathString ?? resolvedCategoryId,
      categoryError: undefined,
    };
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

  return {
    payload: enrichedPayload,
    resolution,
    warnings,
    missingRequired: stillMissing,
    hasBlockingMissing,
    usedFallback: resolution?.usedFallback ?? false,
    categoryPath: resolution?.pathString ?? resolvedCategoryId,
    categoryError: undefined,
  };
}
