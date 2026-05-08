# Mercado Libre Listing Structure — Research Notes

Source: ML Developer Docs, API exploration, training data

## Minimum Viable Payload

```json
{
  "title": "Heladera Samsung No Frost 320L Blanca Nueva",
  "category_id": "MLA1577",
  "price": 250000,
  "currency_id": "ARS",
  "available_quantity": 1,
  "buying_mode": "buy_it_now",
  "condition": "new",
  "listing_type_id": "gold_special",
  "pictures": [{ "source": "https://url-to-image.jpg" }],
  "attributes": [
    { "id": "BRAND", "value_name": "Samsung" },
    { "id": "MODEL", "value_name": "RT32K5982SL" },
    { "id": "CAPACITY", "value_name": "320 L", "value_struct": { "number": 320, "unit": "L" } }
  ],
  "description": { "plain_text": "Descripción del producto..." },
  "shipping": {
    "mode": "me2",
    "local_pick_up": false,
    "free_shipping": false
  }
}
```

## Required Fields
- title (max ~60 chars recommended, no price, no contact info)
- category_id
- price (must be > 0)
- currency_id (ARS for Argentina — must match site)
- available_quantity
- buying_mode (always "buy_it_now" for fixed-price)
- condition ("new" | "used" | "refurbished")
- listing_type_id
- pictures (at least 1)

## Conditionally Required
- attributes: BRAND, MODEL, GTIN — most categories enforce these
- sale_terms: WARRANTY_TYPE + WARRANTY_TIME
- description: required for some categories

## Attribute Structure

Three forms:
1. Free text: `{ "id": "MODEL", "value_name": "RT38K5982SL" }`
2. Controlled vocab: `{ "id": "BRAND", "value_id": "206325", "value_name": "Samsung" }`
3. Numeric with unit: `{ "id": "CAPACITY", "value_name": "400 L", "value_struct": { "number": 400, "unit": "L" } }`

Always check `GET /categories/{category_id}/attributes` — filter `tags.required === true`.

## Common Appliance Attribute IDs
- BRAND, MODEL, GTIN, COLOR, CAPACITY, VOLTAGE
- ENERGY_EFFICIENCY, HEIGHT, WIDTH, DEPTH, WEIGHT
- COOLING_TYPE, POWER_CONSUMPTION, TYPE

## Category IDs (Argentina — MLA, estimates)
These MUST be verified via `GET https://api.mercadolibre.com/sites/MLA/categories` before production:
- Refrigerators: MLA1577
- Washing Machines: MLA1574
- Dryers: MLA4745
- Dishwashers: MLA4746
- Ovens: MLA4750
- Stoves: MLA4752
- Freezers: MLA4748
- Microwaves: MLA4749
- Air Fryers: MLA438470
- Blenders: MLA439005
- Coffee Makers: MLA4753
- Electric Kettles: MLA5554
- Vacuum Cleaners: MLA1763
- Irons: MLA4755

## Listing Types (highest to lowest)
gold_special > gold_pro > gold > silver > bronze > free
Fetch commissions from `/sites/{site_id}/listing_types` — never hardcode.

## Image Requirements
- Minimum: 500x500 px
- Recommended: 1200x1200 px
- Format: JPG preferred
- Max: 12 images per listing
- No watermarks, no text overlays
- White background for main image
- Submit by URL (ML fetches) or upload via multipart POST

## Shipping
- me2 = Mercado Envíos (standard)
- Dimensions in cm, weight in grams in shipping object
- Large appliances may need freight config

## Category Prediction API
`GET /sites/{site_id}/domain_discovery/search?q={encoded_title}`
Returns ranked category matches with required attributes — great for auto-suggesting from title.

## Key Constraints
- Title max ~60 chars — no price, no contact info
- Description: no phone/email/WhatsApp — ML blocks it
- currency_id must match site (ARS only for MLA)
- Prefer status: "paused" over deleting (deleted = unrecoverable)
- Rate limit: ~50 req/s per token; implement backoff

## Sale Terms (Warranty)
```json
"sale_terms": [
  { "id": "WARRANTY_TYPE", "value_name": "Garantía del vendedor" },
  { "id": "WARRANTY_TIME", "value_name": "6 meses" }
]
```

## Future: AI Integration Hook
The inference flow in this app maps directly to what the ML domain_discovery API returns.
When integrating real AI:
1. Call `/domain_discovery/search?q={title}` → get category + required attributes
2. Use Claude/GPT to fill in the gaps from product photos or description
3. Call `/categories/{id}/attributes` → validate all required fields are present
4. POST to `/items` with OAuth token
