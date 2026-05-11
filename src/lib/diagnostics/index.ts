/**
 * Runtime diagnostics — SERVER-SIDE ONLY.
 *
 * Aggregates health checks across DB, auth, ML integration, and image hosting.
 * Used by GET /api/health and /settings/system.
 *
 * Never exposes secrets or raw env values.
 */

import { validateEnv } from '@/lib/env/server';
import { getCredentials, getStoredTokens } from '@/lib/mercadolibre/auth';
import { isDryRun } from '@/lib/mercadolibre/publish';
import { prisma } from '@/lib/db';

export type CheckStatus = 'ok' | 'warning' | 'error';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SubsystemDiagnostic {
  status: CheckStatus;
  checks: DiagnosticCheck[];
}

export interface DiagnosticsResult {
  /** Worst status across all subsystems */
  status: CheckStatus;
  timestamp: string;
  version: string;
  env: SubsystemDiagnostic;
  database: SubsystemDiagnostic;
  auth: SubsystemDiagnostic;
  mercadolibre: SubsystemDiagnostic;
  imageHosting: SubsystemDiagnostic;
}

function worstStatus(...statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

function subsystemStatus(checks: DiagnosticCheck[]): CheckStatus {
  return worstStatus(...checks.map((c) => c.status));
}

// ── Subsystem checks ──────────────────────────────────────────────────────────

function checkEnv(): SubsystemDiagnostic {
  const result = validateEnv();
  const checks: DiagnosticCheck[] = [];

  for (const v of result.vars) {
    if (v.status === 'ok' || v.status === 'default') {
      checks.push({
        id: v.key,
        label: v.key,
        status: v.status === 'default' ? 'warning' : 'ok',
        detail: v.status === 'default'
          ? (v.warning ?? `Using default: ${v.displayValue}`)
          : v.description,
      });
    } else if (v.status === 'missing') {
      checks.push({
        id: v.key,
        label: v.key,
        status: v.required ? 'error' : 'warning',
        detail: v.required ? 'Required — app will not function correctly' : 'Optional — related features unavailable',
      });
    } else if (v.status === 'invalid') {
      checks.push({
        id: v.key,
        label: v.key,
        status: v.required ? 'error' : 'warning',
        detail: v.warning ?? 'Invalid value',
      });
    }
  }

  return { status: subsystemStatus(checks), checks };
}

async function checkDatabase(): Promise<SubsystemDiagnostic> {
  const checks: DiagnosticCheck[] = [];

  if (!process.env.DATABASE_URL) {
    checks.push({ id: 'connection', label: 'Conexión a base de datos', status: 'error', detail: 'DATABASE_URL no configurado' });
    return { status: 'error', checks };
  }

  try {
    // Lightweight query to verify connectivity
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ id: 'connection', label: 'Conexión a base de datos', status: 'ok', detail: 'PostgreSQL accesible' });
  } catch (err) {
    checks.push({
      id: 'connection',
      label: 'Conexión a base de datos',
      status: 'error',
      detail: `No se pudo conectar: ${err instanceof Error ? err.message.split('\n')[0] : 'Error desconocido'}`,
    });
    return { status: 'error', checks };
  }

  // Verify core tables are present
  try {
    await prisma.user.count();
    checks.push({ id: 'schema', label: 'Schema (tablas)', status: 'ok', detail: 'Tablas accesibles — schema sincronizado' });
  } catch {
    checks.push({ id: 'schema', label: 'Schema (tablas)', status: 'error', detail: 'Tablas no encontradas — ejecutá: prisma db push' });
  }

  return { status: subsystemStatus(checks), checks };
}

function checkAuth(): SubsystemDiagnostic {
  const checks: DiagnosticCheck[] = [];

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    checks.push({ id: 'secret', label: 'AUTH_SECRET', status: 'error', detail: 'No configurado — login/sesiones no funcionarán' });
  } else if (secret.length < 32) {
    checks.push({ id: 'secret', label: 'AUTH_SECRET', status: 'warning', detail: 'Secreto muy corto (<32 chars) — generá uno con: openssl rand -base64 32' });
  } else {
    checks.push({ id: 'secret', label: 'AUTH_SECRET', status: 'ok', detail: 'Configurado' });
  }

  return { status: subsystemStatus(checks), checks };
}

function checkMercadoLibre(): SubsystemDiagnostic {
  const checks: DiagnosticCheck[] = [];

  const credentials = getCredentials();
  checks.push({
    id: 'credentials',
    label: 'Credenciales ML',
    status: credentials ? 'ok' : 'warning',
    detail: credentials
      ? `Configuradas — Sitio: ${credentials.siteId}`
      : 'No configuradas — OAuth y publicación real no disponibles',
  });

  const tokens = getStoredTokens();
  checks.push({
    id: 'tokens',
    label: 'Tokens en caché',
    status: tokens ? 'ok' : 'warning',
    detail: tokens
      ? `Token cacheado — ML User: ${tokens.userId} — vence: ${new Date(tokens.expiresAt).toLocaleString('es-AR')}`
      : 'Sin tokens en caché (normal en arranque frío — se cargan desde DB al primer uso)',
  });

  const dryRun = isDryRun();
  checks.push({
    id: 'dry_run',
    label: 'Modo de publicación',
    status: dryRun ? 'ok' : 'warning',
    detail: dryRun
      ? 'Dry-run activo (MERCADOLIBRE_DRY_RUN=true) — seguro'
      : 'PUBLICACIÓN REAL activa (MERCADOLIBRE_DRY_RUN=false) — los ítems se publican en ML',
  });

  return { status: subsystemStatus(checks), checks };
}

function checkImageHosting(): SubsystemDiagnostic {
  const checks: DiagnosticCheck[] = [];

  const rawBase = process.env.IMAGE_PUBLIC_BASE_URL ?? '';
  if (!rawBase) {
    checks.push({
      id: 'base_url',
      label: 'IMAGE_PUBLIC_BASE_URL',
      status: 'warning',
      detail: 'No configurado — imágenes locales solo funcionan en dry-run',
    });
  } else if (!rawBase.startsWith('https://')) {
    checks.push({
      id: 'base_url',
      label: 'IMAGE_PUBLIC_BASE_URL',
      status: 'error',
      detail: `"${rawBase.slice(0, 30)}" debe comenzar con https:// para que ML pueda acceder a las imágenes`,
    });
  } else {
    let hostname = rawBase;
    try { hostname = new URL(rawBase).hostname; } catch { /* ignore */ }
    checks.push({
      id: 'base_url',
      label: 'IMAGE_PUBLIC_BASE_URL',
      status: 'ok',
      detail: `Configurado — imágenes locales se resolverán como ${hostname}/uploads/...`,
    });
  }

  return { status: subsystemStatus(checks), checks };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runDiagnostics(): Promise<DiagnosticsResult> {
  const [database] = await Promise.all([checkDatabase()]);

  const env = checkEnv();
  const auth = checkAuth();
  const mercadolibre = checkMercadoLibre();
  const imageHosting = checkImageHosting();

  const overall = worstStatus(env.status, database.status, auth.status, mercadolibre.status, imageHosting.status);

  return {
    status: overall,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    env,
    database,
    auth,
    mercadolibre,
    imageHosting,
  };
}
