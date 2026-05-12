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

### Upload Strategy Abstraction
- `src/lib/uploads/types.ts` — `UploadStrategy` interface, `UploadResult` type
- `src/lib/uploads/local-strategy.ts` — `LocalUploadStrategy` (current implementation)
- `src/lib/uploads/strategy.ts` — `getUploadStrategy()` factory; extend here when adding S3/R2/Cloudinary
- **Ephemeral filesystem warning**: on Vercel serverless, local filesystem does not persist across requests
- `hasEphemeralFilesystem()` in `src/lib/env/runtime.ts` detects if storage is ephemeral
- `POST /api/uploads` returns `ephemeralWarning` field when storage is ephemeral
- `GET /api/uploads/status` returns backend info for diagnostics

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
# Option A: Native Postgres (macOS/Homebrew — recommended, currently in use)
brew install postgresql@16 && brew services start postgresql@16
psql -U $(whoami) -d postgres -c "CREATE ROLE mlpublisher WITH LOGIN PASSWORD 'mlpublisher';"
psql -U $(whoami) -d postgres -c "CREATE DATABASE mlpublisher OWNER mlpublisher;"

# Option B: Docker
docker-compose up -d

# Copy env and fill in AUTH_SECRET
cp .env.example .env.local
openssl rand -base64 32   # paste output as AUTH_SECRET

# Push schema (no migrations — prisma db push only)
DATABASE_URL="postgresql://mlpublisher:mlpublisher@localhost:5432/mlpublisher" npx prisma db push
npx prisma generate

# Start dev server
npm run dev
```

> Note: This project uses `prisma db push` — there is no migrations folder.
> Never run `prisma migrate dev`. Run `prisma db push` after any schema change.

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
- [x] Security: .gitignore updated — explicit coverage for .env.production, .env.development, .env.staging, .env.test
- [x] ML OAuth: callback now redirects to /settings/mercadolibre?connected=true (or ?error=...) instead of home
- [x] /api/ml/status: enhanced with imageHosting status and warnings array (no tokens exposed)
- [x] /api/ml/test-dry-run: POST endpoint — runs sample refrigerator payload through full pipeline, always safe
- [x] /settings/mercadolibre: ML connection status, credentials status, image hosting, OAuth button, callback URL, dry-run test
- [x] Nav: Mercado Libre settings link added (ShoppingBag icon)
- [x] PublishButton: real-publish confirmation checkbox (must tick before confirm when DRY_RUN=false)
- [x] Build passing (28 routes, 0 TypeScript errors)

### Session 8 additions
- [x] Schema: VALIDATION_FAILED + PREFLIGHT_FAILED added to PublishStatus enum; preflightResult + imagePrepResult nullable JSON columns on PublishHistory
- [x] Prisma client regenerated; DB synced via `prisma db push`
- [x] src/lib/mercadolibre/preflight.ts: runPreflight(userId, payload) — 8 ordered checks, structured PreflightResult
- [x] POST /api/ml/preflight — auth-gated readiness endpoint, no publish
- [x] DELETE /api/ml/disconnect — removes MercadoLibreAccount from DB + clears in-memory cache
- [x] /api/ml/publish: auto-runs preflight for real publishes; returns 422 with preflight details if blocking; stores preflightResult + imagePrepResult in history
- [x] PublishButton: auto-runs preflight when confirm modal opens in real mode; blocks confirm on error checks; warns on warnings; confirmation checkbox retained
- [x] MLConnectionSettings redesign: disconnect button + confirmation modal, real-mode warning banner, diagnostics card with per-check preflight panel, "Verificar preparación" button
- [x] PublishHistory: stores preflightResult + imagePrepResult JSON per entry
- [x] Build passing (31 routes, 0 TypeScript errors)

### Session 9 additions (deployment readiness)
- [x] src/lib/env/types.ts — EnvVarStatus, EnvVarResult, EnvValidationResult types
- [x] src/lib/env/server.ts — validateEnv(): centralized env validation; distinguishes required/optional/default; never exposes secrets
- [x] src/lib/env/client.ts — ClientEnvContext interface; no process.env access; values come from /api/health
- [x] src/lib/logger.ts — structured server logger with domain helpers (oauth, publish, db, health); silent in test; debug/info only in dev
- [x] src/lib/diagnostics/index.ts — runDiagnostics(): aggregates env/database/auth/mercadolibre/imageHosting; subsystem status cards
- [x] GET /api/health — public endpoint; 503 on DB error, 200 otherwise; used by uptime monitors
- [x] /settings/system — SystemSettings client component; collapsible subsystem cards; real-mode warning banner; auto-expands non-ok cards
- [x] Nav: Sistema link added (Activity icon) pointing to /settings/system
- [x] docs/deployment/vercel.md — Vercel deploy guide (env vars, DB, ML app registration, file uploads, production checklist)
- [x] docs/deployment/postgres.md — PostgreSQL setup guide (Homebrew, Docker, managed production)
- [x] README: /api/health docs, environment validation docs, deployment links, updated architecture

### Session 10 additions (production deployment readiness)
- [x] src/lib/env/runtime.ts — getDeploymentEnvironment() (local/preview/production), hasEphemeralFilesystem(), isVercel()
- [x] src/lib/uploads/types.ts — UploadStrategy interface, UploadResult type
- [x] src/lib/uploads/local-strategy.ts — LocalUploadStrategy implementing UploadStrategy
- [x] src/lib/uploads/strategy.ts — getUploadStrategy() factory with extension points for S3/R2/Cloudinary
- [x] POST /api/uploads: refactored to use upload strategy; returns ephemeralWarning on Vercel; added GET /api/uploads/status for diagnostics
- [x] Schema: PublishHistory gets `environment` (string?) and `durationMs` (int?) columns; prisma db push run
- [x] /api/ml/publish: records environment + per-item durationMs in history; imports runtime.ts
- [x] Diagnostics: checkUploads() subsystem added (backend ephemeral warning + public access check); DiagnosticsResult.environment added
- [x] /api/health: returns environment field; includes uploads subsystem in response
- [x] SystemSettings: shows environment badge (Local/Preview/Producción); Uploads subsystem card; link to production checklist
- [x] /settings/production-readiness: ProductionReadiness component — ScoreBanner + 5 ReadinessGroups (DB, Auth, ML, Images, Environment); Vercel ephemeral warning
- [x] Nav: Producción link added (ClipboardCheck icon); fixed active-match bug (exact: true for all settings sub-routes)
- [x] PublishButton: Safe First Publish flow — 4 explicit confirmations required in real mode; confirm button red; real-mode header warning
- [x] HistoryTable: environment badge, duration display, VALIDATION_FAILED/PREFLIGHT_FAILED labels; environment/durationMs added to HistoryEntry type
- [x] History page: selects environment + durationMs from DB
- [x] MLConnectionSettings: environment badge in header (fetches /api/health alongside /api/ml/status)
- [x] next.config.ts: image remote patterns for mlstatic.com; Vercel notes comment
- [x] docs/deployment/vercel.md: ephemeral filesystem section with migration path + future cloud storage extension guide
- [x] Build passing (33 routes, 0 TypeScript errors)

### ML OAuth page (src/components/MLConnectionSettings/)
- Fetches /api/ml/status on mount and on ?connected=true callback
- Shows per-check status rows: credentials, connection, dry-run mode, image hosting
- Warnings surfaced from API — guides user to fix issues before going live
- Callback URL copy button + instructions for ML app registration
- "Reconectar cuenta ML" / "Conectar cuenta ML" button (links to /api/ml/auth)
- Dry-run test button → POST /api/ml/test-dry-run → shows result inline + records in history

### Session 8 additions
- [x] Schema: VALIDATION_FAILED + PREFLIGHT_FAILED added to PublishStatus enum; preflightResult + imagePrepResult nullable JSON columns on PublishHistory
- [x] Prisma client regenerated (`prisma generate`) — run `DATABASE_URL=... npx prisma db push` to sync DB
- [x] src/lib/mercadolibre/preflight.ts: runPreflight(userId, payload) — 8 ordered checks, structured PreflightResult
- [x] POST /api/ml/preflight — auth-gated readiness endpoint, no publish
- [x] DELETE /api/ml/disconnect — removes MercadoLibreAccount from DB + clears in-memory cache
- [x] /api/ml/publish: auto-runs preflight for real publishes; returns 422 with preflight details if blocking; stores preflightResult + imagePrepResult in history
- [x] PublishButton: auto-runs preflight when confirm modal opens in real mode; blocks confirm on error checks; warns on warnings; confirmation checkbox retained
- [x] MLConnectionSettings redesign: disconnect button + confirmation modal, real-mode warning banner, diagnostics card with per-check preflight panel, "Verificar preparación" button
- [x] PublishHistory: stores preflightResult + imagePrepResult JSON per entry
- [x] README: full OAuth setup, disconnect flow, preflight docs, production rollout checklist
- [x] Build passing (31 routes, 0 TypeScript errors)

### preflight.ts checks (in order)
1. credentials — credentials configured in env
2. oauth_connected — MercadoLibreAccount in DB (error in real mode, warning in dry-run)
3. token_fresh — token expiry check (warning if expired or <5min; auto-refresh on publish)
4. refresh_token — refresh token present
5. dry_run_mode — mode awareness (ok=dry-run, warning=real mode)
6. payload_valid — required fields: title length, price, category_id, condition, available_quantity
7. images — at least 1 image; HTTPS required in real mode; local paths blocked
8. image_hosting — IMAGE_PUBLIC_BASE_URL validation (only shown when local images + no base URL)

### Disconnect flow
- DELETE /api/ml/disconnect — deleteMany MercadoLibreAccount for userId + clearTokens() in-memory
- MLConnectionSettings shows "Desconectar" button (red, only when connected)
- Confirmation modal before delete
- After disconnect: status refetched, readiness result cleared

### Session 11 additions (bulk import + bug fixes)
- [x] Bug fix: validateDraft deduplicates missingFields + fieldErrors by id; a field now appears in at most one list
- [x] Bug fix: MissingFields component — missing section skips ids already rendered in fieldErrors section
- [x] Bug fix: ImageUploader — added onDragEnter + preventDefault for reliable drop in Firefox/Safari
- [x] xlsx package installed — Excel import support
- [x] csv/template.ts: added product_type, capacidad_kg, potencia_watts, envio, retiro_en_persona, envio_gratis, imagenes columns; downloadExcelTemplate() with instructions sheet
- [x] csv/parser.ts: LEGACY_HEADERS aliases (imagen_url→imagenes, capacidad→capacidad_litros, watts→potencia_watts); shipping overrides; capacity_kg fallback; parseXlsxBuffer() using dynamic import
- [x] BulkUpload: accepts .xlsx/.xls + .csv; drag-drop fixed with onDragEnter; Excel download button; UX copy improved for non-technical users; hint column in reference table
- [x] Build passing (31 routes, 0 TypeScript errors)

### Session 12 additions (bulk import QA + bug fixes)
- [x] Bug fix: tipo_producto column was parsed but never applied — now builds PRODUCT_TYPE_MAP and overrides inference.applianceType before buildProductDraft
- [x] Bug fix: parser row status was 'ok' for rows with garbage field values (fieldErrors); now uses validateDraft() to capture both arrays; fieldErrors → status=error
- [x] Bug fix: images column only split on | — now also supports ; (semicolon) and quoted , (comma) as separators
- [x] Bug fix: CSV template hint/example rows caused false parse errors when template was re-uploaded; rows now prefixed with '# ' and parser skips '#'-prefixed lines
- [x] Bug fix: CSV template now includes UTF-8 BOM for correct encoding in Excel on Windows
- [x] Bug fix: Excel template no longer has hint/example rows in Productos sheet — only header row; re-uploading template produces 0 data rows
- [x] Bug fix: isGarbage() fired on numeric attribute values like capacity '320' (matched ^[\d\W]+$); now only runs on attr.type === 'text' attributes
- [x] 71 automated parser tests — scripts/test-bulk-parser.ts (npx tsx); covers conditions, separators, tipo_producto, legacy headers, dedup, XLSX roundtrip, edge cases
- [x] 4 test fixtures in tests/fixtures/ (valid, invalid, mixed, legacy-headers)
- [x] npm script 'test:bulk' added to package.json
- [x] docs/testing/manual-test-plan.md: section 20 (bulk import) — 9 groups, 40+ scenarios
- [x] Build passing (31 routes, 0 TypeScript errors, 71/71 parser tests)

### Session 13 additions (deployment + real publish enablement)
- [x] Deployed to Vercel (production): https://ml-fast-publisher.vercel.app
- [x] Neon PostgreSQL provisioned; schema pushed via `prisma db push` against Neon
- [x] All env vars set in Vercel: AUTH_SECRET, DATABASE_URL, MERCADOLIBRE_* (all 5), IMAGE_PUBLIC_BASE_URL, NEXTAUTH_URL
- [x] /api/health verified: DB ok, auth ok, env ok, ML credentials ok, image hosting ok
- [x] ML OAuth connected (real ML account) — tokens persisted in Neon DB
- [x] XLSX test fixture: tests/fixtures/test-products-appliances.xlsx — 12 rows (6 ok, 3 warnings, 3 errors), 12/12 verified
- [x] scripts/generate-test-xlsx.ts + scripts/verify-test-xlsx.ts
- [x] Schema: PublishHistory gets `mlResponse Json? @map("ml_response")` — raw ML API response stored per publish
- [x] src/lib/mercadolibre/types.ts: MLPublishResult gets `mlResponse?: unknown`; MLApiErrorBody interface added
- [x] src/lib/mercadolibre/client.ts: MLApiError class (extends Error) — structured error with httpStatus + body; mlPost now returns `{ data, rawBody }` so callers capture ML response without re-parsing
- [x] src/lib/mercadolibre/publish.ts: publishSingleItem returns mlResponse on success + failure; publishBulkItems hard-limits real publishes to 1 item
- [x] /api/ml/publish: hard 1-item limit for real publishes (422 if > 1); stores mlResponse in PublishHistory
- [x] PublishButton: richer success screen — item ID (Hash icon), permalink (ExternalLink), "Publicar otro" link; richer error screen with structured message
- [x] README: "Habilitar publicación real" section — prerequisites table, how to enable, image requirements, ML error table, safety limits
- [x] Build passing (33 routes, 0 TypeScript errors)

### Real publish safety architecture
- `isDryRun()` in publish.ts: returns true unless `MERCADOLIBRE_DRY_RUN === 'false'` (exact string)
- 1-item real limit enforced at two layers: publishBulkItems() AND /api/ml/publish route
- Preflight auto-runs in PublishButton modal when real mode — blocks confirm on any error check
- 4 explicit confirmation checkboxes required before confirm button activates in real mode
- mlResponse stored in DB for both success (item id, permalink, status) and failure (ML error body)
- MLApiError parses ML error body → human-readable message with cause array

### Session 14 additions (bulk publish + OAuth fixes)
- [x] OAuth callback: refreshToken made nullable end-to-end (schema String? + MLTokens type + auth.ts + callback upsert + publish route)
- [x] refreshAccessToken: throws clear error when refreshToken is null instead of silently passing undefined
- [x] Callback upsert: on update, only overwrites refreshToken when new ML response includes one (preserves existing value otherwise)
- [x] Removed hardcoded 1-item real publish limit from publishBulkItems() and /api/ml/publish route
- [x] Route restructured to per-item loop: payload validation → image prep → preflight → publish → history (each item independent)
- [x] MLPublishResult.status gains preflight_failed and skipped_invalid
- [x] BulkResults: real-mode confirmation modal with warning banner + required checkbox + row count breakdown
- [x] BulkResults: post-publish summary panel (published/failed/preflight_failed/skipped)
- [x] BulkResults: row icons for preflight_failed (ShieldOff) and skipped_invalid (SkipForward)
- [x] BulkResults: graceful handling of non-2xx API responses and JSON parse failures
- [x] Build passing (33 routes, 0 TypeScript errors)

### Session 14 — Real publish result (production test)
First real bulk publish attempt with MERCADOLIBRE_DRY_RUN=false:
- totalPublished: 0, totalFailed: 8, totalSkipped: 1, dryRun: false
- Root cause: hardcoded category IDs are wrong/non-leaf; attribute mapping is incorrect for ML real API
- See full error analysis: docs/mercadolibre-real-publish-errors.md

## Session 15 additions (ML category/attribute compatibility — A, B, C, D, E)
- [x] src/lib/mercadolibre/category-resolver.ts — resolveCategory() via domain_discovery API; validateCategoryId(); in-process cache; validates leaf + marketplace support
- [x] src/lib/mercadolibre/category-attributes.ts — getCategoryAttributes() per category ID; getAttributeIds(); getRequiredAttributes(); in-process cache
- [x] src/lib/mercadolibre/payload-enricher.ts — enrichPayload() called before real publish; overrides category_id; strips attributes not supported by resolved category; officialCategoryId override support
- [x] /api/ml/publish: enrichment step added between preflight and publishSingleItem (real mode only); PublishRequestItem.officialCategoryId
- [x] preflight.ts: category_resolution check added (check 7, real mode only) — resolves from title, warns if non-leaf or classified
- [x] src/types/index.ts: ProductDraft gains gtin, manufacturer, powerSupplyType, requiresAssembly, includesAssemblyManual, officialCategoryId
- [x] payload-builder: buildAttributes() adds GTIN, MANUFACTURER, POWER_SUPPLY_TYPE, REQUIRES_ASSEMBLY, INCLUDES_ASSEMBLY_MANUAL; default shipping changed from me2 to not_specified
- [x] csv/template.ts: 7 new columns — codigo_gtin, fabricante, tipo_alimentacion, requiere_armado, incluye_manual_armado, categoria_ml
- [x] csv/parser.ts: mapRowToOverrides parses all 7 new columns
- [x] BulkResults: passes officialCategoryId from draft to publish request
- [x] Build passing (33 routes, 0 TypeScript errors, 71/71 parser tests)

## NEXT PRIORITY — Real ML Category/Attribute Compatibility
**Status: A, B, C, D, E implemented (Session 15). F, G remain.**

Real Mercado Libre publishing fails because our hardcoded category IDs and attribute mappings
do not match what ML's real API requires. The core fix is now deployed.

### A. Dynamic category resolution
- Remove hardcoded category IDs (MLA1577, MLA1574, etc.) — they are wrong or non-leaf
- Use ML category prediction API: `GET /sites/MLA/domain_discovery/search?q={title}`
- Validate resolved category: must be leaf + must support marketplace (not classified) listing
- Allow optional `oficial_category_id` column in CSV to override prediction
- Cache resolved categories to avoid redundant API calls within a bulk run

### B. Category attributes fetcher
- For each resolved category: `GET /categories/{id}/attributes`
- Fetch required + conditionally-required attributes
- Build attribute list dynamically from ML response
- Cache per category ID (attributes change rarely)

### C. Attribute mapping refactor
- Replace generic `CAPACITY` with category-specific attribute IDs:
  - Heladeras/Freezers: `CAPACITY` in liters (check ML accepted unit)
  - Lavarropas: `CAPACITY` in kg — verify correct ML attribute ID
  - Microondas: `CAPACITY` in liters
- Add missing ML attributes:
  - `GTIN` (required by some categories, e.g. MLA1577)
  - `MANUFACTURER` / "Fabricante"
  - `POWER_SUPPLY_TYPE` / "Tipo de alimentación"
  - `HEIGHT`, `WIDTH`, `DEPTH` in cm
  - `REQUIRES_ASSEMBLY` (boolean)
  - `INCLUDES_ASSEMBLY_MANUAL` (boolean)
- Never send attributes the category does not support
- Only send attribute value_id when ML requires controlled vocab; use value_name otherwise

### D. Excel/CSV template update
New columns to add to CSV_COLUMNS in src/lib/csv/template.ts:
- `gtin` (codigo_gtin)
- `manufacturer` (fabricante)
- `power_supply_type` (tipo_alimentacion) — e.g. "220V", "Batería", "USB"
- `height_cm` (alto_cm)
- `width_cm` (ancho_cm)
- `depth_cm` (profundidad_cm)
- `requires_assembly` (requiere_armado) — si/no
- `includes_assembly_manual` (incluye_manual_armado) — si/no
- `official_category_id` (categoria_ml) — optional override, skips prediction

### E. Preflight improvements
Before sending POST /items:
- Call ML category attributes endpoint for the resolved category
- Validate all required attributes are present in the payload
- Validate all conditionally-required attributes (based on other field values)
- Validate attribute IDs exist in the category (reject unknown attribute IDs)
- Validate shipping mode is supported for user + category
- Return per-attribute validation errors in preflight result

### F. UI improvements
- Per-row: show resolved ML category name + ID (not just our internal applianceType)
- Per-row: show which required ML attributes are missing (before publish attempt)
- Inline edit panel: add fields for new columns (GTIN, dimensions, etc.)
- Category badge: green = valid leaf, orange = non-leaf, red = not found

### G. Shipping safety
- Replace hardcoded `me2` default with detection of allowed modes per category/user
- API: `GET /users/{user_id}/shipping_modes` (requires OAuth token)
- Safe fallback: `not_specified` if allowed modes cannot be determined
- Surface ML shipping validation errors in preflight

### H. Implementation order (when ready to build)
1. Dynamic category resolution (A) — unblocks everything else
2. Category attributes fetcher (B) + cache layer
3. Attribute mapping refactor (C) — fix existing payload builder
4. Preflight ML attribute validation (E) — surface errors before /items call
5. CSV template + parser update (D)
6. UI improvements (F, G)

## Next Session Instructions
1. **PRIORITY 1**: Re-run real ML bulk publish with the new category resolution to verify items publish successfully. Use HTTPS image URLs. If still failing, check ML error response bodies in PublishHistory for the new error details.
2. **UI improvements (F)**: Per-row show resolved ML category name + ID; show which required attributes are missing before publish; category badge (green=leaf, orange=non-leaf, red=not found).
3. **Shipping safety (G)**: Add `GET /users/{user_id}/shipping_modes` call in enricher to validate me2 is allowed; fall back to not_specified if not.
4. **Persist bulk CSV results** to `BulkUpload` DB table for history/audit.
5. **Additional categories**: mobile phones, mattresses (follow pattern in `src/config/categories/appliances.ts`).
6. **ML CDN image upload**: For uploaded images, call `POST /pictures` to get ML-hosted URL before publish (POST /pictures → secure_url → replace local paths).

## WARNINGS — Read Before Enabling Real Publishing
- `MERCADOLIBRE_DRY_RUN` defaults to `true` — no real publish without explicit opt-in
- Category IDs (MLA1577 etc.) are estimates — verify via ML API before production
- ML description must not contain phone numbers, emails, or WhatsApp — validation blocks common patterns
- Rate limit: ~50 req/s — bulk publish adds 100ms delay between items
- Prisma 7: no `url` in schema.prisma — connection URL lives in `prisma.config.ts` and `db.ts` adapter
- No migrations folder — project uses `prisma db push` for schema sync. Run `DATABASE_URL=... npx prisma db push` after any schema change.
- Session 8 schema changes (VALIDATION_FAILED, PREFLIGHT_FAILED enum values + preflightResult/imagePrepResult columns) require `prisma db push` before those fields will work at runtime.
- Session 13 schema change: `mlResponse Json?` column added to publish_history — already pushed to Neon.
- Local uploaded images (`/uploads/...`) cannot be published to ML in real mode — ML API requires publicly accessible HTTPS URLs. Set `IMAGE_PUBLIC_BASE_URL=https://your-domain.com` to auto-convert local paths, or use external HTTPS image URLs.

## Implementation Rules
- NEVER hardcode attribute logic in UI components
- ALWAYS add new appliance types in `src/config/categories/appliances.ts`
- Inference adapter is at `src/lib/inference/index.ts` — swap provider there
- All DB queries must filter by `userId` from `requireAuth()` — never cross-user queries
- Run `npm run dev` to test locally on localhost:3000
