/**
 * POST /api/ml/publish
 * Validates + publishes items. Records result in publish_history.
 * Secrets never leave the server.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, refreshAccessToken } from '@/lib/mercadolibre/auth';
import { publishBulkItems, isDryRun } from '@/lib/mercadolibre/publish';
import { prepareImages } from '@/lib/images/prepare-images';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import type { MLPayload } from '@/types';

interface PublishRequestItem {
  payload: MLPayload;
  rowIndex?: number;
  draftId?: string;
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

  // ── Server-side payload validation ────────────────────────────────────────
  const validationErrors: { rowIndex?: number; errors: string[] }[] = [];
  for (const item of items) {
    const errors: string[] = [];
    if (!item.payload?.title || item.payload.title.trim().length < 10) errors.push('title: demasiado corto');
    if (!item.payload?.price || item.payload.price <= 0) errors.push('price: debe ser mayor a 0');
    if (!item.payload?.category_id) errors.push('category_id: faltante');
    if (!item.payload?.condition) errors.push('condition: faltante');
    if (errors.length > 0) validationErrors.push({ rowIndex: item.rowIndex, errors });
  }
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', validationErrors }, { status: 422 });
  }

  // ── Image preparation ─────────────────────────────────────────────────────
  // Run per item; collect all image errors before proceeding.
  const imageIssues: { rowIndex?: number; errors: string[]; warnings: string[] }[] = [];

  for (const item of items) {
    const rawPaths = (item.payload.pictures ?? []).map((p) => p.source);
    const imgResult = prepareImages(rawPaths, dryRun);

    if (imgResult.errors.length > 0) {
      imageIssues.push({ rowIndex: item.rowIndex, errors: imgResult.errors, warnings: imgResult.warnings });
    }

    if (!imgResult.blockRealPublish) {
      // Replace pictures with prepared (possibly converted) sources
      item.payload = {
        ...item.payload,
        pictures: imgResult.prepared.map((p) => ({ source: p.source })),
      };
    }
  }

  if (imageIssues.length > 0) {
    return NextResponse.json(
      {
        error: 'Imágenes no publicables para publicación real en Mercado Libre.',
        imageErrors: imageIssues,
        hint: 'Usá URLs HTTPS externas o configurá IMAGE_PUBLIC_BASE_URL con la dirección pública del servidor.',
      },
      { status: 422 }
    );
  }

  // ── Credentials & token refresh ───────────────────────────────────────────
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
      try {
        tokens = await refreshAccessToken(tokens, credentials);
        await prisma.mercadoLibreAccount.update({
          where: { userId_siteId: { userId, siteId: credentials.siteId } },
          data: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: new Date(tokens.expiresAt),
          },
        });
      } catch {
        return NextResponse.json({ error: 'Token refresh failed. Reconnect Mercado Libre.' }, { status: 401 });
      }
    }

    accessToken = tokens.accessToken;
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  const result = await publishBulkItems(items, accessToken);

  if (userId) {
    await Promise.allSettled(
      result.results.map((r, i) => {
        const item = items[i];
        return prisma.publishHistory.create({
          data: {
            userId,
            draftId: item.draftId ?? null,
            mlItemId: r.itemId ?? null,
            permalink: r.permalink ?? null,
            status: r.status === 'published' ? 'PUBLISHED' : r.status === 'dry_run' ? 'DRY_RUN' : 'FAILED',
            dryRun,
            payload: item.payload as object,
            errorMessage: r.status === 'failed' ? r.message : null,
          },
        });
      })
    );
  }

  return NextResponse.json(result);
}
