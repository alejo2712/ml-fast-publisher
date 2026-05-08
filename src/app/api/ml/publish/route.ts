/**
 * POST /api/ml/publish
 * Publishes one or multiple items to Mercado Libre.
 * Secrets and tokens never leave the server.
 *
 * Body (single):  { items: [{ payload: MLPayload, rowIndex?: number }] }
 * Returns:        MLBulkPublishResult
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, getValidTokens } from '@/lib/mercadolibre/auth';
import { publishBulkItems, isDryRun } from '@/lib/mercadolibre/publish';
import { validateDraft } from '@/lib/validation';
import { buildProductDraft } from '@/lib/payload-builder';
import type { MLPayload } from '@/types';

interface PublishRequestItem {
  payload: MLPayload;
  rowIndex?: number;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Invalid request body. Expected { items: [...] }' }, { status: 400 });
  }

  const items: PublishRequestItem[] = body.items;

  // Server-side: validate every payload before touching ML API
  const validationErrors: { rowIndex?: number; errors: string[] }[] = [];
  for (const item of items) {
    const errors: string[] = [];
    if (!item.payload?.title || item.payload.title.trim().length < 10) {
      errors.push('title: demasiado corto o vacío');
    }
    if (!item.payload?.price || item.payload.price <= 0) {
      errors.push('price: debe ser mayor a 0');
    }
    if (!item.payload?.category_id) {
      errors.push('category_id: faltante');
    }
    if (!item.payload?.condition) {
      errors.push('condition: faltante');
    }
    if (errors.length > 0) {
      validationErrors.push({ rowIndex: item.rowIndex, errors });
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', validationErrors },
      { status: 422 }
    );
  }

  // Get credentials
  const credentials = getCredentials();
  if (!credentials && !isDryRun()) {
    return NextResponse.json(
      { error: 'Mercado Libre credentials not configured.' },
      { status: 503 }
    );
  }

  // Get tokens (only needed for real publish)
  let accessToken = 'dry-run-token';
  if (!isDryRun()) {
    const tokens = await getValidTokens(credentials!);
    if (!tokens) {
      return NextResponse.json(
        { error: 'Not connected to Mercado Libre. Complete OAuth first via /api/ml/auth' },
        { status: 401 }
      );
    }
    accessToken = tokens.accessToken;
  }

  const result = await publishBulkItems(items, accessToken);
  return NextResponse.json(result);
}
