# Manual Test Plan — ml-fast-publisher

## Environment setup

1. Copy `.env.example` → `.env.local`
2. Fill in `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
3. Set `MERCADOLIBRE_DRY_RUN=true` (default — safe)
4. Run `npm install && npm run dev`
5. Database must be migrated: `npx prisma migrate dev`

---

## 1. Auth — Register & Login

| # | Steps | Expected |
|---|-------|----------|
| 1.1 | Visit `/register`, submit valid email + password (>=8 chars) | Redirects to `/` |
| 1.2 | Submit short password (<8 chars) | Error: "La contraseña debe tener al menos 8 caracteres" |
| 1.3 | Submit duplicate email | Error: "Este email ya está registrado" |
| 1.4 | Visit `/login` with correct credentials | Redirects to home |
| 1.5 | Visit `/login` with wrong password | Error: "Credenciales inválidas" |
| 1.6 | While logged out, visit `/settings` | Redirects to `/login` |
| 1.7 | While logged out, visit `/drafts` | Redirects to `/login` |
| 1.8 | While logged out, visit `/templates` | Redirects to `/login` |
| 1.9 | While logged out, visit `/history` | Redirects to `/login` |
| 1.10 | While logged out, visit `/dashboard` | Redirects to `/login` |

---

## 2. Single-product assisted flow

| # | Steps | Expected |
|---|-------|----------|
| 2.1 | Home → type garbage ("asd asd 100") → submit | Inference runs, missing fields shown |
| 2.2 | Type realistic input ("Heladera Samsung No Frost 320L Blanca 220V") → submit | Fields inferred: brand, title, condition, voltage |
| 2.3 | Leave required field empty in MissingFields form → click Publish | Button stays disabled |
| 2.4 | Fill all required fields → click Publish | Confirm modal appears |
| 2.5 | Confirm in dry-run mode | Toast: "Publicado (Dry-run)" or similar |
| 2.6 | Click "Guardar plantilla" in review step | Modal opens |
| 2.7 | Enter template name → save | Toast: "Plantilla guardada" |
| 2.8 | After submit, check `/drafts` | New draft appears with status "En progreso" |
| 2.9 | After publish, check `/history` | Entry appears in history |

---

## 3. Autosave

| # | Steps | Expected |
|---|-------|----------|
| 3.1 | Submit input in assisted flow | Autosave indicator shows "Guardado · HH:MM" |
| 3.2 | Fill a missing field | Autosave fires, timestamp updates |
| 3.3 | Refresh page | Draft still visible in `/drafts` |
| 3.4 | Make no changes for 10 seconds after save | Indicator stays "Guardado", no extra writes |

---

## 4. Seller preferences

| # | Steps | Expected |
|---|-------|----------|
| 4.1 | Visit `/settings` | Page loads with default values |
| 4.2 | Change currency to USD → save | Toast success |
| 4.3 | Open new draft from home | Draft has USD currency pre-applied |
| 4.4 | Change condition to "used" → save | New drafts default to used |

---

## 5. Drafts management

| # | Steps | Expected |
|---|-------|----------|
| 5.1 | Visit `/drafts` | List shows all user's drafts |
| 5.2 | Click duplicate icon on a draft | New draft with "(copia)" suffix prepended to list |
| 5.3 | Click delete icon → confirm | Draft removed from list, no page reload |
| 5.4 | Click delete icon → cancel | Nothing changes |

---

## 6. Templates management

| # | Steps | Expected |
|---|-------|----------|
| 6.1 | Visit `/templates` (after saving at least one) | Template cards shown |
| 6.2 | Click star on a template | Star turns amber, template moves to top |
| 6.3 | Click star again | Star clears |
| 6.4 | Click "Duplicar" | New template with "(copia)" appended to list |
| 6.5 | Click trash → confirm | Template removed |
| 6.6 | Visit `/templates` with no templates | Empty state with link to publish |

---

## 7. History

| # | Steps | Expected |
|---|-------|----------|
| 7.1 | Visit `/history` | Table shows all publish history |
| 7.2 | Type in search box | Table filters by title, type, or ML ID |
| 7.3 | Click "Fallidos" filter | Only FAILED entries shown, count in tab is accurate |
| 7.4 | Click "Duplicar" on any entry | Toast "Borrador creado desde historial" |
| 7.5 | Check `/drafts` after duplicate | New IN_PROGRESS draft present |
| 7.6 | Click "Reintentar" on a FAILED entry (dry-run) | Toast with new result |
| 7.7 | "Reintentar" button only visible on FAILED entries | Passes — not shown on PUBLISHED/DRY_RUN |

---

## 8. CSV bulk mode

| # | Steps | Expected |
|---|-------|----------|
| 8.1 | Download CSV template | File downloads with correct headers |
| 8.2 | Upload CSV with 3 valid rows | 3 rows shown, all valid |
| 8.3 | Upload CSV with 1 invalid row (missing price) | Row shows error badge |
| 8.4 | Toggle "Omitir filas inválidas" | Invalid rows excluded from publish count |
| 8.5 | Click "Editar" on a row → change price | Row re-validates in real time |
| 8.6 | Publish all valid rows (dry-run) | Per-row status updates, history records created |
| 8.7 | Paste CSV text directly | Parses same as file upload |

---

## 9. ML integration (dry-run safety)

| # | Steps | Expected |
|---|-------|----------|
| 9.1 | `MERCADOLIBRE_DRY_RUN=true` → publish any product | No real ML call, result shows dry_run status |
| 9.2 | `/api/ml/status` with no credentials | Returns `credentialsConfigured: false` |
| 9.3 | `/api/ml/status` after OAuth connect | Returns `connected: true`, `userId` present |
| 9.4 | Restart server after OAuth connect | `/api/ml/status` still returns `connected: true` (DB fallback) |

---

## 10. Security

| # | Steps | Expected |
|---|-------|----------|
| 10.1 | `GET /api/drafts` without session cookie | 401 response |
| 10.2 | `DELETE /api/drafts/{other_user_id}` with own session | 404 (not 403 — no data leakage) |
| 10.3 | `GET /api/ml/status` — check response body | No access_token, no client_secret in response |
| 10.4 | `POST /api/history` with invalid status value | 400 "Invalid status: ..." |

---

## 11. Edge cases

| # | Steps | Expected |
|---|-------|----------|
| 11.1 | Submit description with phone number pattern | Validation blocks: "No puede contener números de teléfono" |
| 11.2 | Title exactly 60 chars | Passes validation |
| 11.3 | Title 61 chars | Validation error: "No puede superar los 60 caracteres" |
| 11.4 | Price of 50 (below 100 floor) | Warning: "El precio parece muy bajo. ¿Es correcto?" |
| 11.5 | Upload invalid image URL | Validation error: "URL inválida" |
| 11.6 | Stock = 0 | Validation error on stock field |

---

---

## 12. Template usage ("Usar plantilla")

| # | Steps | Expected |
|---|-------|----------|
| 12.1 | Save a template from review step (set brand=Samsung, condition=new) | Toast "Plantilla guardada" |
| 12.2 | Visit `/templates`, click "Usar plantilla" | Navigates to `/?template={id}` |
| 12.3 | See banner "Usando plantilla: {name}" in input step | Banner visible with dismiss X |
| 12.4 | Type "Heladera 320L" (no brand) → submit | Brand field pre-filled from template (Samsung) |
| 12.5 | Type "Heladera LG 320L" → submit | Brand = LG (inference wins over template) |
| 12.6 | Dismiss template (click X) → submit product | Template data not applied |
| 12.7 | Check review step header | Shows "Plantilla: {name}" badge |
| 12.8 | After form submit, check `/templates` | useCount incremented by 1 |

---

## 13. Image upload

| # | Steps | Expected |
|---|-------|----------|
| 13.1 | Go to review step → see "Fotos del producto" section | Upload zone with drag-drop visible |
| 13.2 | Drag a JPG/PNG file onto the drop zone | File uploads, thumbnail appears |
| 13.3 | Click upload zone → select 2 files | Both upload, thumbnails grid shows 2 images |
| 13.4 | Hover over thumbnail → click "Principal" on second image | First image changes, reordered to front |
| 13.5 | Hover thumbnail → click remove (X) | Image removed from list |
| 13.6 | Try uploading a file > 5MB | Toast error "El archivo es demasiado grande" |
| 13.7 | Try uploading a non-image file | Toast error "Tipo de archivo no permitido" |
| 13.8 | Click "Agregar por URL" → enter https://... | Image added to list |
| 13.9 | Upload image → check validation tab | "Requerida" badge disappears from images field |
| 13.10 | Publish dry-run with local uploaded image | Succeeds, history entry records local path |
| 13.11 | Local image in JSON preview | `pictures: [{ "source": "/uploads/..." }]` — amber warning note visible |

---

---

## 14. Image preparation — dry-run vs real publish

### Setup A: `MERCADOLIBRE_DRY_RUN=true`, `IMAGE_PUBLIC_BASE_URL=` (empty)

| # | Steps | Expected |
|---|-------|----------|
| 14.1 | Upload local image → publish (dry-run) | Succeeds, amber warning banner visible in images section |
| 14.2 | Publish button shows "Publicar (dry-run)" label | Not blocked — dry-run allows local images |
| 14.3 | Open confirm modal | Blue dry-run notice + amber "Imágenes locales (solo dry-run)" info both visible |
| 14.4 | Add external https://... URL → publish (dry-run) | Succeeds cleanly, no local image warning |

### Setup B: `MERCADOLIBRE_DRY_RUN=false`, `IMAGE_PUBLIC_BASE_URL=` (empty)

| # | Steps | Expected |
|---|-------|----------|
| 14.5 | Upload local image → review step | Amber banner "Imágenes locales detectadas" shown |
| 14.6 | Publish button label changes to "Imágenes locales" (amber) | Button is disabled |
| 14.7 | Click disabled button (via title tooltip) | "Las imágenes locales no son válidas..." message shown |
| 14.8 | Open modal (by removing disabled, or via API) | Red "Imágenes locales — publicación bloqueada" block visible; confirm button disabled |
| 14.9 | `POST /api/ml/publish` with local image path directly | Returns 422 with `imageErrors` array |
| 14.10 | Add external https://... URL only → publish | Succeeds (no local images) |

### Setup C: `MERCADOLIBRE_DRY_RUN=false`, `IMAGE_PUBLIC_BASE_URL=https://myapp.example.com`

| # | Steps | Expected |
|---|-------|----------|
| 14.11 | Upload local image → review step | No amber banner (path will be converted) |
| 14.12 | Publish button shows "Publicar en Mercado Libre" (indigo) | Not blocked |
| 14.13 | `POST /api/ml/publish` — check payload recorded in history | `pictures[0].source` = `https://myapp.example.com/uploads/...` |

### Setup D: `IMAGE_PUBLIC_BASE_URL=http://localhost:3000` (http, not https)

| # | Steps | Expected |
|---|-------|----------|
| 14.14 | Upload local image → `MERCADOLIBRE_DRY_RUN=false` → attempt publish | Returns 422 — http:// base not publishable |
| 14.15 | Amber warning still shown | Still treated as local-only |

---

## 15. Mercado Libre settings page (`/settings/mercadolibre`)

| # | Steps | Expected |
|---|-------|----------|
| 15.1 | Visit `/settings/mercadolibre` while logged in | Page loads, status cards visible |
| 15.2 | `MERCADOLIBRE_CLIENT_ID` not set | "Credenciales configuradas" row shows red X with instructions |
| 15.3 | All credentials set, not yet OAuth'd | "Cuenta ML conectada" row shows red X |
| 15.4 | `MERCADOLIBRE_DRY_RUN=true` | "Modo dry-run activo (seguro)" row shows green check |
| 15.5 | `MERCADOLIBRE_DRY_RUN=false` | Row shows "Modo publicación real" with amber indicator |
| 15.6 | `IMAGE_PUBLIC_BASE_URL` empty | Image hosting row shows not configured, explains dry-run-only limitation |
| 15.7 | `IMAGE_PUBLIC_BASE_URL=https://myapp.example.com` | Row shows green check with hostname |
| 15.8 | `IMAGE_PUBLIC_BASE_URL=http://...` | Row shows red X with "debe empezar con https://" warning |
| 15.9 | Click "Actualizar" button | Status refetched, timestamp changes |
| 15.10 | Click copy button next to Redirect URI | URL copied to clipboard, toast "URL copiada" |
| 15.11 | Click "Conectar cuenta ML" | Redirects to ML auth page (or 503 if no credentials) |
| 15.12 | Complete OAuth flow | Redirected back to `/settings/mercadolibre?connected=true`, toast success |
| 15.13 | OAuth error from ML | Redirected to `/settings/mercadolibre?error=...`, toast error |
| 15.14 | Click "Ejecutar test dry-run" | Spinner, then success result shown + toast |
| 15.15 | After test dry-run | Entry visible in `/history` with status DRY_RUN |
| 15.16 | Warnings section | Only visible when there are actionable warnings |

---

## 16. Real-publish safety gate

| # | Steps | Expected |
|---|-------|----------|
| 16.1 | `MERCADOLIBRE_DRY_RUN=false` → open confirm modal | Confirmation checkbox visible: "Entiendo que esto publicará artículos reales..." |
| 16.2 | Click "Publicar ahora" with checkbox unchecked | Button stays disabled |
| 16.3 | Tick checkbox → click "Publicar ahora" | Publish proceeds |
| 16.4 | `MERCADOLIBRE_DRY_RUN=true` → open confirm modal | No checkbox shown (dry-run is safe) |

---

## 17. OAuth connect / disconnect / reconnect

| # | Steps | Expected |
|---|-------|----------|
| 17.1 | Visit `/settings/mercadolibre` with no credentials | "Credenciales configuradas" shows red X + setup instructions |
| 17.2 | Set credentials, restart server, visit page | "Credenciales configuradas" shows green check |
| 17.3 | Click "Conectar cuenta ML" | Redirects to ML OAuth page |
| 17.4 | Approve OAuth in ML | Redirects to `/settings/mercadolibre?connected=true`, toast success |
| 17.5 | After connect, check connection status row | Green check + ML User ID + token expiry |
| 17.6 | Restart server, visit `/api/ml/status` | `connected: true` (DB fallback working) |
| 17.7 | Click "Desconectar" button | Confirmation modal appears |
| 17.8 | Cancel disconnect modal | Nothing changes |
| 17.9 | Confirm disconnect | Toast success, "Cuenta ML conectada" row shows red X |
| 17.10 | Check `/api/ml/status` after disconnect | `connected: false` |
| 17.11 | Reconnect after disconnect | Full OAuth flow works again |

---

## 18. Preflight checks

| # | Steps | Expected |
|---|-------|----------|
| 18.1 | `/settings/mercadolibre` → click "Verificar preparación" | Runs preflight with sample payload, shows all checks |
| 18.2 | All credentials + OAuth connected + HTTPS images | All checks green |
| 18.3 | Not connected (real mode) | "Cuenta ML conectada" check shows red error |
| 18.4 | Local images + DRY_RUN=false | "Imágenes del producto" shows red error |
| 18.5 | Local images + DRY_RUN=true | "Imágenes del producto" shows amber warning (not blocking) |
| 18.6 | `POST /api/ml/preflight` with empty payload | Returns 400 |
| 18.7 | `POST /api/ml/preflight` with invalid payload | Returns 200 with blocking checks in result |
| 18.8 | `POST /api/ml/preflight` without session | Returns 401 |
| 18.9 | Open publish confirm modal in real mode | Preflight runs automatically, spinner → results |
| 18.10 | Blocking preflight result in confirm modal | Confirm button disabled; errors shown |
| 18.11 | Warning-only preflight in confirm modal | Confirm button enabled after checkbox ticked |
| 18.12 | `POST /api/ml/publish` with blocking preflight | Returns 422 with `preflight` object + records PREFLIGHT_FAILED in history |

---

## 19. Publish history metadata

| # | Steps | Expected |
|---|-------|----------|
| 19.1 | Dry-run publish → check DB `publish_history` | `dry_run=true`, `status=DRY_RUN`, `image_prep_result` not null |
| 19.2 | Real publish with good payload → check DB | `preflight_result` and `image_prep_result` populated |
| 19.3 | Real publish blocked by preflight → check DB | Row with `status=PREFLIGHT_FAILED` and `preflight_result` |

---

## Known limitations (not bugs)

- ML OAuth tokens are also cached in-memory — cleared on server restart, but DB fallback restores them on next request to `/api/ml/status` or publish.
- ML category IDs (`MLA1577`, etc.) are estimates — must be verified via ML API before going live.
- Token refresh is triggered by publish requests — no background refresh job.
- ML description must not contain phone numbers or emails (enforced client and server side).
- Local uploaded images (`/uploads/...`) require `IMAGE_PUBLIC_BASE_URL=https://your-domain.com` to be usable in real ML publishing. In dry-run mode they always work.
- `IMAGE_PUBLIC_BASE_URL` must start with `https://` — http:// is rejected as non-publishable.
- The image preparation layer runs server-side only — `prepare-images.ts` must never be imported in client components.

---

## 20. Bulk Import — Excel/CSV workflow

### 20a. Template download

| # | Steps | Expected |
|---|-------|----------|
| 20a.1 | Click "Descargar plantilla Excel (.xlsx)" | File downloads as `fastpublisher-plantilla.xlsx` |
| 20a.2 | Open downloaded xlsx in Excel/LibreOffice | "Productos" sheet has 1 header row; "Instrucciones" sheet has column reference |
| 20a.3 | Check header row: required columns | `descripcion_corta (REQUERIDO)` and `precio (REQUERIDO)` are visibly marked |
| 20a.4 | Click "Descargar plantilla CSV" | File downloads as `fastpublisher-plantilla.csv` |
| 20a.5 | Open CSV in text editor | Row 1 = headers, rows 2+ start with `# ` (comment prefix) |
| 20a.6 | Open CSV in Excel on Windows | No encoding corruption — accents (á é ñ) display correctly (UTF-8 BOM) |
| 20a.7 | Upload the downloaded CSV template without adding data | App processes 0 rows; no error toast |
| 20a.8 | Upload the downloaded xlsx template without adding data | App processes 0 rows; no error toast |

### 20b. File upload — drag/drop and click

| # | Steps | Expected |
|---|-------|----------|
| 20b.1 | Drag a .xlsx file onto the drop zone | Blue highlight appears on dragenter; file processed after drop |
| 20b.2 | Drag a .csv file onto the drop zone | Same as 20b.1 |
| 20b.3 | Click the drop zone | File picker opens, accepts .xlsx, .xls, .csv |
| 20b.4 | Select a non-supported file (.txt, .json) | Alert: "Subí un archivo .xlsx (Excel) o .csv" |
| 20b.5 | Upload a .xlsx with 5 valid products | Results shown: 5 products with green checkmarks |

### 20c. Parser — valid rows

| # | Steps | Expected |
|---|-------|----------|
| 20c.1 | Upload `tests/fixtures/valid-appliances.csv` | 3 rows, 0 errors |
| 20c.2 | Check row 1 (Samsung heladera) | Brand=Samsung, type=refrigerator, price=250.000, condition=nuevo |
| 20c.3 | Check row 2 (LG lavarropas) | type=washing_machine, capacity=8, localPickUp=true |
| 20c.4 | Check row 3 (Panasonic microondas) | 2 images shown (pipe-separated in CSV) |
| 20c.5 | Upload CSV with `tipo_producto=cafetera` | Row type = coffee_maker, overrides inference |
| 20c.6 | Upload CSV with images separated by `;` | Both images parsed and shown |

### 20d. Parser — invalid and mixed rows

| # | Steps | Expected |
|---|-------|----------|
| 20d.1 | Upload `tests/fixtures/invalid-appliances.csv` | Mix of error + warning rows; errors shown in red |
| 20d.2 | Row with empty `descripcion_corta` | Shows as error: "La columna está vacía" |
| 20d.3 | Row with missing price | Status=warnings (amber); price shown as missing field |
| 20d.4 | Row with garbage brand (e.g., "asd") | Shows as error with brand field error; NOT also in missing fields |
| 20d.5 | Upload `tests/fixtures/mixed-appliances.csv` | Mix of ok/warnings/error rows; summary counts correct |

### 20e. Legacy headers

| # | Steps | Expected |
|---|-------|----------|
| 20e.1 | Upload `tests/fixtures/legacy-headers.csv` (uses `imagen_url`, `capacidad`, `watts`) | 2 rows, 0 errors |
| 20e.2 | Check row 1 image | Parsed from `imagen_url` column |
| 20e.3 | Check row 1 capacity | Parsed from `capacidad` column as `280` |

### 20f. Inline editing

| # | Steps | Expected |
|---|-------|----------|
| 20f.1 | Click "Editar" on a warnings row | Edit panel expands with 6 fields |
| 20f.2 | Change price from empty to 250000 | Row status updates from warnings → ok/warnings |
| 20f.3 | Set condition to "Nuevo" | Draft updated; payload rebuilt |
| 20f.4 | Enter garbage brand "asd" | Row status becomes error; brand error shows in edit panel |
| 20f.5 | Click "Cerrar" on edit panel | Panel collapses |

### 20g. Bulk dry-run publish

| # | Steps | Expected |
|---|-------|----------|
| 20g.1 | Upload valid CSV (3+ valid rows), click "Publicar X — dry-run" | Confirm modal appears |
| 20g.2 | Confirm modal shows dry-run notice | Blue "Dry-run activo" banner visible |
| 20g.3 | Click "Simular" | Rows show spinner → dry_run status (flask icon) |
| 20g.4 | Check `/history` page | Entries with DRY_RUN status appear |
| 20g.5 | Error rows are excluded from publish | Error rows skip, summary shows correct publishable count |
| 20g.6 | Warnings rows included in publish | Published successfully (or with warnings noted) |

### 20h. Export JSON

| # | Steps | Expected |
|---|-------|----------|
| 20h.1 | After upload, click "Exportar JSON" | Downloads `ml-bulk-drafts-{timestamp}.json` |
| 20h.2 | Open exported JSON | Array of ML-formatted payloads; each has `row`, `draft_title`, ML fields |

### 20i. Automated tests

```bash
# Run all parser unit tests (71 tests, ~5 seconds)
npm run test:bulk
```

All 71 tests should pass. Run this after any change to `src/lib/csv/` or `src/lib/validation/`.

