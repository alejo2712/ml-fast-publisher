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

## Known limitations (not bugs)

- ML OAuth tokens are also cached in-memory — cleared on server restart, but DB fallback restores them on next request to `/api/ml/status` or publish.
- ML category IDs (`MLA1577`, etc.) are estimates — must be verified via ML API before going live.
- Token refresh is triggered by publish requests — no background refresh job.
- ML description must not contain phone numbers or emails (enforced client and server side).
