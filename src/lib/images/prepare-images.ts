/**
 * Image preparation layer — SERVER-SIDE ONLY.
 *
 * Classifies each image reference in a draft and resolves whether it can be
 * sent to Mercado Libre's real publish API.
 *
 * Rules:
 *   external https://  → always publishable
 *   external http://   → not publishable (ML requires HTTPS)
 *   /uploads/...       → local dev file; publishable only if IMAGE_PUBLIC_BASE_URL
 *                        is set and its resulting URL starts with https://
 *
 * Environment variables:
 *   IMAGE_PUBLIC_BASE_URL  Optional. Base HTTPS URL of your public server.
 *                          E.g. https://myapp.example.com
 *                          Local paths become: {IMAGE_PUBLIC_BASE_URL}/uploads/...
 *                          Must start with https:// to count as publishable.
 *
 * Do NOT import in client components.
 */

import type { ImagePreparationResult, PreparedImage } from './types';

function classifyImage(raw: string, publicBaseUrl: string): PreparedImage {
  const v = raw.trim();

  // ── External URL ──────────────────────────────────────────────────────────
  if (v.startsWith('https://')) {
    return { source: v, kind: 'external', original: raw, isPublishable: true };
  }

  if (v.startsWith('http://')) {
    return {
      source: v,
      kind: 'external',
      original: raw,
      isPublishable: false,
      warning: `La imagen usa HTTP (no HTTPS): ${v}. ML requiere HTTPS.`,
    };
  }

  // ── Local uploaded file ───────────────────────────────────────────────────
  if (v.startsWith('/uploads/')) {
    if (publicBaseUrl) {
      const resolved = `${publicBaseUrl}${v}`;
      if (resolved.startsWith('https://')) {
        return { source: resolved, kind: 'public', original: raw, isPublishable: true };
      }
      return {
        source: v,
        kind: 'local',
        original: raw,
        isPublishable: false,
        warning: `IMAGE_PUBLIC_BASE_URL debe empezar con https:// para publicación real. Valor actual: ${publicBaseUrl}`,
      };
    }

    return {
      source: v,
      kind: 'local',
      original: raw,
      isPublishable: false,
      warning: 'Imagen local — válida solo en dry-run. Configurá IMAGE_PUBLIC_BASE_URL para publicación real.',
    };
  }

  // ── Unrecognised reference ────────────────────────────────────────────────
  return {
    source: v,
    kind: 'local',
    original: raw,
    isPublishable: false,
    warning: `Referencia de imagen no reconocida: ${v}`,
  };
}

/**
 * Prepare image references for publishing.
 *
 * @param imagePaths  Raw values from draft.images
 * @param dryRun      Whether the current publish attempt is dry-run
 */
export function prepareImages(imagePaths: string[], dryRun: boolean): ImagePreparationResult {
  const publicBaseUrl = (process.env.IMAGE_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

  const prepared = imagePaths.map((raw) => classifyImage(raw, publicBaseUrl));

  const hasLocalOnly = prepared.some((p) => !p.isPublishable);
  const warnings = prepared.flatMap((p) => (p.warning ? [p.warning] : []));
  const errors: string[] = [];

  if (!dryRun && hasLocalOnly) {
    const localCount = prepared.filter((p) => !p.isPublishable).length;
    errors.push(
      `${localCount} imagen${localCount > 1 ? 'es no son' : ' no es'} accesible${localCount > 1 ? 's' : ''} desde internet. ` +
        'Mercado Libre requiere URLs HTTPS públicas. ' +
        'Usá URLs externas o configurá IMAGE_PUBLIC_BASE_URL con la URL pública de este servidor.'
    );
  }

  return {
    prepared,
    hasLocalOnly,
    blockRealPublish: !dryRun && hasLocalOnly,
    warnings,
    errors,
  };
}

/**
 * Quick client-safe check — does a raw image path look like a local upload?
 * Safe to call from browser code; no env access.
 */
export function isLocalImagePath(src: string): boolean {
  return src.startsWith('/uploads/') || (!src.startsWith('http://') && !src.startsWith('https://'));
}
