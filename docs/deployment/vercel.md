# Deploying to Vercel

## Prerequisites

- Vercel account with a project linked to this repo
- PostgreSQL database accessible from Vercel (e.g. Neon, Supabase, Railway, or self-hosted)
- Mercado Libre app registered at https://developers.mercadolibre.com.ar

---

## 1. Environment Variables

Set all of the following in Vercel → Project → Settings → Environment Variables.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — must be publicly accessible from Vercel |
| `AUTH_SECRET` | Random 32+ char string — generate with `openssl rand -base64 32` |

### ML OAuth (required for real publishing)

| Variable | Description |
|---|---|
| `MERCADOLIBRE_APP_ID` | From your ML app dashboard |
| `MERCADOLIBRE_APP_SECRET` | From your ML app dashboard |
| `MERCADOLIBRE_REDIRECT_URI` | Must be `https://your-domain.vercel.app/api/ml/callback` |
| `MERCADOLIBRE_SITE_ID` | `MLA` for Argentina (default) |

### Safety gate (default: dry-run)

| Variable | Value | Effect |
|---|---|---|
| `MERCADOLIBRE_DRY_RUN` | `true` (default) | All publishes are simulated — no real ML items created |
| `MERCADOLIBRE_DRY_RUN` | `false` | **Real publishing active** — items are created on Mercado Libre |

> Keep `MERCADOLIBRE_DRY_RUN=true` in staging/preview environments.
> Only set `false` in production after confirming OAuth + preflight work correctly.

### Image hosting (required for real publishing with local images)

| Variable | Description |
|---|---|
| `IMAGE_PUBLIC_BASE_URL` | `https://your-domain.vercel.app` — converts `/uploads/...` local paths to public HTTPS URLs |

Without this, real ML publishing fails for any product that uses uploaded (local) images.

---

## 2. Database Setup

Vercel does not provision Postgres. Use a managed provider:

**Recommended: Neon (free tier)**
1. Create a project at https://neon.tech
2. Copy the connection string from the dashboard
3. Set `DATABASE_URL` in Vercel env vars

After setting `DATABASE_URL`, run schema push from your local machine:

```bash
DATABASE_URL="postgresql://..." npx prisma db push
```

> This project uses `prisma db push` — there is no migrations folder. Run `db push` after any schema change.

---

## 3. ML App Registration

1. Go to https://developers.mercadolibre.com.ar → My Apps → Create App
2. Set the redirect URI to: `https://your-domain.vercel.app/api/ml/callback`
3. Enable scopes: `offline_access`, `read`, `write`
4. Copy App ID and Secret → set in Vercel env vars

---

## 4. First Deploy

```bash
# Push to your linked branch (main or production)
git push origin main
```

Vercel auto-deploys. After deploy completes:

1. Visit `https://your-domain.vercel.app/api/health` — verify all subsystems OK
2. Visit `/settings/system` — review any warnings
3. Visit `/settings/mercadolibre` — connect your ML account via OAuth
4. Run a dry-run test from the ML settings page before enabling real publishing

---

## 5. Vercel-Specific Notes

### File uploads — CRITICAL LIMITATION

On Vercel (serverless), the local filesystem is **ephemeral** — files written during one request are not available to subsequent requests running on different instances.

**Impact:** Images uploaded via the UI (`POST /api/uploads`) use local filesystem storage. These files:
- Are accessible during the same request
- May not persist between function invocations
- Will appear broken if Vercel scales or restarts instances

**Mitigation options:**

| Option | Effort | Notes |
|---|---|---|
| Use external HTTPS image URLs | None | Add images from external CDN/hosting directly in the URL field |
| Set `IMAGE_PUBLIC_BASE_URL` to a persistent server | None | Works if you self-host (VPS/bare metal) |
| Migrate upload storage to S3/R2/Cloudinary | Medium | Production-grade; see future migration path below |

**Future cloud storage migration:**
When ready to migrate, implement `CloudStorageUploadStrategy` in `src/lib/uploads/` — the factory in `strategy.ts` already has the extension point:
```typescript
// src/lib/uploads/strategy.ts
if (process.env.CLOUDINARY_URL) return new CloudinaryUploadStrategy();
if (process.env.AWS_S3_BUCKET)  return new S3UploadStrategy();
```
The `UploadStrategy` interface is fully defined in `src/lib/uploads/types.ts`.

### Other Vercel notes

- **Cold starts**: ML tokens are cached in memory. On cold start the first request re-fetches tokens from DB — this is expected behavior.
- **Function timeout**: Default Vercel function timeout is 10s (hobby) or 60s (pro). Bulk publish of many items may hit this limit — run bulk exports locally or increase via `vercel.json`.
- **Build command**: `npm run build` — standard Next.js build, no custom steps needed.
- **Environment detection**: The app reads `VERCEL_ENV` to detect `local` / `preview` / `production`. This is set automatically by Vercel at build time and visible in `/settings/system` and `/settings/mercadolibre`.

---

## 6. Production Safety Checklist

- [ ] `MERCADOLIBRE_DRY_RUN=false` only after OAuth + preflight verified
- [ ] `IMAGE_PUBLIC_BASE_URL` set to a public HTTPS domain
- [ ] `AUTH_SECRET` is at least 32 characters, randomly generated
- [ ] `DATABASE_URL` points to a production database (not local)
- [ ] ML callback URI in app registration matches `MERCADOLIBRE_REDIRECT_URI` exactly
- [ ] `/api/health` returns `status: ok` before going live
- [ ] File upload storage migrated to cloud (S3/R2/Cloudinary) before real publishing

---

## 7. Health Monitoring

`GET /api/health` — public endpoint, no auth required. Returns:

```json
{
  "status": "ok | warning | error",
  "subsystems": { "env": {...}, "database": {...}, "auth": {...}, "mercadolibre": {...}, "imageHosting": {...} },
  "warnings": [],
  "details": { ... }
}
```

Returns HTTP 503 if `database.status === "error"`, HTTP 200 otherwise.
Use this endpoint with uptime monitors (Better Uptime, UptimeRobot, etc.).
