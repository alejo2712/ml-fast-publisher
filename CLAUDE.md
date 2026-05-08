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
- `src/lib/validation/index.ts` — `validateDraft(draft)` returns `ValidationResult`
- `ValidationResult` has: `missingFields`, `fieldErrors` (value present but invalid), `isReady`, `status`
- Garbage detection rejects "test", "asd", "xxx", all-digits, repeated chars, etc.
- Validates: title length (10–60), price (>0, >100 floor), stock (integer >0), image URLs, condition enum
- Blocks export/publish until `isReady === true`
- `getMissingFields(draft)` is a backwards-compat alias for CSV parser

### Mercado Libre Integration
- All ML API calls happen server-side — client never sees credentials or tokens
- `src/lib/mercadolibre/auth.ts` — OAuth URL generation, code exchange, token refresh, in-memory store
- `src/lib/mercadolibre/client.ts` — typed fetch wrapper
- `src/lib/mercadolibre/publish.ts` — `publishSingleItem` / `publishBulkItems` + dry-run gate
- `MERCADOLIBRE_DRY_RUN=true` (default) blocks all real API calls — must explicitly set to "false"
- Token store is in-memory (process lifetime). Replace with DB/KV for production.

### API Routes (server-side only)
- `GET  /api/ml/status`    → credential + connection state (no secrets exposed)
- `GET  /api/ml/auth`      → redirects to ML OAuth page
- `GET  /api/ml/callback`  → exchanges code for tokens, redirects back to app
- `POST /api/ml/publish`   → validates payload server-side, calls ML API (or dry-runs)

### Has Backend Now
- Next.js API routes handle all server-side ML work
- Client components call `/api/ml/*` — never import from `src/lib/mercadolibre/`

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
- [x] Strict validation: garbage detection, field-level errors, publish blocked until isReady
- [x] MissingFields shows separate sections for invalid values vs missing values + status banner
- [x] ML integration layer: auth, client, publish, dry-run (server-side only)
- [x] API routes: /api/ml/status, /api/ml/auth, /api/ml/callback, /api/ml/publish
- [x] PublishButton with confirmation modal, dry-run indicator, credential warnings
- [x] Bulk publish: per-row status (idle/publishing/published/dry_run/failed), confirm modal
- [x] .env.example with all required variables

## Next Session Instructions
1. Add Claude/OpenAI integration to replace deterministic inference (`src/lib/inference/index.ts` — swap adapter)
2. Add image upload with vision-based inference
3. Add additional categories: mobile phones, mattresses
4. Persist ML tokens across server restarts (replace in-memory store in `auth.ts` with file/DB/KV)
5. Add inline field editing in bulk results table (edit price/condition per row before publish)
6. Add real ML OAuth test with sandbox credentials

## WARNINGS — Read Before Enabling Real Publishing
- `MERCADOLIBRE_DRY_RUN` defaults to `true` — no real publish without explicit opt-in
- ML tokens are in-memory only — lost on server restart
- Category IDs (MLA1577 etc.) are estimates — verify via ML API before production
- ML description must not contain phone numbers, emails, or WhatsApp — validation blocks common patterns
- Rate limit: ~50 req/s — bulk publish adds 100ms delay between items

## Implementation Rules
- NEVER hardcode attribute logic in UI components
- ALWAYS add new appliance types in `src/config/categories/appliances.ts`
- Inference adapter is at `src/lib/inference/index.ts` — swap provider there
- Run `npm run dev` to test locally on localhost:3000
