/**
 * ML Pictures API — upload images to Mercado Libre's CDN before publishing.
 * SERVER-SIDE only.
 *
 * ML requires HTTPS URLs in the `pictures` array of POST /items.
 * This module uploads local files (or re-hosts HTTPS URLs) to ML's CDN
 * so we get a stable secure_url from ML's own storage.
 *
 * Endpoint: POST https://api.mercadolibre.com/pictures?access_token={token}
 *
 * Two upload modes:
 *   - local file  → multipart/form-data with field `file`
 *   - HTTPS URL   → JSON body { source: "https://..." }
 *
 * Both return { secure_url: "https://..." } on success.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '@/lib/logger';

const ML_API_BASE = 'https://api.mercadolibre.com';

export interface PictureUploadResult {
  /** Original path/URL as it appeared in the payload */
  original: string;
  /** ML CDN URL — use this in the publish payload */
  mlUrl: string;
  /** True when upload succeeded */
  success: true;
}

export interface PictureUploadFailure {
  original: string;
  success: false;
  error: string;
}

export type PictureUploadOutcome = PictureUploadResult | PictureUploadFailure;

interface MLPictureResponse {
  id: string;
  secure_url: string;
  url?: string;
}

/**
 * Upload a single image to ML's CDN.
 *
 * @param source  Either an HTTPS URL or a local /uploads/ path
 * @param accessToken  Valid ML OAuth access token
 */
async function uploadOnePicture(
  source: string,
  accessToken: string
): Promise<PictureUploadOutcome> {
  const endpoint = `${ML_API_BASE}/pictures?access_token=${encodeURIComponent(accessToken)}`;

  try {
    if (source.startsWith('https://')) {
      // Re-host an existing HTTPS URL onto ML's CDN
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        return { original: source, success: false, error: body.message ?? `HTTP ${res.status}` };
      }
      const data = await res.json() as MLPictureResponse;
      return { original: source, success: true, mlUrl: data.secure_url };
    }

    if (source.startsWith('/uploads/')) {
      // Read local file and upload as multipart
      const filePath = join(process.cwd(), 'public', source);
      let fileBytes: Buffer;
      try {
        fileBytes = await readFile(filePath);
      } catch {
        return { original: source, success: false, error: `Archivo local no encontrado: ${filePath}` };
      }

      const ext = source.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      };
      const contentType = mimeTypes[ext] ?? 'image/jpeg';

      const formData = new FormData();
      formData.append('file', new Blob([fileBytes.buffer as ArrayBuffer], { type: contentType }), `image.${ext}`);

      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        return { original: source, success: false, error: body.message ?? `HTTP ${res.status}` };
      }
      const data = await res.json() as MLPictureResponse;
      return { original: source, success: true, mlUrl: data.secure_url };
    }

    return { original: source, success: false, error: `Tipo de imagen no soportado: ${source}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return { original: source, success: false, error: msg };
  }
}

/**
 * Upload all non-ML images in a payload's `pictures` array to ML's CDN.
 * Skips images already hosted on mlstatic.com or mercadolibre.com.
 *
 * Returns a map of original → ML CDN URL for successful uploads,
 * plus a list of failures (non-fatal — caller decides whether to block).
 */
export async function uploadPicturesToML(
  sources: string[],
  accessToken: string
): Promise<{
  replacements: Map<string, string>;
  failures: PictureUploadFailure[];
}> {
  const replacements = new Map<string, string>();
  const failures: PictureUploadFailure[] = [];

  const needsUpload = sources.filter(
    (s) => !s.includes('mlstatic.com') && !s.includes('mercadolibre.com')
  );

  if (needsUpload.length === 0) {
    return { replacements, failures };
  }

  logger.info('publish', `Subiendo ${needsUpload.length} imagen(es) al CDN de ML`);

  for (const source of needsUpload) {
    const outcome = await uploadOnePicture(source, accessToken);
    if (outcome.success) {
      replacements.set(source, outcome.mlUrl);
      logger.info('publish', `Imagen subida a ML CDN: ${outcome.mlUrl}`);
    } else {
      failures.push(outcome);
      logger.warn('publish', `No se pudo subir imagen: ${outcome.error}`);
    }
  }

  return { replacements, failures };
}
