/**
 * Publish readiness preflight — SERVER-SIDE ONLY.
 *
 * Runs a structured sequence of checks against the current ML credentials,
 * token state, image preparation, and payload validity — without publishing
 * anything. Returns a PreflightResult that the UI renders check-by-check.
 *
 * Call this before any real publish to surface blockers early.
 */

import { getCredentials, getStoredTokens, storeTokens } from './auth';
import { isDryRun } from './publish';
import { prepareImages } from '@/lib/images/prepare-images';
import { prisma } from '@/lib/db';
import type { MLPayload } from '@/types';
import type { PreflightCheck, PreflightResult } from './types';

export async function runPreflight(
  userId: string,
  payload: MLPayload
): Promise<PreflightResult> {
  const dryRun = isDryRun();
  const checks: PreflightCheck[] = [];

  // ── 1. Credentials configured ──────────────────────────────────────────────
  const credentials = getCredentials();
  checks.push({
    id: 'credentials',
    label: 'Credenciales de Mercado Libre',
    status: credentials ? 'ok' : 'error',
    detail: credentials
      ? `App configurada (sitio: ${credentials.siteId})`
      : 'Falta MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET o MERCADOLIBRE_REDIRECT_URI',
  });

  // ── 2. OAuth connected ─────────────────────────────────────────────────────
  let tokens = getStoredTokens();
  if (!tokens) {
    const dbAccount = await prisma.mercadoLibreAccount.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (dbAccount) {
      tokens = {
        accessToken: dbAccount.accessToken,
        refreshToken: dbAccount.refreshToken,
        expiresAt: dbAccount.expiresAt.getTime(),
        userId: dbAccount.mlUserId,
      };
      storeTokens(tokens);
    }
  }

  checks.push({
    id: 'oauth_connected',
    label: 'Cuenta ML conectada (OAuth)',
    status: tokens ? 'ok' : dryRun ? 'warning' : 'error',
    detail: tokens
      ? `ML User ID: ${tokens.userId}`
      : dryRun
        ? 'No conectado — en dry-run esto no bloquea, pero será necesario para publicación real'
        : 'No hay tokens. Conectá la cuenta en /settings/mercadolibre',
  });

  // ── 3. Token freshness ─────────────────────────────────────────────────────
  if (tokens) {
    const msToExpiry = tokens.expiresAt - Date.now();
    const hoursToExpiry = Math.floor(msToExpiry / 3_600_000);
    const minutesToExpiry = Math.floor((msToExpiry % 3_600_000) / 60_000);

    let tokenStatus: PreflightCheck['status'];
    let tokenDetail: string;

    if (msToExpiry < 0) {
      tokenStatus = 'warning'; // can still refresh
      tokenDetail = 'Token vencido — se renovará automáticamente al publicar usando el refresh token';
    } else if (msToExpiry < 5 * 60 * 1000) {
      tokenStatus = 'warning';
      tokenDetail = `Token vence en ${minutesToExpiry} min — se renovará automáticamente al publicar`;
    } else {
      tokenStatus = 'ok';
      tokenDetail =
        hoursToExpiry > 0
          ? `Token válido por ${hoursToExpiry}h ${minutesToExpiry}min`
          : `Token válido por ${minutesToExpiry} min`;
    }

    checks.push({ id: 'token_fresh', label: 'Validez del token de acceso', status: tokenStatus, detail: tokenDetail });

    // ── 4. Refresh token available ───────────────────────────────────────────
    checks.push({
      id: 'refresh_token',
      label: 'Refresh token disponible',
      status: tokens.refreshToken ? 'ok' : 'warning',
      detail: tokens.refreshToken
        ? 'Refresh token presente — renovación automática habilitada'
        : 'Sin refresh token. Si el access token vence, deberás reconectar manualmente',
    });
  } else {
    checks.push({
      id: 'token_fresh',
      label: 'Validez del token de acceso',
      status: 'skip',
      detail: 'Sin tokens — omitido',
    });
    checks.push({
      id: 'refresh_token',
      label: 'Refresh token disponible',
      status: 'skip',
      detail: 'Sin tokens — omitido',
    });
  }

  // ── 5. Dry-run mode awareness ──────────────────────────────────────────────
  checks.push({
    id: 'dry_run_mode',
    label: 'Modo de publicación',
    status: dryRun ? 'ok' : 'warning',
    detail: dryRun
      ? 'Dry-run activo (MERCADOLIBRE_DRY_RUN=true) — seguro para pruebas'
      : 'PUBLICACIÓN REAL activa (MERCADOLIBRE_DRY_RUN=false) — los ítems se publicarán en ML',
  });

  // ── 6. Payload required fields ────────────────────────────────────────────
  const payloadErrors: string[] = [];
  if (!payload?.title || payload.title.trim().length < 10)
    payloadErrors.push('title: mínimo 10 caracteres');
  if (payload?.title && payload.title.length > 60)
    payloadErrors.push('title: máximo 60 caracteres');
  if (!payload?.price || payload.price <= 0)
    payloadErrors.push('price: debe ser mayor a 0');
  if (payload?.price && payload.price < 100)
    payloadErrors.push('price: parece muy bajo (< $100) — ¿correcto?');
  if (!payload?.category_id)
    payloadErrors.push('category_id: faltante');
  if (!payload?.condition)
    payloadErrors.push('condition: faltante');
  if (!payload?.available_quantity || payload.available_quantity < 1)
    payloadErrors.push('available_quantity: debe ser ≥ 1');

  const payloadStatus: PreflightCheck['status'] =
    payloadErrors.length === 0 ? 'ok' :
    payloadErrors.some(e => !e.includes('parece muy bajo')) ? 'error' : 'warning';

  checks.push({
    id: 'payload_valid',
    label: 'Estructura del payload ML',
    status: payloadStatus,
    detail: payloadErrors.length === 0
      ? `Payload válido — ${payload.pictures?.length ?? 0} imagen(es), título: "${payload.title?.slice(0, 40)}..."`
      : `Problemas: ${payloadErrors.join('; ')}`,
  });

  // ── 7. Images publishable ─────────────────────────────────────────────────
  const imagePaths = (payload?.pictures ?? []).map((p) => p.source);
  if (imagePaths.length === 0) {
    checks.push({
      id: 'images',
      label: 'Imágenes del producto',
      status: 'error',
      detail: 'Sin imágenes — al menos 1 imagen es requerida por Mercado Libre',
    });
  } else {
    const imgResult = prepareImages(imagePaths, dryRun);
    const hasLocal = imgResult.hasLocalOnly;

    let imgStatus: PreflightCheck['status'];
    let imgDetail: string;

    if (!hasLocal) {
      imgStatus = 'ok';
      imgDetail = `${imagePaths.length} imagen(es) — todas con URLs HTTPS públicas`;
    } else if (dryRun) {
      imgStatus = 'warning';
      imgDetail = `${imgResult.prepared.filter(p => !p.isPublishable).length} imagen(es) local(es) — válidas en dry-run pero bloquearán publicación real`;
    } else {
      imgStatus = 'error';
      imgDetail = `${imgResult.prepared.filter(p => !p.isPublishable).length} imagen(es) local(es) (/uploads/...) no son accesibles por ML. Usá URLs HTTPS o configurá IMAGE_PUBLIC_BASE_URL`;
    }

    checks.push({ id: 'images', label: 'Imágenes del producto', status: imgStatus, detail: imgDetail });
  }

  // ── 8. Image hosting config ───────────────────────────────────────────────
  const rawBase = process.env.IMAGE_PUBLIC_BASE_URL ?? '';
  const hasLocal = (payload?.pictures ?? []).some((p) => p.source.startsWith('/uploads/'));
  if (hasLocal && rawBase) {
    const isHttps = rawBase.startsWith('https://');
    checks.push({
      id: 'image_hosting',
      label: 'IMAGE_PUBLIC_BASE_URL',
      status: isHttps ? 'ok' : 'error',
      detail: isHttps
        ? `Configurado — imágenes locales se convertirán a: ${rawBase}`
        : `El valor "${rawBase}" debe empezar con https:// para que ML pueda acceder a las imágenes`,
    });
  } else if (hasLocal && !rawBase && !dryRun) {
    checks.push({
      id: 'image_hosting',
      label: 'IMAGE_PUBLIC_BASE_URL',
      status: 'error',
      detail: 'No configurado. Las imágenes locales requieren esta variable para publicación real',
    });
  }

  const blockingCount = checks.filter((c) => c.status === 'error').length;
  const warningCount = checks.filter((c) => c.status === 'warning').length;

  return {
    ready: blockingCount === 0,
    dryRun,
    checks,
    blockingCount,
    warningCount,
  };
}
