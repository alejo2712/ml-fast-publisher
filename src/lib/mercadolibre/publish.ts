/**
 * Publish items to Mercado Libre.
 * SERVER-SIDE only — never import in client components.
 *
 * IMPORTANT: MERCADOLIBRE_DRY_RUN=true (default) prevents any real API calls.
 */

import type { MLPayload } from '@/types';
import type { MLPublishResult, MLBulkPublishResult } from './types';
import { mlPost, mlGet, MLApiError } from './client';

export function isDryRun(): boolean {
  // Default to true — must explicitly set to "false" to publish for real
  return process.env.MERCADOLIBRE_DRY_RUN !== 'false';
}

interface MLItemResponse {
  id: string;
  permalink: string;
  status: string;
  sub_status?: string[];
  [key: string]: unknown;
}

/**
 * After a successful publish, call GET /items/{id} to verify ML hasn't immediately
 * closed/finalized the item (which happens when the category is wrong or item violates rules).
 */
async function checkPublishedItemStatus(
  itemId: string,
  accessToken: string
): Promise<{ status: string; subStatus: string[]; warning?: string }> {
  try {
    const item = await mlGet<MLItemResponse>(`/items/${itemId}`, accessToken);
    const status = item.status ?? 'unknown';
    const subStatus = item.sub_status ?? [];

    let warning: string | undefined;
    if (status === 'closed') {
      warning = `El ítem fue cerrado inmediatamente por ML (sub_status: ${subStatus.join(', ') || 'desconocido'}). Verificá que la categoría y atributos sean correctos.`;
    } else if (status === 'under_review') {
      warning = `El ítem quedó en revisión por ML (sub_status: ${subStatus.join(', ') || 'sin detalle'}).`;
    } else if (subStatus.includes('deleted') || subStatus.includes('out_of_stock_paused')) {
      warning = `El ítem fue publicado pero ML lo marcó como "${subStatus.join(', ')}".`;
    }

    return { status, subStatus, warning };
  } catch {
    // Non-fatal — don't fail the publish result if status check fails
    return { status: 'unknown', subStatus: [] };
  }
}

export async function publishSingleItem(
  payload: MLPayload,
  accessToken: string
): Promise<MLPublishResult> {
  if (isDryRun()) {
    return {
      status: 'dry_run',
      message: 'Modo prueba activo. Ítem no publicado (MERCADOLIBRE_DRY_RUN=true). Configurá MERCADOLIBRE_DRY_RUN=false para publicar en Mercado Libre.',
      payload,
    };
  }

  try {
    const { data: item, rawBody } = await mlPost<MLItemResponse>('/items', accessToken, payload);

    // Post-publish: check ML item status to detect immediate closure
    const statusCheck = await checkPublishedItemStatus(item.id, accessToken);

    return {
      status: 'published',
      itemId: item.id,
      permalink: item.permalink,
      message: statusCheck.warning
        ? `Publicado con advertencia: ${statusCheck.warning}`
        : `Publicado exitosamente. ID: ${item.id}`,
      mlResponse: rawBody,
      mlItemStatus: statusCheck.status,
      mlItemSubStatus: statusCheck.subStatus,
      postPublishWarning: statusCheck.warning,
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
