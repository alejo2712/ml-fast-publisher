# Mercado Libre — Category & Attribute Publishing Research

## Production incident: microwave published in Mesas Ratonas

### Evidence (ML emails received 2026-05)

**Listing cancelled — wrong category:**
> "Tu publicación fue finalizada porque se publicó en 'Hogar, Muebles y Jardín > Muebles para el Hogar > Mesas Ratonas y Auxiliares > Mesas Ratonas'. La categoría correcta es 'Electrodomésticos y Aires Ac. > Cocción > Microondas'."

**Listing paused — image quality:**
> "Las fotos de portada no cumplen con los estándares de calidad. Recomendamos: producto de frente, centrado, completo, buena iluminación, 1200 x 1200 px, fondo blanco, sin logos, sin texto, sin marcas de agua."

---

## Root cause analysis

### Bug 1: Fallback failure returned wrong-domain category (CRITICAL)

**File:** `src/lib/mercadolibre/category-resolver.ts`

**What happened:**
1. ML's `domain_discovery` API returned "Mesas Ratonas" for the microwave title.
2. `validatePathForApplianceType` correctly detected the mismatch (no "microondas" keyword in path).
3. The code tried to fetch the fallback category `MLA4749` (microwave hardcoded fallback).
4. `buildResolution('MLA4749')` **failed** (API timeout or category ID changed).
5. The code fell through to: `return { ...resolution, usedFallback: true }` — returning "Mesas Ratonas" with a warning flag, not a block.
6. The enricher received "Mesas Ratonas", checked `isLeaf` (it IS a leaf in ML's taxonomy), passed — and published.

**The dangerous line (now fixed):**
```js
// OLD — DANGEROUS
const result: MLCategoryResolution = {
  ...resolution,  // ← "Mesas Ratonas" returned when fallback API fails
  usedFallback: true,
  fallbackReason: reason,
};
return result;
```

**Fix applied:**
```js
// NEW — SAFE
titleCache.set(cacheKey, null);
return null;  // enricher keeps original payload category_id; never publishes wrong domain
```

### Bug 2: Enricher never independently validated the resolved path (CRITICAL)

**File:** `src/lib/mercadolibre/payload-enricher.ts`

The enricher called `resolveCategory` but only checked `isLeaf` on the result. It never re-verified that the resolved category actually matched the product type. This meant any wrong-domain leaf category (furniture, lighting, etc.) returned by `resolveCategory` — even via fallback — would pass through.

**Fix applied:** Added hard path validation in the enricher as a second line of defense:

```js
// After resolution — validate path matches product type
if (resolution && applianceType) {
  const pathValid = validatePathForApplianceType(resolution.pathFromRoot, applianceType);
  if (!pathValid) {
    return { ..., categoryError: 'Categoría incorrecta: ...' }; // BLOCKS publish
  }
}
```

This runs BEFORE the leaf check. Even if the resolver somehow returns a wrong-domain category, the enricher blocks it.

---

## Category path requirements (enforced)

These keyword rules are defined in `APPLIANCE_PATH_KEYWORDS` (category-resolver.ts) and enforced at both the resolver and enricher levels:

| Product type     | Path must contain              | Example correct path |
|------------------|--------------------------------|----------------------|
| microwave        | "microondas"                   | Electrodomésticos > Cocción > Microondas |
| refrigerator     | "heladera", "refriger", or "refrigeración" | Electrodomésticos > Heladeras y Freezers |
| washing_machine  | "lavarropas" or "lavadora"     | Electrodomésticos > Lavarropas |
| freezer          | "freezer" or "congelador"      | Electrodomésticos > Freezers |
| oven             | "horno"                        | Electrodomésticos > Hornos |
| stove            | "cocina" or "anafe"            | Electrodomésticos > Cocinas |

### Blocked paths (examples)

Any path from these ML top-level categories is blocked for appliance products:
- `Hogar, Muebles y Jardín` — furniture/decor
- `Computación` — computing
- `Celulares y Telefonía` — phones

---

## Hard-blocking category policy

Starting from the fix (2026-05-15), the publish flow enforces two independent blocking checks:

1. **In category-resolver.ts:** If `domain_discovery` returns wrong-domain category AND fallback fails → return `null` (do not publish, do not return wrong category).
2. **In payload-enricher.ts:** After any category resolution (including user-provided `categoria_ml`), validate path against `applianceType`. If mismatch → `categoryError` → block before `POST /items`.

There is no "best effort" fallback that can publish into an unrelated category. If both resolution and fallback fail, the row gets `preflight_failed` with a clear message telling the seller to specify `categoria_ml`.

---

## Image quality requirements (from ML emails)

ML may pause or cancel listings if cover photos don't meet these standards:

| Requirement       | Value                                  |
|-------------------|----------------------------------------|
| Minimum size      | 1200 × 1200 px                         |
| Background        | White (#FFFFFF)                        |
| Orientation       | Product facing forward, centered       |
| Completeness      | Full product visible (not cropped)     |
| Lighting          | Well lit, no shadows                   |
| Text              | None (no logos, no watermarks)         |
| Format            | JPEG preferred; PNG accepted           |

**Test images** (`tests/fixtures/images/`): 4 solid-white 1200×1200 PNG files generated by `scripts/generate-test-images.ts`. These satisfy format/size requirements for pipeline testing. Replace with real product photos for actual listings.

---

## Safe image upload flow (bulk publishing)

Excel `imagenes` column accepts:
- **HTTPS URLs** — used as-is in the ML payload
- **Local filenames** (e.g., `refrigerator-front-1200.png`) — uploaded to ML CDN via `POST /pictures/items/upload` before `POST /items`; ML-hosted `secure_url` substituted in payload

Missing local files → row blocked: "Imagen local no encontrada: filename.png"

---

## Category resolution flow (updated)

```
Excel row
  → parser → applianceType detected from tipo_producto or inference
  → BulkResults → sends { payload, applianceType, officialCategoryId } to /api/ml/publish
  → enrichPayload():
      1. If officialCategoryId → validateCategoryId(id)
         else → resolveCategory(title, token, applianceType)
              → domain_discovery API
              → if path mismatch → try APPLIANCE_FALLBACK_CATEGORIES[type]
              → if fallback fails → return null (never return wrong domain)
      2. [NEW] Hard path validation: if resolution.path doesn't match applianceType → BLOCK
      3. Leaf check: if !isLeaf → BLOCK (ML closes non-leaf listings immediately)
      4. Fetch category attributes → filter payload attrs → apply defaults
      5. POST /items
```

---

## Test coverage

| Test file | What it covers |
|-----------|----------------|
| `scripts/test-real-publish-pipeline.ts` | Category path validation, image dimensions, fixture parsing, GTIN/dimensions in payload, local image file matching |
| `scripts/test-real-fixture.ts` | Full fixture assertions (applianceType, GTIN, dimensions, images, category path keywords) |
| `scripts/test-bulk-parser.ts` | CSV/XLSX parser, local image ref detection, category path blocking |

Run all tests:
```bash
npm run test:bulk
npm run test:real-fixture
npm run test:real-publish-pipeline
```
