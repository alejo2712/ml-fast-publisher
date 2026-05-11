/**
 * Upload strategy types — SERVER-SIDE ONLY.
 *
 * Defines the interface that any upload backend must implement.
 * Currently only LocalUploadStrategy exists; cloud strategies (S3, R2,
 * Cloudinary) can be added by implementing UploadStrategy and swapping
 * the factory in strategy.ts.
 */

export interface UploadResult {
  /** Absolute or relative URL for the uploaded file, ready for use in drafts */
  url: string;
  /** Original filename */
  name: string;
  /** File size in bytes */
  size: number;
  /** Storage backend that handled this upload */
  backend: 'local' | 's3' | 'r2' | 'cloudinary';
  /** Whether this URL is publicly accessible over HTTPS (required for real ML publishing) */
  isPublicHttps: boolean;
}

export interface UploadStrategy {
  /**
   * Save the file and return its public URL.
   * Throws on validation failure or storage error.
   */
  upload(file: File, userId: string): Promise<UploadResult>;

  /** Backend identifier for logging and diagnostics */
  readonly backend: UploadResult['backend'];

  /**
   * True if this backend stores files on the local filesystem.
   * Local files do not survive Vercel serverless restarts.
   */
  readonly isEphemeral: boolean;

  /**
   * If true, uploaded files are immediately accessible via public HTTPS URL.
   * False for local strategy — files are served by Next.js /uploads/ but
   * only reachable externally when IMAGE_PUBLIC_BASE_URL is configured.
   */
  readonly producesPublicHttps: boolean;
}
