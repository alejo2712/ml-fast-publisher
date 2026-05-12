/**
 * Publish items to Mercado Libre.
 * SERVER-SIDE only — never import in client components.
 *
 * IMPORTANT: MERCADOLIBRE_DRY_RUN=true (default) prevents any real API calls.
 */

import type { MLPayload } from '@/types';
import type { MLPublishResult, MLBulkPublishResult } from './types';
import { mlPost, MLApiError } from './client';

export function isDryRun(): boolean {
  // Default to true — must explicitly set to "false" to publish for real
  return process.env.MERCADOLIBRE_DRY_RUN !== 'false';
}

interface MLItemResponse {
  id: string;
  permalink: string;
  status: string;
  [key: string]: unknown;
}

export async function publishSingleItem(
  payload: MLPayload,
  accessToken: string
): Promise<MLPublishResult> {
  if (isDryRun()) {
    return {
      status: 'dry_run',
      message: 'Dry run habilitado. No se publicó ningún ítem. Configurá MERCADOLIBRE_DRY_RUN=false para publicar.',
      payload,
    };
  }

  try {
    const { data: item, rawBody } = await mlPost<MLItemResponse>('/items', accessToken, payload);
    return {
      status: 'published',
      itemId: item.id,
      permalink: item.permalink,
      message: `Publicado exitosamente. ID: ${item.id}`,
      mlResponse: rawBody,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al publicar.';
    const mlResponse = err instanceof MLApiError ? err.body : undefined;
    return {
      status: 'failed',
      message,
      mlResponse,
    };
  }
}

/**
 * Publish multiple items — real and dry-run both supported.
 * Each item is published independently; failures do not stop remaining items.
 */
export async function publishBulkItems(
  items: Array<{ payload: MLPayload; rowIndex?: number }>,
  accessToken: string
): Promise<MLBulkPublishResult> {
  const dryRun = isDryRun();
  const results: MLPublishResult[] = [];

  for (const { payload, rowIndex } of items) {
    const result = await publishSingleItem(payload, accessToken);
    results.push({ ...result, rowIndex });
    // Respect ML rate limits (~50 req/s) — 100ms between real publishes
    if (!dryRun) await new Promise((r) => setTimeout(r, 100));
  }

  return {
    results,
    totalPublished: results.filter((r) => r.status === 'published').length,
    totalFailed: results.filter((r) => r.status === 'failed').length,
    totalSkipped: results.filter((r) => r.status === 'skipped' || r.status === 'preflight_failed' || r.status === 'skipped_invalid').length,
    dryRun,
  };
}
