# PostgreSQL Setup

## Local Development (macOS / Homebrew)

This project was developed with PostgreSQL 16 installed natively via Homebrew (not Docker).

### Install

```bash
brew install postgresql@16
brew services start postgresql@16
```

### Create role and database

```bash
psql -U $(whoami) -d postgres
```

```sql
CREATE ROLE mlpublisher WITH LOGIN PASSWORD 'mlpublisher';
CREATE DATABASE mlpublisher OWNER mlpublisher;
\q
```

### .env

```
DATABASE_URL="postgresql://mlpublisher:mlpublisher@localhost:5432/mlpublisher"
```

### Apply schema

```bash
npx prisma db push
```

This pushes the schema directly — there is no migrations folder. Repeat after any `prisma/schema.prisma` change.

---

## Local Development (Docker)

A `docker-compose.yml` exists at the project root for Docker-based setups:

```bash
docker-compose up -d
```

Default credentials from `docker-compose.yml`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mlpublisher"
```

---

## Production

Use a managed Postgres provider. Recommended options:

| Provider | Free tier | Notes |
|---|---|---|
| Neon | 0.5 GB | Serverless, good for Vercel |
| Supabase | 500 MB | Full-featured, good DX |
| Railway | $5/mo | Simple setup |

### Schema setup

After provisioning, run `prisma db push` from local with the production DATABASE_URL:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" npx prisma db push
```

> Never run `prisma migrate dev` in production — this project uses `prisma db push` exclusively.

---

## Schema overview

All tables are defined in `prisma/schema.prisma`. Key models:

| Model | Purpose |
|---|---|
| `User` | Email/password auth |
| `ProductDraft` | In-progress and ready products |
| `ProductTemplate` | Reusable field defaults |
| `PublishHistory` | Audit log of all publish attempts |
| `BulkUpload` | CSV import sessions |
| `MercadoLibreAccount` | OAuth tokens (one per user) |
| `SellerPreferences` | Default selling settings per user |

`PublishStatus` enum values: `PENDING`, `PUBLISHED`, `DRY_RUN`, `FAILED`, `SKIPPED`, `VALIDATION_FAILED`, `PREFLIGHT_FAILED`

---

## Prisma config

Prisma 7 uses `prisma.config.ts` at project root for the database adapter. The schema itself has no `url` directive — connection URL is injected via the adapter at runtime.

Do not add `url = env("DATABASE_URL")` to `schema.prisma` — it will break the Prisma 7 adapter setup.

---

## Verification

After `prisma db push`, verify the schema is correct:

```bash
psql -U mlpublisher -d mlpublisher -c "\dt"
```

Expected tables: `User`, `Account`, `Session`, `VerificationToken`, `ProductDraft`, `ProductTemplate`, `PublishHistory`, `BulkUpload`, `MercadoLibreAccount`, `SellerPreferences`

Or visit `/api/health` — the `database` subsystem shows connection + schema status.
