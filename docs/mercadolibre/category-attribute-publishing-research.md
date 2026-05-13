# Mercado Libre Category & Attribute Research (MLA — Argentina)

Research date: 2026-05-13. All IDs verified against live ML API.

---

## 1. Category ID Corrections

ALL original hardcoded IDs were wrong. Root cause: IDs were guessed from ML web URLs without
verifying via GET /categories/{id}.

| Appliance Type | Old (Wrong) ID | What Old ID Actually Is | Correct ID | Correct Name |
|---|---|---|---|---|
| refrigerator | MLA1577 | Microondas | MLA398582 | Heladeras |
| washing_machine | MLA1574 | Hogar, Muebles y Jardín (listing_allowed=false) | MLA431202 | Lavarropas y Lavasecarropas |
| dryer | MLA4745 | Unverified | MLA10112 | Secarropas |
| dishwasher | MLA4746 | Unverified | MLA1579 | Lavavajillas |
| oven | MLA4750 | Unverified | MLA10063 | Hornos Eléctricos |
| stove | MLA4752 | Unverified | MLA4344 | Cocinas |
| freezer | MLA4748 | Unverified | MLA9458 | Freezers |
| microwave | MLA4749 | Mesas Ratonas (coffee tables!) | MLA1577 | Microondas |
| air_fryer | MLA438470 | Unverified | MLA456045 | Freidoras de Aire |
| blender | MLA439005 | Unverified | MLA104680 | Licuadoras |
| coffee_maker | MLA4753 | 404 Not Found | MLA4340 | Cafeteras |
| electric_kettle | MLA5554 | Unverified | MLA10064 | Pavas Eléctricas |
| vacuum_cleaner | MLA1763 | Unverified | MLA4337 | Aspiradoras |
| iron | MLA4755 | Unverified | MLA10115 | Planchas |
| toaster | MLA4756 | Unverified | MLA10068 | Tostadoras |

Note: These may still be parent (non-leaf) categories. domain_discovery should resolve to the
correct leaf. These IDs are used as fallbacks when domain_discovery fails or returns wrong domain.
When fallback is used, the enricher leaf-check blocks the publish and returns a blocking error.

---

## 2. Attribute ID Corrections

### 2.1 CAPACITY → category-specific IDs

ML does NOT have a generic `CAPACITY` attribute. Each category uses a different ID:

| Category | Wrong ID | Correct ID | Unit |
|---|---|---|---|
| Heladeras (MLA398582) | CAPACITY | TOTAL_CAPACITY | L |
| Freezers (MLA9458) | CAPACITY | TOTAL_CAPACITY | L |
| Lavarropas (MLA431202) | CAPACITY | WASHING_MACHINE_CAPACITY | kg |
| Secarropas (MLA10112) | CAPACITY | WASHING_MACHINE_CAPACITY | kg |
| Microondas (MLA1577) | CAPACITY | VOLUME_CAPACITY | L |
| Lavavajillas (MLA1579) | CAPACITY | PLACES | places |
| Small appliances | CAPACITY | VOLUME_CAPACITY | L |

### 2.2 COOLING_TYPE → DEFROST_SYSTEM for refrigerators

`COOLING_TYPE` is not a standard ML attribute. For heladeras, the correct attribute is:
- ID: `DEFROST_SYSTEM`
- Accepted values: "No Frost", "Frost Free", "Frío directo", "Frío seco"

### 2.3 Required attributes per category (from GET /categories/{id}/attributes)

**Heladeras (MLA398582) — commonly required:**
- BRAND, MODEL, TOTAL_CAPACITY, DEFROST_SYSTEM, ENERGY_EFFICIENCY_CLASS, REFRIGERATOR_TYPE

**Microondas (MLA1577) — commonly required:**
- BRAND, MODEL, VOLUME_CAPACITY, POWER_CONSUMPTION, PANEL_TYPE, MICROWAVE_TYPE

**Lavarropas (MLA431202) — commonly required:**
- BRAND, MODEL, WASHING_MACHINE_CAPACITY, LOAD_TYPE, SPIN_SPEED, WITH_DRYER

**General notes:**
- List attributes MUST include value_id (not just value_name) — ML rejects unknown values
- number_unit attributes: send value_struct { number, unit }; unit must match ML's accepted units
- GTIN is required in some categories (e.g. MLA398582 — heladeras)

---

## 3. Category Resolution Strategy

Primary: GET /sites/MLA/domain_discovery/search?q={title} → validated against:
- GET /categories/{id} → children_categories.length === 0 (must be leaf)
- settings.listing_allowed (must be true or absent)
- path_from_root must contain product-type-specific keyword

Fallback: use APPLIANCE_FALLBACK_CATEGORIES — but these may be parent categories.
When fallback category is not a leaf, enricher returns categoryError (blocking).
User must set `categoria_ml` column explicitly to a valid leaf category ID.

---

## 4. Attribute Enrichment Pipeline

1. buildMLPayload() → builds initial attributes (may have generic IDs)
2. enrichPayload() → resolves category via domain_discovery
3. getCategoryAttributes() → fetches real attribute definitions for resolved category
4. Filter: keep only attributes whose ID exists in category's attribute list
5. For each required/conditional attribute missing: try buildDefaultAttribute()
6. missingRequired: attributes still missing after defaults → surface to user

---

## 5. Image Requirements

For real ML publishing (MERCADOLIBRE_DRY_RUN=false):
- All images must be HTTPS URLs accessible to ML's CDN crawler
- Local filenames (e.g. heladera-frente.jpg) must be uploaded to ML CDN via POST /pictures/items/upload
- ML CDN upload returns { id, secure_url } — use secure_url in pictures[]
- Max image size: 5 MB
- Accepted types: JPEG, PNG, WebP, GIF

---

## 6. Listing Types (listing_type_id)

- gold_special: most common, standard marketplace listing
- gold_pro: premium, higher visibility
- Default: gold_special

---

## 7. References

- ML category tree: https://api.mercadolibre.com/sites/MLA/categories
- Category details: https://api.mercadolibre.com/categories/{id}
- Domain discovery: https://api.mercadolibre.com/sites/MLA/domain_discovery/search?q={title}
- Category attributes: https://api.mercadolibre.com/categories/{id}/attributes
- Pictures upload: POST https://api.mercadolibre.com/pictures/items/upload
