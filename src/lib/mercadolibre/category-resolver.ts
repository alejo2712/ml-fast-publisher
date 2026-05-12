/**
 * ML category resolution via the domain_discovery API.
 * SERVER-SIDE only — never import in client components.
 *
 * Flow:
 *   1. Query /sites/MLA/domain_discovery/search?q={title} → best match category ID
 *   2. Fetch /categories/{id} → validate leaf + marketplace support
 *   3. Cache both steps in-process (survives the lifetime of a serverless invocation)
 */

import { mlGet } from './client';

export interface MLCategoryResolution {
  categoryId: string;
  categoryName: string;
  domainId: string;
  /** True when the category has no child categories — ML requires leaf categories */
  isLeaf: boolean;
  /** True when the category supports standard buy-it-now marketplace listings */
  supportsMarketplace: boolean;
  /** Breadcrumb path from root — e.g. ["Electrodomésticos", "Cocina", "Microondas"] */
  pathFromRoot: Array<{ id: string; name: string }>;
}

interface DomainDiscoveryResult {
  id: string;
  name: string;
  domain_id: string;
}

interface MLCategoryDetail {
  id: string;
  name: string;
  children_categories: Array<{ id: string; name: string }>;
  path_from_root?: Array<{ id: string; name: string }>;
  settings?: {
    listing_allowed?: boolean;
    listing_types?: string[];
  };
}

// ── Product-type compatibility check ─────────────────────────────────────────

/**
 * Keywords that indicate a category is in the appliance/electrodomésticos branch.
 * If ANY node in path_from_root contains one of these → it's an appliance category.
 */
const APPLIANCE_PATH_KEYWORDS = ['electro', 'cocina', 'hogar'] as const;

/**
 * Keywords in a category name that confirm a specific product type.
 * Lower-cased match against the resolved category name.
 */
const PRODUCT_TYPE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  microwave:       ['microondas', 'microwave'],
  refrigerator:    ['heladera', 'refrigerador', 'freezer', 'congelador'],
  washing_machine: ['lavarropas', 'lavadora'],
  dryer:           ['secadora', 'secarropa'],
  oven:            ['horno'],
  air_fryer:       ['freidora', 'air fryer'],
  blender:         ['licuadora', 'procesadora'],
  coffee_maker:    ['cafetera'],
  vacuum_cleaner:  ['aspiradora'],
  iron:            ['plancha'],
  electric_kettle: ['pava', 'hervidor'],
  dishwasher:      ['lavavajilla', 'lavarropa'],
  freezer:         ['freezer', 'congelador'],
};

/**
 * Return true when the resolved category path is consistent with an appliance.
 * Any node containing "electro", "cocina", or "hogar" (case-insensitive) qualifies.
 */
function pathContainsApplianceNode(path: Array<{ id: string; name: string }>): boolean {
  return path.some((node) =>
    APPLIANCE_PATH_KEYWORDS.some((kw) => node.name.toLowerCase().includes(kw))
  );
}

/**
 * Check whether a resolved ML category is compatible with a given product type.
 *
 * Returns `{ compatible: true }` when:
 *  - The category path contains an appliance node, AND
 *  - The category name matches the expected product-type keywords (or no keywords defined)
 *
 * Returns `{ compatible: false, reason }` when:
 *  - The category path has NO appliance node (e.g. Muebles, Ropa), OR
 *  - The category name does not match any expected keyword for the product type
 */
export function isCategoryCompatibleWithProductType(
  resolution: MLCategoryResolution,
  productType: string
): { compatible: boolean; reason?: string } {
  const normalizedType = productType.toLowerCase().replace(/[\s-]/g, '_');
  const categoryNameLower = resolution.categoryName.toLowerCase();

  // Step 1: path must be in the appliance branch (or unknown path → skip check)
  if (resolution.pathFromRoot.length > 0) {
    if (!pathContainsApplianceNode(resolution.pathFromRoot)) {
      return {
        compatible: false,
        reason: `Categoría "${resolution.categoryName}" (${resolution.categoryId}) no está en la rama de electrodomésticos. Ruta: ${resolution.pathFromRoot.map((n) => n.name).join(' > ')}.`,
      };
    }
  }

  // Step 2: category name must match expected keywords for the product type
  const expectedKeywords = PRODUCT_TYPE_CATEGORY_KEYWORDS[normalizedType];
  if (expectedKeywords && expectedKeywords.length > 0) {
    const nameMatch = expectedKeywords.some((kw) => categoryNameLower.includes(kw));
    if (!nameMatch) {
      return {
        compatible: false,
        reason: `Categoría "${resolution.categoryName}" (${resolution.categoryId}) no coincide con el tipo de producto "${productType}". Palabras esperadas: ${expectedKeywords.join(', ')}.`,
      };
    }
  }

  return { compatible: true };
}

// In-process caches — keyed by lowercased title prefix and category ID respectively.
// These don't persist between serverless invocations, but prevent duplicate calls
// within a single bulk publish request.
const titleCache = new Map<string, MLCategoryResolution | null>();
const detailsCache = new Map<string, MLCategoryDetail | null>();

const MARKETPLACE_LISTING_TYPES = new Set(['gold_special', 'gold_pro', 'gold', 'silver', 'bronze']);
const SITE_ID = 'MLA';

/**
 * Resolve ML category from a product title using ML's domain_discovery API.
 *
 * When `productType` is provided:
 *  1. Resolve from title as usual
 *  2. If the resolved category is incompatible with the product type (e.g. microwave
 *     resolving to a furniture category), retry with "{productType} {title}" as query
 *  3. If the retry is still incompatible → return null so caller can apply a fallback
 *
 * Returns null when the API is unavailable or returns no results.
 */
export async function resolveCategory(
  title: string,
  accessToken: string,
  productType?: string
): Promise<MLCategoryResolution | null> {
  const cacheKey = `${productType ?? ''}::${title.toLowerCase().trim().slice(0, 80)}`;
  if (titleCache.has(cacheKey)) return titleCache.get(cacheKey)!;

  const resolution = await queryDomainDiscovery(title, accessToken);

  // If productType is given, validate compatibility and retry if needed
  if (productType && resolution) {
    const { compatible, reason } = isCategoryCompatibleWithProductType(resolution, productType);
    if (!compatible) {
      // Retry with product type as the leading term to steer ML's classifier
      const retryTitle = `${productType.replace(/_/g, ' ')} ${title}`.slice(0, 100);
      const retryResolution = await queryDomainDiscovery(retryTitle, accessToken);

      if (retryResolution) {
        const retryCheck = isCategoryCompatibleWithProductType(retryResolution, productType);
        if (retryCheck.compatible) {
          titleCache.set(cacheKey, retryResolution);
          return retryResolution;
        }
      }

      // Both title and retry returned incompatible categories — caller must use fallback
      // Store null so we don't repeat the work within this invocation
      titleCache.set(cacheKey, null);
      // Attach the incompatibility reason as a property so enricher can surface it
      return Object.assign(resolution, { _incompatibilityReason: reason, _incompatible: true });
    }
  }

  titleCache.set(cacheKey, resolution);
  return resolution;
}

/** Run a single domain_discovery query and return the first result. */
async function queryDomainDiscovery(
  title: string,
  accessToken: string
): Promise<MLCategoryResolution | null> {
  let results: DomainDiscoveryResult[];
  try {
    const query = encodeURIComponent(title.trim());
    results = await mlGet<DomainDiscoveryResult[]>(
      `/sites/${SITE_ID}/domain_discovery/search?q=${query}&limit=1`,
      accessToken
    );
  } catch {
    return null;
  }

  if (!Array.isArray(results) || results.length === 0) return null;
  return buildResolution(results[0].id, results[0].name, results[0].domain_id, accessToken);
}

/**
 * Validate a user-provided category ID and return its resolution metadata.
 * Returns null if the category does not exist.
 */
export async function validateCategoryId(
  categoryId: string,
  accessToken: string
): Promise<MLCategoryResolution | null> {
  const details = await fetchCategoryDetails(categoryId, accessToken);
  if (!details) return null;
  return buildResolution(details.id, details.name, '', accessToken).then((r) => {
    // Override with the fetched details we already have
    return r;
  });
}

async function buildResolution(
  categoryId: string,
  categoryName: string,
  domainId: string,
  accessToken: string
): Promise<MLCategoryResolution | null> {
  const details = await fetchCategoryDetails(categoryId, accessToken);
  if (!details) return null;

  const isLeaf = details.children_categories.length === 0;

  // supportsMarketplace: true when listing_types is absent (no restriction)
  // or when at least one marketplace type is in the list
  const listingTypes = details.settings?.listing_types;
  const supportsMarketplace =
    !listingTypes ||
    listingTypes.length === 0 ||
    listingTypes.some((lt) => MARKETPLACE_LISTING_TYPES.has(lt));

  return {
    categoryId: details.id,
    categoryName: details.name || categoryName,
    domainId,
    isLeaf,
    supportsMarketplace,
    pathFromRoot: details.path_from_root ?? [],
  };
}

async function fetchCategoryDetails(
  categoryId: string,
  accessToken: string
): Promise<MLCategoryDetail | null> {
  if (detailsCache.has(categoryId)) return detailsCache.get(categoryId)!;

  let details: MLCategoryDetail;
  try {
    details = await mlGet<MLCategoryDetail>(`/categories/${categoryId}`, accessToken);
  } catch {
    detailsCache.set(categoryId, null);
    return null;
  }

  detailsCache.set(categoryId, details);
  return details;
}
