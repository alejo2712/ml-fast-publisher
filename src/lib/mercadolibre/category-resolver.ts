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
 * Resolve ML category from a product title using ML's domain_discovery API.
 * Returns null when the API is unavailable or returns no results.
 */
export async function resolveCategory(
  title: string,
  accessToken: string
): Promise<MLCategoryResolution | null> {
  const cacheKey = title.toLowerCase().trim().slice(0, 80);
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
