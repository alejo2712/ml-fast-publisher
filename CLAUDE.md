# ml-fast-publisher — Project Context

## Goal
Multi-user publishing platform that lets users publish products to Mercado Libre in fewer steps than ML's native flow, powered by a deterministic inference engine (AI-replaceable later).

## MVP Scope
- Home appliances (large + small)
- Single-product assisted flow: text → infer → confirm missing → JSON preview → publish
- CSV bulk mode: upload/paste → per-row inference → validation → bulk export/publish
- Multi-user: PostgreSQL + Prisma, NextAuth v5 (email/password), user-isolated data
- Draft autosave, publish history, product templates

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

### Database (Prisma 7 + PostgreSQL)
- Schema: `prisma/schema.prisma` — source of truth for all models
- Prisma config: `prisma.config.ts` at project root (Prisma 7 requirement — no `url` in schema)
- Client: `src/lib/db.ts` — Prisma singleton using `@prisma/adapter-pg` driver adapter
- Run `docker-compose up -d` to start Postgres locally (port 5432)
- Run `npx prisma migrate dev` to apply migrations
- Run `npx prisma generate` after schema changes

### Auth (NextAuth v5 / Auth.js)
- Config: `src/auth.ts` — Credentials provider, JWT strategy, PrismaAdapter
- Protected routes: `/dashboard`, `/drafts`, `/templates`, `/history`
- Middleware: `src/middleware.ts` — redirects to `/login?callbackUrl=...` if unauthenticated
- Auth guard for API routes: `src/lib/auth-guard.ts` — `requireAuth()` throws 401 Response
- Passwords hashed with bcryptjs (10 rounds)
- Registration: `POST /api/register` — returns 409 on duplicate email
- Sessions: JWT (stateless) — no DB session rows needed

### Data Models
- `User` — email, password hash, timestamps
- `ProductDraft` — userId, title, applianceType, mlCategoryId, condition, price, stock, status (IN_PROGRESS/READY/PUBLISHED/ARCHIVED), draftData Json, lastPayload Json
- `ProductTemplate` — userId, name, applianceType, templateData Json, useCount
- `PublishHistory` — userId, draftId, mlItemId, permalink, status (PENDING/PUBLISHED/DRY_RUN/FAILED/SKIPPED), dryRun, payload Json
- `BulkUpload` — userId, fileName, rowCount, successCount, failedCount, status, results Json
- `MercadoLibreAccount` — userId, mlUserId, siteId, accessToken, refreshToken, expiresAt

### API Routes
All routes in `src/app/api/` — server-side only, no ML credentials in client.
- `GET/POST  /api/drafts`           → list + create drafts (auth-gated)
- `GET/PATCH/DELETE /api/drafts/[id]` → single draft ops (user-scoped)
- `GET/POST  /api/templates`        → list + create templates
- `DELETE/POST /api/templates/[id]` → delete + use (increments useCount)
- `GET/POST  /api/history`          → paginated publish history
- `POST      /api/register`         → create user account
- `GET       /api/ml/status`        → ML credential + connection state
- `GET       /api/ml/auth`          → redirects to ML OAuth page
- `GET       /api/ml/callback`      → exchanges code for tokens
- `POST      /api/ml/publish`       → validates + publishes (or dry-runs), persists history

### Autosave
- Hook: `src/hooks/useAutosave.ts` — debounced 1500ms, creates draft on first save, patches on subsequent
- Wired into `AssistedPublisher` — shows "Guardando..." / "Guardado" indicator in review step
- Errors are silent — never disrupt user flow

### Toast System
- `src/components/Toast/index.tsx` — `ToastProvider` + `useToast()` hook (no external deps)
- `ToastProvider` wraps `{children}` in `src/app/layout.tsx`
- Auto-dismisses after 4 seconds; 4 types: success/error/warning/info

### Dashboard Pages
- `(dashboard)` route group with shared authenticated layout (`AppNav` sidebar)
- `/dashboard` — stats overview + recent drafts + recent history
- `/drafts` — paginated draft list
- `/templates` — template list
- `/history` — paginated publish history

### Mercado Libre Integration
- All ML API calls happen server-side — client never sees credentials or tokens
- `src/lib/mercadolibre/auth.ts` — OAuth URL generation, code exchange, token refresh
- `src/lib/mercadolibre/client.ts` — typed fetch wrapper
- `src/lib/mercadolibre/publish.ts` — `publishSingleItem` / `publishBulkItems` + dry-run gate
- `MERCADOLIBRE_DRY_RUN=true` (default) blocks all real API calls — must explicitly set to "false"
- ML tokens stored in `MercadoLibreAccount` DB table (persisted across restarts)

### Seller Preferences
- Model: `SellerPreferences` (one per user, upserted on first access)
- Fields: `defaultCurrency`, `defaultShipping`, `defaultWarranty`, `localPickUp`, `defaultCondition`, `defaultListingType`
- API: `GET/PUT /api/preferences` — server-side upsert, returns current prefs
- Applied in `AssistedPublisher` on draft creation via `applyPreferences(draft, prefs)`
- Settings UI: `/settings` page with `SettingsForm` component

### Bulk Inline Editing
- `BulkUpload` holds mutable `rows: CsvRowResult[]` state (not `CsvParseResult`)
- `handleRowEdit(rowIndex, changes)` — applies field changes, rebuilds `buildMLPayload` + `validateDraft` in-memory
- `BulkResults` receives `onRowEdit` callback; shows an "Editar" toggle per row
- `EditPanel` — 6 editable fields: title, price, stock, condition, brand, model
- `EditCell` — click-to-edit inline inputs; Enter to commit, Escape to cancel
- Row status badge updates in real-time after edits (ok/warnings/error)
- Skip-invalid-rows option filters errors before displaying
- Row validation errors shown in EditPanel after each change

### Template Usage ("Usar plantilla")
- "Usar plantilla" links to `/?template={id}` (no useCount increment on click)
- `AssistedPublisher` reads `?template` via `useSearchParams`, fetches `GET /api/templates/{id}`
- Banner shown in InputStep with template name + dismiss button
- On form submit: inference → `applyTemplateFallback` (fills blanks inference didn't detect) → `applyPreferences`
- Merge priority: **inference > template > preferences**
- Template fields: brand, model, condition, warranty, listingType, shipping, voltage, color
- Title and price are NOT in templates — user must provide via text description
- useCount incremented via `POST /api/templates/{id}` when user actually submits the form

### Image Upload
- API: `POST /api/uploads` — multipart form, validates type (JPG/PNG/WebP/GIF), max 5 MB
- Files saved to `public/uploads/{userId}/{uuid}.{ext}`, served statically by Next.js
- Component: `src/components/ImageUploader/index.tsx` — drag-drop, click, URL input, thumbnails, remove, set-main
- `ProductDraft.images: string[]` accepts both `https://` URLs and `/uploads/...` local paths
- Validation accepts both — `isValidImageRef()` in `src/lib/validation/index.ts`
- `public/uploads/` is gitignored — not committed to repo

### Image Preparation Layer
- `src/lib/images/types.ts` — `PreparedImage`, `ImagePreparationResult` types
- `src/lib/images/prepare-images.ts` — `prepareImages(paths, dryRun)` — server-only, reads env
- Classification: `external` (https://) → publishable; `local` (/uploads/) → not publishable unless resolved; `public` (local → converted via IMAGE_PUBLIC_BASE_URL) → publishable
- `isLocalImagePath(src)` — client-safe helper exported from prepare-images.ts
- **`/api/ml/publish`**: calls `prepareImages` before forwarding to ML; returns 422 with `imageErrors` if real publish would fail
- **`PublishButton`**: receives `hasLocalImages` prop; in real mode shows amber button + blocks confirm; in dry-run shows informational warning in modal
- **`ReviewStep`**: computes `hasLocalImages`, passes to `PublishButton`, shows amber warning banner in images section
- **`IMAGE_PUBLIC_BASE_URL`** env var (optional): if set with an `https://` base, local paths are rewritten to public URLs — enabling real publish without a CDN migration
- Dry-run always allowed with any image type; real publish blocked unless all images are publishable HTTPS URLs

### Clone / Duplicate
- Drafts: `POST /api/drafts/[id]/duplicate` → creates `(copia)` clone, returns new draft
- History: `POST /api/history/[id]` with `{ action: 'duplicate_draft' }` → creates new IN_PROGRESS draft
- Templates: `POST /api/templates/[id]/duplicate` → clones with `(copia)` suffix

### Retry Failed Publishes
- `POST /api/history/[id]` with `{ action: 'retry' }` → re-posts saved payload to `/api/ml/publish`
- Button shown only for FAILED entries in history table
- Result toasted to user

### Template Favorites
- `isFavorite Boolean` field on `ProductTemplate`
- `POST /api/templates/[id]/favorite` → toggles, returns new boolean
- Templates page sorts favorites first, shows star icon toggle
- `SaveTemplateModal` in ReviewStep → saves brand, condition, listing type, shipping, warranty (not price/title)

### History UX
- `HistoryTable` client component: local filter by status, text search (title/type/mlItemId)
- Actions per row: Retry (FAILED only), Duplicate as draft, View on ML
- Status counts shown in filter tabs
- Up to 500 entries loaded server-side, filtered client-side

### CSV Bulk Mode
- CSV column definitions live in `src/lib/csv/template.ts` — single source of truth
- To add a CSV column: add one entry to `CSV_COLUMNS` in `template.ts` — parser picks it up automatically
- Parser: `src/lib/csv/parser.ts` — `parseCsvText(text)` returns `CsvParseResult` with per-row status
- Each row runs `inferProduct` → `buildProductDraft` → `buildMLPayload` → `getMissingFields`
- Export: `exportAllPayloads(rows)` dumps all valid rows as a JSON array
- Skip-invalid option: filters error rows before displaying results

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

## Local Dev Setup

```bash
# 1. Start Postgres
docker-compose up -d

# 2. Copy env and fill in AUTH_SECRET
cp .env.example .env
openssl rand -base64 32   # paste output as AUTH_SECRET

# 3. Run migrations + generate client
npx prisma migrate dev --name init
npx prisma generate

# 4. Start dev server
npm run dev
```

## Current Status
- [x] Project scaffolded (Next.js 16, TypeScript, Tailwind)
- [x] Core types, category config, inference engine, payload builder
- [x] Single-product assisted flow (text → infer → review → JSON export)
- [x] CSV bulk mode (upload or paste → per-row inference → validation → bulk JSON export)
- [x] Strict validation: garbage detection, field-level errors, publish blocked until isReady
- [x] ML integration layer: auth, client, publish, dry-run (server-side only)
- [x] API routes: /api/ml/status, /api/ml/auth, /api/ml/callback, /api/ml/publish
- [x] PublishButton with confirmation modal, dry-run indicator, credential warnings
- [x] Bulk publish: per-row status (idle/publishing/published/dry_run/failed), confirm modal
- [x] PostgreSQL + Prisma 7 (adapter-pg), docker-compose
- [x] NextAuth v5 — email/password, JWT, PrismaAdapter
- [x] Middleware protecting dashboard routes
- [x] Auth-gated API routes (drafts, templates, history)
- [x] Dashboard pages: stats, drafts list, templates, publish history
- [x] Login + register pages
- [x] Toast system (no external deps)
- [x] Autosave hook wired into AssistedPublisher (debounced, "Guardado" indicator)
- [x] Publish history persisted to DB
- [x] .env.example with all required variables (DATABASE_URL, AUTH_SECRET, ML vars)
- [x] SellerPreferences model + /settings page — defaults applied to every new product
- [x] Inline bulk editing: 6 fields (title, price, stock, condition, brand, model) per row
- [x] Skip-invalid-rows option in CSV import
- [x] Draft duplicate: POST /api/drafts/[id]/duplicate, button in drafts page
- [x] History improvements: search, status filter, retry failed, duplicate as draft
- [x] Template improvements: favorite toggle (star), duplicate, sorted favorites-first
- [x] Save as template modal in single-product review step
- [x] Autosave: dirty/saving/saved/error states + save timestamp display
- [x] Preferences applied to new drafts (currency, condition, listing type, shipping, warranty)
- [x] Build passing (25 routes, 0 TypeScript errors)
- [x] Full code audit completed (Session 4 — Stabilization)
- [x] Bug fix: /settings added to middleware PROTECTED list
- [x] Bug fix: ML OAuth callback now persists tokens to DB (MercadoLibreAccount upsert)
- [x] Bug fix: /api/ml/status checks DB when in-memory store is empty (survives restarts)
- [x] Bug fix: /api/ml/publish refreshes expired tokens before publishing, updates DB
- [x] Bug fix: /api/history POST validates status field against PublishStatus enum
- [x] Manual test plan: docs/testing/manual-test-plan.md (11 test groups, 50+ scenarios)
- [x] "Usar plantilla" wired: /?template={id} → loads template → merges with inference (inference wins)
- [x] Image upload: POST /api/uploads, drag-drop UI, thumbnails, remove, set-main, URL input
- [x] Validation accepts /uploads/ local paths + https:// URLs
- [x] Payload builder documents local image limitation (needs CDN for real ML publishing)
- [x] Build passing (26 routes, 0 TypeScript errors)
- [x] Image preparation layer: src/lib/images/ — classifies external/local/public images
- [x] /api/ml/publish uses prepareImages — blocks real publish for local-only images (422 + imageErrors)
- [x] IMAGE_PUBLIC_BASE_URL: converts local /uploads/ to public HTTPS URL for real publishing
- [x] PublishButton: amber warning + modal block when local images + real mode; informational in dry-run
- [x] ReviewStep: local image warning banner always visible when /uploads/ paths present
- [x] Build passing (26 routes, 0 TypeScript errors)

## Next Session Instructions
1. Add real ML OAuth test with sandbox credentials — verify callback → DB persist → publish flow end-to-end
2. Add additional categories: mobile phones, mattresses (follow pattern in `src/config/categories/appliances.ts`)
3. Persist bulk CSV results to `BulkUpload` DB table for history/audit
4. Add Claude/OpenAI integration to replace deterministic inference (`src/lib/inference/index.ts` — swap adapter)
5. Keyboard shortcuts: Tab through bulk edit fields, Enter to save, Shift+Enter to next row
6. Run `npx prisma migrate dev` against a real DB and verify all migrations apply cleanly
7. For real ML publishing with uploaded images: add ML CDN image upload step before publish (POST /pictures, get secure_url, replace local paths)

## WARNINGS — Read Before Enabling Real Publishing
- `MERCADOLIBRE_DRY_RUN` defaults to `true` — no real publish without explicit opt-in
- Category IDs (MLA1577 etc.) are estimates — verify via ML API before production
- ML description must not contain phone numbers, emails, or WhatsApp — validation blocks common patterns
- Rate limit: ~50 req/s — bulk publish adds 100ms delay between items
- Prisma 7: no `url` in schema.prisma — connection URL lives in `prisma.config.ts` and `db.ts` adapter
- Local uploaded images (`/uploads/...`) cannot be published to ML in real mode — ML API requires publicly accessible HTTPS URLs. Set `IMAGE_PUBLIC_BASE_URL=https://your-domain.com` to auto-convert local paths, or use external HTTPS image URLs.

## Implementation Rules
- NEVER hardcode attribute logic in UI components
- ALWAYS add new appliance types in `src/config/categories/appliances.ts`
- Inference adapter is at `src/lib/inference/index.ts` — swap provider there
- All DB queries must filter by `userId` from `requireAuth()` — never cross-user queries
- Run `npm run dev` to test locally on localhost:3000
