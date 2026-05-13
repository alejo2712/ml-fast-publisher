/**
 * POST /api/ml/publish
 * Validates + publishes items. Records result in publish_history.
 * Secrets never leave the server.
 *
 * Per-item flow (real mode):
 *   1. Payload validation  → skipped_invalid if fails
 *   2. Image preparation   → skipped_invalid if blocks real publish
 *   3. Preflight check     → preflight_failed if any error check fails
 *   4. Publish to ML       → published | failed
 *
 * Failures do NOT abort the remaining items — each item is independent.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, refreshAccessToken } from '@/lib/mercadolibre/auth';
import { publishSingleItem, isDryRun } from '@/lib/mercadolibre/publish';
import { runPreflight } from '@/lib/mercadolibre/preflight';
import { enrichPayload, type MissingAttr } from '@/lib/mercadolibre/payload-enricher';
import { logger } from '@/lib/logger';
import { prepareImages } from '@/lib/images/prepare-images';
import { getDeploymentEnvironment } from '@/lib/env/runtime';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import type { MLPayload, ApplianceType } from '@/types';
import type { MLPublishResult, MLBulkPublishResult, PreflightResult } from '@/lib/mercadolibre/types';

interface PublishRequestItem {
  payload: MLPayload;
  rowIndex?: number;
  draftId?: string;
  /** Optional ML category ID override — skips category prediction when present */
  officialCategoryId?: string;
  /** Product type — used to validate resolved category path and prevent wrong-domain results */
  applianceType?: ApplianceType;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Invalid body. Expected { items: [...] }' }, { status: 400 });
  }

  const dryRun = isDryRun();
  const items: PublishRequestItem[] = body.items;
  const environment = getDeploymentEnvironment();

  // ── Credentials & token refresh (once, before the per-item loop) ──────────
  const credentials = getCredentials();
  if (!credentials && !dryRun) {
    return NextResponse.json({ error: 'ML credentials not configured.' }, { status: 503 });
  }

  let accessToken = 'dry-run-token';
  if (!dryRun) {
    if (!userId) {
      return NextResponse.json({ error: 'Not connected to Mercado Libre.' }, { status: 401 });
    }

    const dbAccount = await prisma.mercadoLibreAccount.findFirst({ where: { userId } });
    if (!dbAccount) {
      return NextResponse.json({ error: 'Not connected to Mercado Libre.' }, { status: 401 });
    }

    let tokens = {
      accessToken: dbAccount.accessToken,
      refreshToken: dbAccount.refreshToken,
      expiresAt: dbAccount.expiresAt.getTime(),
      userId: dbAccount.mlUserId,
    };

    if (credentials && tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
      if (!tokens.refreshToken) {
        return NextResponse.json(
          { error: 'El token de acceso está vencido y no hay refresh token. Reconectá la cuenta en /settings/mercadolibre.' },
          { status: 401 }
        );
      }
      try {
        tokens = await refreshAccessToken(tokens, credentials);
        const refreshData: { accessToken: string; expiresAt: Date; refreshToken?: string } = {
          accessToken: tokens.accessToken,
          expiresAt: new Date(tokens.expiresAt),
        };
        if (tokens.refreshToken) refreshData.refreshToken = tokens.refreshToken;
        await prisma.mercadoLibreAccount.update({
          where: { userId_siteId: { userId, siteId: credentials.siteId } },
          data: refreshData,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Token refresh failed.';
        return NextResponse.json({ error: msg }, { status: 401 });
      }
    }

    accessToken = tokens.accessToken;
  }

  // ── Per-item loop ─────────────────────────────────────────────────────────
  const results: MLPublishResult[] = [];
  const publishStart = Date.now();

  for (const item of items) {
    const { rowIndex, draftId } = item;
    let preflightResult: PreflightResult | null = null;

    // Safe per-row debug log — no tokens, no secrets
    const incomingAttrs = item.payload?.attributes ?? [];
    logger.info('publish', `[row ${rowIndex ?? '?'}] Incoming row`, {
      title:          item.payload?.title?.slice(0, 60),
      applianceType:  item.applianceType ?? '(not sent)',
      category_id:    item.payload?.category_id,
      price:          item.payload?.price,
      condition:      item.payload?.condition,
      imageCount:     (item.payload?.pictures ?? []).length,
      images:         (item.payload?.pictures ?? []).map((p) => p.source),
      attrIds:        incomingAttrs.map((a) => a.id).join(', ') || '(none)',
      gtin:           incomingAttrs.find((a) => a.id === 'GTIN')?.value_name ?? '(missing)',
      height:         incomingAttrs.find((a) => a.id === 'HEIGHT')?.value_name ?? '(missing)',
      width:          incomingAttrs.find((a) => a.id === 'WIDTH')?.value_name ?? '(missing)',
      depth:          incomingAttrs.find((a) => a.id === 'DEPTH')?.value_name ?? '(missing)',
      officialCategoryId: item.officialCategoryId ?? '(none)',
    });

    // 1. Payload validation
    const payloadErrors: string[] = [];
    if (!item.payload?.title || item.payload.title.trim().length < 10)
      payloadErrors.push('title: demasiado corto (mínimo 10 caracteres)');
    if (!item.payload?.price || item.payload.price <= 0)
      payloadErrors.push('price: debe ser mayor a 0');
    if (!item.payload?.category_id)
      payloadErrors.push('category_id: faltante');
    if (!item.payload?.condition)
      payloadErrors.push('condition: faltante');

    if (payloadErrors.length > 0) {
      const result: MLPublishResult = {
        rowIndex,
        status: 'skipped_invalid',
        message: `Payload inválido: ${payloadErrors.join('; ')}`,
      };
      results.push(result);
      if (userId) {
        prisma.publishHistory.create({
          data: {
            userId, draftId: draftId ?? null,
            status: 'VALIDATION_FAILED', dryRun,
            payload: item.payload as object,
            errorMessage: result.message,
            environment,
          },
        }).catch(() => {});
      }
      continue;
    }

    // 2. Image preparation
    const rawPaths = (item.payload.pictures ?? []).map((p) => p.source);
    const imgPrep = prepareImages(rawPaths, dryRun);

    if (imgPrep.blockRealPublish) {
      const errMsg = imgPrep.errors[0] ?? 'Imágenes no publicables en modo real';
      const result: MLPublishResult = {
        rowIndex,
        status: 'skipped_invalid',
        message: errMsg,
      };
      results.push(result);
      if (userId) {
        prisma.publishHistory.create({
          data: {
            userId, draftId: draftId ?? null,
            status: 'VALIDATION_FAILED', dryRun,
            payload: item.payload as object,
            errorMessage: errMsg,
            imagePrepResult: imgPrep as object,
            environment,
          },
        }).catch(() => {});
      }
      continue;
    }

    // Replace pictures with prepared (possibly rewritten) sources
    item.payload = {
      ...item.payload,
      pictures: imgPrep.prepared.map((p) => ({ source: p.source })),
    };

    // 3. Preflight (real mode only) — skip item if any blocking check fails
    if (!dryRun && userId) {
      preflightResult = await runPreflight(userId, item.payload);
      if (!preflightResult.ready) {
        const errMsg = preflightResult.checks
          .filter((c) => c.status === 'error')
          .map((c) => c.detail)
          .join('; ');
        const result: MLPublishResult = {
          rowIndex,
          status: 'preflight_failed',
          message: `Preflight fallido: ${errMsg}`,
        };
        results.push(result);
        if (userId) {
          prisma.publishHistory.create({
            data: {
              userId, draftId: draftId ?? null,
              status: 'PREFLIGHT_FAILED', dryRun: false,
              payload: item.payload as object,
              errorMessage: errMsg,
              preflightResult: preflightResult as object,
              imagePrepResult: imgPrep as object,
              environment,
            },
          }).catch(() => {});
        }
        continue;
      }
    }

    // 4. Enrich payload — resolve dynamic ML category + filter/fill attributes (real mode only)
    let missingAttrs: MissingAttr[] = [];
    let resolvedCategoryId: string | undefined;
    let resolvedCategoryPath: string | undefined;
    let usedFallbackCategory = false;
    if (!dryRun) {
      const enriched = await enrichPayload(
        item.payload,
        item.payload.title,
        item.officialCategoryId,
        accessToken,
        item.applianceType
      );
      item.payload = enriched.payload;
      missingAttrs = enriched.missingRequired;
      resolvedCategoryId = enriched.resolution?.categoryId;
      resolvedCategoryPath = enriched.categoryPath;
      usedFallbackCategory = enriched.usedFallback;

      // Block publish if the resolved category is not a leaf (ML finalizes listings immediately)
      if (enriched.categoryError) {
        const msg = enriched.categoryError;
        logger.warn('publish', `Blocking publish: category error`, { msg: msg.slice(0, 120) });
        const result: MLPublishResult = {
          rowIndex,
          status: 'preflight_failed',
          message: msg,
          resolvedCategoryId,
          resolvedCategoryPath,
          usedFallbackCategory,
        };
        results.push(result);
        if (userId) {
          prisma.publishHistory.create({
            data: {
              userId, draftId: draftId ?? null,
              status: 'PREFLIGHT_FAILED', dryRun: false,
              payload: item.payload as object,
              errorMessage: msg,
              mlCategoryId: resolvedCategoryId,
              mlCategoryPath: resolvedCategoryPath,
              environment,
            },
          }).catch(() => {});
        }
        continue;
      }

      // Block publish if non-conditional required attributes are still missing after defaults
      if (enriched.hasBlockingMissing) {
        const blocking = enriched.missingRequired.filter((m) => !m.conditionalRequired);
        const msg = `Atributos ML obligatorios faltantes: ${blocking.map((m) => `${m.id} (${m.name})`).join(', ')}`;
        logger.warn('publish', msg);
        const result: MLPublishResult = {
          rowIndex,
          status: 'preflight_failed',
          message: msg,
          missingAttributes: enriched.missingRequired,
          resolvedCategoryId,
          resolvedCategoryPath,
          usedFallbackCategory,
        };
        results.push(result);
        if (userId) {
          prisma.publishHistory.create({
            data: {
              userId, draftId: draftId ?? null,
              status: 'PREFLIGHT_FAILED', dryRun: false,
              payload: item.payload as object,
              errorMessage: msg,
              preflightResult: preflightResult ? (preflightResult as object) : undefined,
              imagePrepResult: imgPrep as object,
              mlCategoryId: resolvedCategoryId,
              mlCategoryPath: resolvedCategoryPath,
              environment,
            },
          }).catch(() => {});
        }
        continue;
      }
    }

    // 5. Publish
    const itemStart = Date.now();
    const result = await publishSingleItem(item.payload, accessToken);
    const durationMs = Date.now() - itemStart;

    results.push({
      ...result,
      rowIndex,
      // Include any conditional-required attrs that are still missing (informational — didn't block)
      ...(missingAttrs.length > 0 ? { missingAttributes: missingAttrs } : {}),
      resolvedCategoryId,
      resolvedCategoryPath,
      usedFallbackCategory,
    });

    // Respect ML rate limits between real publishes
    if (!dryRun) await new Promise((r) => setTimeout(r, 100));

    // Record in history
    if (userId) {
      const historyStatus =
        result.status === 'published' ? 'PUBLISHED' :
        result.status === 'dry_run' ? 'DRY_RUN' :
        'FAILED';

      const postPublishCheckResult = (result.mlItemStatus || result.mlItemSubStatus?.length)
        ? { status: result.mlItemStatus, subStatus: result.mlItemSubStatus, warning: result.postPublishWarning }
        : undefined;

      prisma.publishHistory.create({
        data: {
          userId,
          draftId: draftId ?? null,
          mlItemId: result.itemId ?? null,
          permalink: result.permalink ?? null,
          status: historyStatus,
          dryRun,
          payload: item.payload as object,
          errorMessage: result.status === 'failed' ? result.message : null,
          preflightResult: preflightResult ? (preflightResult as object) : undefined,
          imagePrepResult: imgPrep as object,
          mlResponse: result.mlResponse ? (result.mlResponse as object) : undefined,
          mlCategoryId: resolvedCategoryId,
          mlCategoryPath: resolvedCategoryPath,
          mlItemStatus: result.mlItemStatus,
          mlItemSubStatus: result.mlItemSubStatus ?? [],
          postPublishCheckResult: postPublishCheckResult as object | undefined,
          environment,
          durationMs,
        },
      }).catch(() => {});
    }
  }

  const totalPublished = results.filter((r) => r.status === 'published').length;
  const totalDryRun = results.filter((r) => r.status === 'dry_run').length;
  const totalFailed = results.filter((r) => r.status === 'failed').length;
  const totalSkipped = results.filter((r) =>
    r.status === 'skipped' || r.status === 'preflight_failed' || r.status === 'skipped_invalid'
  ).length;

  const bulkResult: MLBulkPublishResult = {
    results,
    totalPublished: totalPublished + totalDryRun,
    totalFailed,
    totalSkipped,
    dryRun,
  };

  return NextResponse.json(bulkResult);
}
