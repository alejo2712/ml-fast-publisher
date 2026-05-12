import type { MLPayload } from '@/types';

export interface MLCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  siteId: string;
}

export interface MLTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // unix ms
  userId: string;
}

export interface MLPublishResult {
  rowIndex?: number;
  status: 'published' | 'dry_run' | 'failed' | 'skipped' | 'preflight_failed' | 'skipped_invalid';
  itemId?: string;
  permalink?: string;
  message: string;
  payload?: MLPayload;
  /** Raw ML API response body — present for both success and failure in real mode */
  mlResponse?: unknown;
}

/** Structured ML API error — parsed from ML's error response body */
export interface MLApiErrorBody {
  message?: string;
  error?: string;
  status?: number;
  cause?: Array<{ code?: number; description?: string }>;
}

export interface MLBulkPublishResult {
  results: MLPublishResult[];
  totalPublished: number;
  totalFailed: number;
  totalSkipped: number;
  dryRun: boolean;
}

export interface MLErrorResponse {
  message: string;
  error: string;
  status: number;
  cause: unknown[];
}

// ─── Preflight ────────────────────────────────────────────────────────────────

export type PreflightCheckStatus = 'ok' | 'warning' | 'error' | 'skip';

export interface PreflightCheck {
  id: string;
  label: string;
  status: PreflightCheckStatus;
  detail: string;
}

export interface PreflightResult {
  ready: boolean;       // true when zero error checks
  dryRun: boolean;
  checks: PreflightCheck[];
  blockingCount: number;  // number of 'error' checks
  warningCount: number;   // number of 'warning' checks
}
