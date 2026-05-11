/**
 * Image preparation types.
 * Server-side only — used by the image preparation layer and the publish route.
 */

export type ImageKind =
  | 'external'  // https:// URL — ready for ML as-is
  | 'local'     // /uploads/... path — local dev only, not publishable to ML
  | 'public';   // local path converted to HTTPS via IMAGE_PUBLIC_BASE_URL — publishable

export interface PreparedImage {
  /** Final URL to send to ML (may differ from original if converted via IMAGE_PUBLIC_BASE_URL) */
  source: string;
  kind: ImageKind;
  /** Raw value as it came from draft.images */
  original: string;
  /** Safe to send to ML real publish API (true for external + public with HTTPS) */
  isPublishable: boolean;
  /** Human-readable warning shown when image is not directly publishable */
  warning?: string;
}

export interface ImagePreparationResult {
  prepared: PreparedImage[];
  /** True when at least one image cannot be sent to ML real publish */
  hasLocalOnly: boolean;
  /** True when real (non-dry-run) publish must be blocked due to unpublishable images */
  blockRealPublish: boolean;
  /** Non-fatal warnings (e.g. local image present but dry-run is fine) */
  warnings: string[];
  /** Fatal errors that block real publish */
  errors: string[];
}
