# ml-fast-publisher — Project Context

## Goal
MVP frontend that lets users publish products to Mercado Libre in FEWER steps than ML's native flow, powered by a deterministic inference engine (AI-replaceable later).

## MVP Scope (TODAY)
- Home appliances (large + small)
- Single-product assisted flow: text → infer → confirm missing → JSON preview
- No ML API integration yet — only draft generation and preview

## Future Categories
- Mobile phones, mattresses, sommiers, bed sheets, pillows, bicycles, baby strollers, skateboards, electric scooters

---

## Architecture Decisions

### Config-Driven, Not Hardcoded
- Category rules live in `src/config/categories/`
- Every appliance type has its own attribute schema
- UI reads schemas — never hardcodes field lists

### Inference Engine (Deterministic)
- `src/lib/inference/` — keyword detection, regex, dictionaries
- Designed with an adapter interface so it can be swapped for Claude/OpenAI later
- Entry: `inferProduct(input: string): InferenceResult`

### Payload Builder
- `src/lib/payload-builder/` — converts inference result into ML-ready JSON
- ML listing structure: title, description, price, currency_id, condition, category_id, listing_type_id, attributes[], pictures[], shipping

### Validation
- `src/lib/validation/` — Zod schemas per product type
- Determines which required fields are missing

### No Backend
- Fully frontend-only for MVP
- All inference runs client-side

### CSV Bulk Mode
- CSV column definitions live in `src/lib/csv/template.ts` — single source of truth for headers, examples, and hints
- To add a CSV column: add one entry to `CSV_COLUMNS` in `template.ts` — parser picks it up automatically
- Parser: `src/lib/csv/parser.ts` — `parseCsvText(text)` returns `CsvParseResult` with per-row status
- Each row runs `inferProduct` → `buildProductDraft` → `buildMLPayload` → `getMissingFields` (all reused from single flow)
- Downloadable template always reflects current `CSV_COLUMNS` — no maintenance needed
- Export: `exportAllPayloads(rows)` dumps all valid rows as a JSON array

---

## ML Listing Structure (Key Fields)
Required fields: title, category_id, price, currency_id, available_quantity, buying_mode, condition, listing_type_id, pictures
Attributes use { id, value_name } or { id, value_id, value_name } for controlled vocab
Category prediction: GET /sites/{site_id}/domain_discovery/search?q={title}

## ML Category IDs (Argentina — MLA, estimates — verify before prod)
- Refrigerators: MLA1577, Washing Machines: MLA1574, Dryers: MLA4745
- Dishwashers: MLA4746, Ovens: MLA4750, Stoves: MLA4752, Freezers: MLA4748
- Microwaves: MLA4749, Air Fryers: MLA438470, Blenders: MLA439005
- Coffee Makers: MLA4753, Electric Kettles: MLA5554
- Vacuum Cleaners: MLA1763, Irons: MLA4755

## ML Common Attribute IDs
BRAND, MODEL, GTIN, COLOR, VOLTAGE, CAPACITY, WEIGHT, HEIGHT, WIDTH, DEPTH,
ENERGY_EFFICIENCY, COOLING_TYPE, POWER_CONSUMPTION, TYPE

---

## Current Status
- [x] Project scaffolded (Next.js 15, TypeScript, Tailwind)
- [x] Core types, category config, inference engine, payload builder built
- [x] Single-product assisted flow (text → infer → review → JSON export)
- [x] CSV bulk mode (upload or paste → per-row inference → validation → bulk JSON export)
- [x] Downloadable CSV template auto-generated from column definitions
- [x] ModeShell: single-product / bulk toggle on main page

## Next Session Instructions
1. Add Claude/OpenAI integration to replace deterministic inference (`src/lib/inference/index.ts` — swap adapter)
2. Add image upload with vision-based inference
3. Add additional categories: mobile phones, mattresses
4. Consider real ML API integration (requires OAuth credentials)
5. Add inline field editing in the bulk results table (edit price/condition per row before export)

## Implementation Rules
- NEVER hardcode attribute logic in UI components
- ALWAYS add new appliance types in `src/config/categories/appliances.ts`
- Inference adapter is at `src/lib/inference/index.ts` — swap provider there
- Run `npm run dev` to test locally on localhost:3000
