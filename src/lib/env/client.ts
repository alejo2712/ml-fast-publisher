/**
 * Client-safe environment helpers — safe to import in browser code.
 *
 * Only exposes what's needed for UI decisions (feature flags, mode indicators).
 * Never exposes secrets or raw env values.
 *
 * All values come from the API (/api/health) — not from process.env directly,
 * since there are no NEXT_PUBLIC_ vars in this project.
 */

export type FeatureFlag = 'ml_configured' | 'image_hosting' | 'real_publish';

/** Inferred from /api/health response — set by server, consumed by UI */
export interface ClientEnvContext {
  dryRun: boolean;
  mlConfigured: boolean;
  imageHostingConfigured: boolean;
  warnings: string[];
}

export const DEFAULT_CLIENT_ENV: ClientEnvContext = {
  dryRun: true,
  mlConfigured: false,
  imageHostingConfigured: false,
  warnings: [],
};
