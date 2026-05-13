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
  /** ML attributes that were still missing after applying defaults (conditional-required) */
  missingAttributes?: Array<{ id: string; name: string; conditionalRequired: boolean }>;
  /** ML item status from post-publish GET /items/{id} check */
  mlItemStatus?: string;
  /** ML item sub_status array from post-publish check */
  mlItemSubStatus?: string[];
  /** Warning when item was published but ML immediately closed/finalized it */
  postPublishWarning?: string;
  /** Resolved ML category ID (after enrichment) */
  resolvedCategoryId?: string;
  /** Human-readable category path, e.g. "Electrodomésticos > Cocción > Microondas" */
  resolvedCategoryPath?: string;
  /** True when the fallback hardcoded category was used instead of domain_discovery */
  usedFallbackCategory?: boolean;
}

/** Structured ML API error — parsed from ML's error response body */
export interface MLApiErrorBody {
  message?: string;
  error?: string;
  status?: number;
  cause?: Array<{
    code?: number;
    /** Human-readable reason (ML uses both "description" and "message" depending on version) */
    description?: string;
    message?: string;
    /** e.g. "error" | "warning" */
    type?: string;
    department?: string;
  }>;
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
