/**
 * POST /api/ml/prepare-publish
 *
 * Runs every step of the pre-publish pipeline WITHOUT calling POST /items.
 * Returns the diff between the initial payload and the final ML-ready payload.
 *
 * This allows the UI to show the user exactly what will be sent to ML before committing.
 * The returned finalPayload is what /api/ml/publish should use when alreadyEnriched=true.
 *
 * Steps run (same as /api/ml/publish, minus the final POST /items):
 *   1. Basic payload validation
 *   2. Image preparation (local filenames must already be ML CDN URLs at this point)
 *   3. Category resolution + path validation (enrichPayload)
 *   4. Attribute filtering + defaults (enrichPayload)
 *   → Returns diff: initialPayload, finalPayload, category/image/attribute changes
 *
 * Image upload must happen client-side BEFORE calling this endpoint.
 * The client uploads local files to /api/ml/upload-pictures, replaces filenames
 * with ML CDN URLs, then sends the updated payload here.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, refreshAccessToken } from '@/lib/mercadolibre/auth';
import { enrichPayload } from '@/lib/mercadolibre/payload-enricher';
import { prepareImages } from '@/lib/images/prepare-images';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import type { MLPayload, ApplianceType } from '@/types';
import { logger } from '@/lib/logger';

interface PrepareRequestItem {
  payload: MLPayload;
  rowIndex?: number;
  officialCategoryId?: string;
  applianceType?: ApplianceType;
}

export interface PrepareItemResult {
  rowIndex?: number;
  /** The payload as received — hardcoded category, may still have local filenames */
  initialPayload: MLPayload;
  /** The payload after full enrichment — what will be sent to POST /items */
  finalPayload: MLPayload;
  categoryBefore: string;
  categoryAfter: string;
  categoryPath: string;
  imagesBefore: string[];
  imagesAfter: string[];
  attributesBefore: string[];
  attributesAfter: string[];
  removedAttributes: string[];
  addedAttributes: string[];
  /** Errors that would block this row from publishing */
  blockingErrors: string[];
  warnings: string[];
  /** True when the row is ready to publish (no blocking errors) */
  ready: boolean;
}

export interface PreparePublishResponse {
  results: PrepareItemResult[];
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Invalid body. Expected { items: [...] }' }, { status: 400 });
  }

  const items: PrepareRequestItem[] = body.items;

  // ── Auth + token ──────────────────────────────────────────────────────────
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const credentials = getCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'ML credentials not configured.' }, { status: 503 });
  }

  const dbAccount = await prisma.mercadoLibreAccount.findFirst({ where: { userId } });
  if (!dbAccount) {
    return NextResponse.json(
      { error: 'Not connected to Mercado Libre. Connect at /settings/mercadolibre.' },
      { status: 401 }
    );
  }

  let tokens = {
    accessToken: dbAccount.accessToken,
    refreshToken: dbAccount.refreshToken,
    expiresAt: dbAccount.expiresAt.getTime(),
    userId: dbAccount.mlUserId,
  };

  if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    if (!tokens.refreshToken) {
      return NextResponse.json(
        { error: 'Token vencido sin refresh token. Reconectá la cuenta.' },
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
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Token refresh failed' }, { status: 401 });
    }
  }

  const accessToken = tokens.accessToken;

  // ── Per-item loop ─────────────────────────────────────────────────────────
  const results: PrepareItemResult[] = [];

  for (const item of items) {
    const initialPayload: MLPayload = JSON.parse(JSON.stringify(item.payload));
    const blockingErrors: string[] = [];
    const warnings: string[] = [];

    logger.info('publish', `[prepare row ${item.rowIndex ?? '?'}]`, {
      title: item.payload?.title?.slice(0, 50),
      category_id: item.payload?.category_id,
      images: (item.payload?.pictures ?? []).map((p) => p.source),
      applianceType: item.applianceType,
    });

    // 1. Basic validation
    if (!item.payload?.title || item.payload.title.trim().length < 10)
      blockingErrors.push('Título demasiado corto (mínimo 10 caracteres)');
    if (!item.payload?.price || item.payload.price <= 0)
      blockingErrors.push('Precio inválido (debe ser mayor a 0)');
    if (!item.payload?.category_id)
      blockingErrors.push('category_id faltante');
    if (!item.payload?.condition)
      blockingErrors.push('Condición faltante');

    if (blockingErrors.length > 0) {
      results.push({
        rowIndex: item.rowIndex,
        initialPayload,
        finalPayload: item.payload,
        categoryBefore: item.payload?.category_id ?? '',
        categoryAfter: item.payload?.category_id ?? '',
        categoryPath: '',
        imagesBefore: (item.payload?.pictures ?? []).map((p) => p.source),
        imagesAfter: (item.payload?.pictures ?? []).map((p) => p.source),
        attributesBefore: (item.payload?.attributes ?? []).map((a) => a.id),
        attributesAfter: (item.payload?.attributes ?? []).map((a) => a.id),
        removedAttributes: [],
        addedAttributes: [],
        blockingErrors,
        warnings,
        ready: false,
      });
      continue;
    }

    // 2. Image preparation — local filenames must already be ML CDN URLs
    const rawPaths = (item.payload.pictures ?? []).map((p) => p.source);
    const imgPrep = prepareImages(rawPaths, false); // dryRun=false: enforce real-publish rules

    if (imgPrep.blockRealPublish) {
      blockingErrors.push(imgPrep.errors[0] ?? 'Imágenes no publicables: deben ser URLs HTTPS (subí las imágenes primero)');
    }

    item.payload = {
      ...item.payload,
      pictures: imgPrep.prepared.map((p) => ({ source: p.source })),
    };

    if (blockingErrors.length > 0) {
      results.push({
        rowIndex: item.rowIndex,
        initialPayload,
        finalPayload: item.payload,
        categoryBefore: initialPayload.category_id,
        categoryAfter: item.payload.category_id,
        categoryPath: '',
        imagesBefore: rawPaths,
        imagesAfter: imgPrep.prepared.map((p) => p.source),
        attributesBefore: initialPayload.attributes.map((a) => a.id),
        attributesAfter: item.payload.attributes.map((a) => a.id),
        removedAttributes: [],
        addedAttributes: [],
        blockingErrors,
        warnings,
        ready: false,
      });
      continue;
    }

    // 3. Enrich — resolve category + filter/fill attributes
    const attributesBefore = initialPayload.attributes.map((a) => a.id);

    const enriched = await enrichPayload(
      item.payload,
      item.payload.title,
      item.officialCategoryId,
      accessToken,
      item.applianceType
    );

    warnings.push(...enriched.warnings);

    if (enriched.categoryError) {
      blockingErrors.push(enriched.categoryError);
    }
    if (enriched.hasBlockingMissing) {
      const blocking = enriched.missingRequired.filter((m) => !m.conditionalRequired);
      blockingErrors.push(
        `Atributos ML obligatorios faltantes: ${blocking.map((m) => `${m.id} (${m.name})`).join(', ')}`
      );
    }

    const finalPayload = enriched.payload;
    const attributesAfter = finalPayload.attributes.map((a) => a.id);
    const beforeSet = new Set(attributesBefore);
    const afterSet = new Set(attributesAfter);
    const removedAttributes = attributesBefore.filter((id) => !afterSet.has(id));
    const addedAttributes = attributesAfter.filter((id) => !beforeSet.has(id));

    results.push({
      rowIndex: item.rowIndex,
      initialPayload,
      finalPayload,
      categoryBefore: initialPayload.category_id,
      categoryAfter: finalPayload.category_id,
      categoryPath: enriched.categoryPath,
      imagesBefore: rawPaths,
      imagesAfter: finalPayload.pictures?.map((p) => p.source) ?? [],
      attributesBefore,
      attributesAfter,
      removedAttributes,
      addedAttributes,
      blockingErrors,
      warnings,
      ready: blockingErrors.length === 0,
    });
  }

  return NextResponse.json({ results } satisfies PreparePublishResponse);
}
