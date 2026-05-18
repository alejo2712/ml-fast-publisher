/**
 * ML category resolution via the domain_discovery API.
 * SERVER-SIDE only — never import in client components.
 *
 * Flow:
 *   1. Query /sites/MLA/domain_discovery/search?q={title} → best match category ID
 *   2. Fetch /categories/{id} → validate leaf + marketplace support + path_from_root
 *   3. Validate path against expected appliance-type keywords — reject non-appliance results
 *      (domain_discovery can return furniture/decor for appliance queries)
 *   4. Fall back to hardcoded safe category when path validation fails
 *   5. Cache both steps in-process (survives the lifetime of a serverless invocation)
 */

import type { ApplianceType } from '@/types';
import { mlGet } from './client';
import { logger } from '@/lib/logger';

export interface MLCategoryResolution {
  categoryId: string;
  categoryName: string;
  domainId: string;
  /** Full breadcrumb path from root — used to validate the resolved category is correct */
  pathFromRoot: Array<{ id: string; name: string }>;
  /** Human-readable path string, e.g. "Electrodomésticos > Cocción > Microondas" */
  pathString: string;
  /** True when the category has no child categories — ML requires leaf categories */
  isLeaf: boolean;
  /** True when the category supports standard buy-it-now marketplace listings */
  supportsMarketplace: boolean;
  /** True when domain_discovery result was rejected and we fell back to hardcoded category */
  usedFallback: boolean;
  /** Reason for fallback (if usedFallback=true) */
  fallbackReason?: string;
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

// In-process caches — keyed by lowercased title prefix and category ID respectively.
// These don't persist between serverless invocations, but prevent duplicate calls
// within a single bulk publish request.
const titleCache = new Map<string, MLCategoryResolution | null>();
const detailsCache = new Map<string, MLCategoryDetail | null>();

const MARKETPLACE_LISTING_TYPES = new Set(['gold_special', 'gold_pro', 'gold', 'silver', 'bronze']);
const SITE_ID = 'MLA';

/**
 * SPECIFIC keywords that MUST appear in the category path_from_root for each appliance type.
 * Prevents domain_discovery from assigning furniture/decor/unrelated categories to appliances.
 * Matching is case-insensitive against the full path string.
 *
 * IMPORTANT: Do NOT include generic words like 'electro' here — they match almost any
 * Electrodomésticos subcategory and would let wrong domain categories slip through.
 * Each entry must have at least one product-type-specific term.
 */
export const APPLIANCE_PATH_KEYWORDS: Partial<Record<ApplianceType, string[]>> = {
  refrigerator:    ['heladera', 'refriger', 'refrigeración'],
  freezer:         ['freezer', 'congelador'],
  washing_machine: ['lavarropas', 'lavadora'],
  dryer:           ['secarropas', 'secadora'],
  dishwasher:      ['lavavajillas', 'lavaplatos'],
  oven:            ['horno'],
  stove:           ['cocina', 'anafe'],
  microwave:       ['microondas'],
  air_fryer:       ['freidora'],
  blender:         ['licuadora', 'procesadora'],
  coffee_maker:    ['cafetera'],
  electric_kettle: ['pava', 'hervidor'],
  vacuum_cleaner:  ['aspiradora'],
  iron:            ['plancha'],
  toaster:         ['tostadora'],
  mixer:           ['mixer', 'batidora'],
};

/**
 * Hardcoded fallback category IDs were REMOVED.
 *
 * All previously-stored IDs (MLA1577, MLA4749, etc.) pointed to completely wrong categories
 * after ML re-assigned them (MLA1577 = Microondas, MLA4749 = Mesas Ratonas, etc.).
 *
 * The only safe fallback is:
 *   - Use domain_discovery to get the right category
 *   - Validate it passes path keywords AND is a leaf
 *   - If domain_discovery fails or returns wrong domain → return null → block publish
 *   - User must specify the correct leaf category_id via the "categoria_ml" column
 *
 * Do NOT add new hardcoded IDs here without verifying them against the live ML API first.
 */

/**
 * Validate that a category's path_from_root matches the expected appliance type.
 * Returns true when the path contains at least one expected keyword.
 */
export function validatePathForApplianceType(
  path: Array<{ id: string; name: string }>,
  applianceType: ApplianceType | undefined
): boolean {
  if (!applianceType) return true; // can't validate without type — allow
  const keywords = APPLIANCE_PATH_KEYWORDS[applianceType];
  if (!keywords || keywords.length === 0) return true;

  const fullPath = path.map((p) => p.name.toLowerCase()).join(' ');
  return keywords.some((kw) => fullPath.includes(kw));
}

/**
 * Resolve ML category from a product title using ML's domain_discovery API.
 * When applianceType is provided, validates the resolved category path and falls
 * back to a safe hardcoded category when domain_discovery returns the wrong domain.
 * Returns null when the API is unavailable or returns no results.
 */
export async function resolveCategory(
  title: string,
  accessToken: string,
  applianceType?: ApplianceType
): Promise<MLCategoryResolution | null> {
  const cacheKey = `${applianceType ?? ''}:${title.toLowerCase().trim().slice(0, 80)}`;
  if (titleCache.has(cacheKey)) return titleCache.get(cacheKey)!;

  let results: DomainDiscoveryResult[];
  try {
    const query = encodeURIComponent(title.trim());
    results = await mlGet<DomainDiscoveryResult[]>(
      `/sites/${SITE_ID}/domain_discovery/search?q=${query}&limit=1`,
      accessToken
    );
  } catch {
    titleCache.set(cacheKey, null);
    return null;
  }

  if (!Array.isArray(results) || results.length === 0) {
    titleCache.set(cacheKey, null);
    return null;
  }

  const resolution = await buildResolution(results[0].id, results[0].name, results[0].domain_id, accessToken);
  if (!resolution) {
    titleCache.set(cacheKey, null);
    return null;
  }

  // Validate the resolved category path against the expected appliance type.
  // If domain_discovery returns a wrong-domain category (e.g. furniture for a microwave),
  // we MUST return null — never publish in an unrelated category.
  // There are no safe hardcoded fallbacks (all previously-stored IDs were wrong after ML re-assignment).
  // The user must supply the correct leaf category via the "categoria_ml" column.
  if (applianceType && !validatePathForApplianceType(resolution.pathFromRoot, applianceType)) {
    logger.warn('category-resolver', 'domain_discovery returned wrong-domain category — blocking, no fallback', {
      applianceType,
      resolvedCategory: resolution.categoryName,
      resolvedPath: resolution.pathString,
    });
    titleCache.set(cacheKey, null);
    return null;
  }

  titleCache.set(cacheKey, resolution);
  return resolution;
}

/**
 * Validate a user-provided category ID and return its resolution metadata.
 * Returns null if the category does not exist.
 */
export async function validateCategoryId(
  categoryId: string,
  accessToken: string
): Promise<MLCategoryResolution | null> {
  return buildResolution(categoryId, '', '', accessToken);
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
  const pathFromRoot = details.path_from_root ?? [];
  const pathString = pathFromRoot.map((p) => p.name).join(' > ') || details.name;

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
    pathFromRoot,
    pathString,
    isLeaf,
    supportsMarketplace,
    usedFallback: false,
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
