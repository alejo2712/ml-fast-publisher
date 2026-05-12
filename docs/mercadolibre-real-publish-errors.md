# Mercado Libre Real Publish — Observed Errors

First real bulk publish attempt. Environment: production (Vercel), MERCADOLIBRE_DRY_RUN=false.

**Result summary:**
- totalPublished: 0
- totalFailed: 8
- totalSkipped: 1
- dryRun: false

---

## Error Categories

### 1. Category ID problems

**Category does not exist**
```
ML POST /items 400: Some of your data is invalid for the following reasons: category_id ...
cause: [{ "code": 109, "description": "category_id: Invalid category." }]
```
Our hardcoded IDs (MLA1577, MLA1574, etc.) appear to be wrong or removed by ML.

**Category is not a leaf**
```
cause: [{ "code": 109, "description": "category_id: The category is not a leaf." }]
```
ML requires a leaf-level category (most specific child). We were pointing to parent categories.

**Category only supports classified mode**
```
cause: [{ "code": 109, "description": "category_id: This category only supports classified listings." }]
```
Classified listings have different rules (no price, contact-based). We need marketplace categories.

**Fix needed:** Replace hardcoded IDs with dynamic resolution via:
```
GET https://api.mercadolibre.com/sites/MLA/domain_discovery/search?q={product_title}
```
Then validate: category must be leaf + listing_types must include `gold_special` or equivalent.

---

### 2. Missing required ML attributes

These attributes were absent from our payload but required by the resolved category:

| Attribute ID | Label | Notes |
|---|---|---|
| `GTIN` | Código EAN/UPC/GTIN | Required for electronics/appliances in some categories |
| `POWER_SUPPLY_TYPE` | Tipo de alimentación | e.g. "220V", "Batería", "Bivolt" |
| `MANUFACTURER` | Fabricante | Different from BRAND in some categories |
| `HEIGHT` | Alto | Dimensions in cm — required for large appliances |
| `REQUIRES_ASSEMBLY` | Requiere armado | Boolean — required for furniture-adjacent categories |
| `INCLUDES_ASSEMBLY_MANUAL` | Incluye manual de armado | Boolean — paired with REQUIRES_ASSEMBLY |

**Fix needed:** For each resolved category, call:
```
GET https://api.mercadolibre.com/categories/{category_id}/attributes
```
Filter `tags.required: true` and `tags.conditionally_required: true`. Build attributes array dynamically.

---

### 3. Wrong attribute mapping — CAPACITY

**Observed error:**
```
cause: [{ "code": 112, "description": "CAPACITY: The value 320 L is not valid. 
  Valid values: 1 GB, 2 GB, 4 GB, ..." }]
```

ML is interpreting our `CAPACITY` attribute as **digital storage** (GB/TB), not appliance capacity (L/kg).

**Root cause:** We send `{ id: "CAPACITY", value_name: "320 L" }` generically.
The category we resolved maps `CAPACITY` to digital storage, not appliance capacity.

**Correct attribute IDs by appliance type (to verify against ML API):**

| Appliance | Correct attribute | Unit |
|---|---|---|
| Heladera | `REFRIGERATOR_CAPACITY` or category-specific ID | Litros |
| Freezer | `FREEZER_CAPACITY` or category-specific ID | Litros |
| Lavarropas | `LOAD_CAPACITY` | Kg |
| Microondas | `INTERNAL_VOLUME` | Litros |
| Horno | `INTERNAL_VOLUME` | Litros |

**Fix needed:** Never send `CAPACITY` as a generic attribute. Fetch allowed attributes per category and use the correct ID + accepted unit from ML's attribute definition.

---

### 4. Shipping mode issues

**Observed error:**
```
cause: [{ "code": 109, "description": "shipping.methods: The shipping method is not valid for this user/item." }]
```

We hardcode `me2` (Mercado Envíos 2) as the default shipping mode. Some categories or users may not have `me2` enabled.

**Fix needed:**
- Fetch allowed shipping modes: `GET /users/{user_id}/shipping_modes`
- If `me2` is not in the allowed list, fall back to `not_specified`
- Never hardcode `me2` for categories where it may not apply (e.g., very large/heavy items)

---

### 5. Missing images (preflight catch)

One row failed preflight (not ML API) because `images` field was empty.

This was correctly caught by our preflight check:
```
images: error — Sin imágenes — al menos 1 imagen es requerida por Mercado Libre
```
Row was marked `preflight_failed` and skipped. This is working as intended.

**Action:** Ensure all rows have at least 1 HTTPS image URL before attempting real publish.

---

## Summary of required fixes (priority order)

1. **Dynamic category resolution** — highest impact, unblocks all other fixes
   - `GET /sites/MLA/domain_discovery/search?q={title}`
   - Validate leaf + marketplace support

2. **Category attributes fetcher** — needed to know what to send
   - `GET /categories/{id}/attributes`
   - Cache result per category

3. **Correct attribute IDs** — replace generic CAPACITY, add missing attributes
   - GTIN, MANUFACTURER, POWER_SUPPLY_TYPE, HEIGHT, REQUIRES_ASSEMBLY, etc.
   - Fetch accepted units from ML attribute definition

4. **Shipping mode detection** — avoid hardcoded me2
   - `GET /users/{user_id}/shipping_modes`
   - Safe fallback: `not_specified`

5. **Pre-publish ML attribute validation in preflight**
   - Check required attributes are present
   - Check attribute IDs are valid for the category
   - Surface errors before attempting POST /items

---

## ML API references

| Endpoint | Purpose |
|---|---|
| `GET /sites/MLA/domain_discovery/search?q=heladera+samsung` | Category prediction by text |
| `GET /categories/{id}` | Category details (leaf, path, settings) |
| `GET /categories/{id}/attributes` | Required/optional attributes for a category |
| `GET /listing_types/{listing_type_id}` | Validate listing type support |
| `GET /users/{user_id}/shipping_modes` | Allowed shipping modes for user |
| `POST /items/validate` | Validate payload without publishing (undocumented but works in some contexts) |

---

*Recorded: Session 14 — first real bulk publish attempt*
*See CLAUDE.md "NEXT PRIORITY" section for the implementation plan.*
