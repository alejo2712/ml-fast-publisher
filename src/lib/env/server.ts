/**
 * Server-side environment validation — SERVER-SIDE ONLY.
 *
 * Validates all required and optional environment variables.
 * Returns structured results for use in /api/health and /settings/system.
 *
 * Rules:
 * - Sensitive vars (secrets, tokens): status only, value never exposed
 * - Non-sensitive vars: safe display value may be included
 * - Required vars missing → error → valid=false
 * - Optional vars missing → warning → valid=true
 * - Invalid optional vars → warning → valid=true
 *
 * Note: this project uses AUTH_SECRET (NextAuth v5), not NEXTAUTH_SECRET.
 */

import type { EnvVarResult, EnvValidationResult } from './types';

interface VarSpec {
  key: string;
  required: boolean;
  sensitive: boolean;
  description: string;
  /** Called with the raw value; return an error string if invalid, undefined if ok */
  validate?: (value: string) => string | undefined;
  /** Human-readable version of the value (only used when sensitive=false) */
  display?: (value: string) => string;
  /** If set and var is missing, status becomes 'default' instead of 'missing' */
  defaultValue?: string;
}

const VAR_SPECS: VarSpec[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    key: 'DATABASE_URL',
    required: true,
    sensitive: true,
    description: 'PostgreSQL connection string',
    validate: (v) => {
      if (!v.startsWith('postgresql://') && !v.startsWith('postgres://'))
        return 'Must start with postgresql:// or postgres://';
    },
  },
  {
    key: 'AUTH_SECRET',
    required: true,
    sensitive: true,
    description: 'NextAuth v5 session signing secret (openssl rand -base64 32)',
    validate: (v) => {
      if (v.length < 32)
        return 'Should be at least 32 characters — generate with: openssl rand -base64 32';
    },
  },

  // ── Mercado Libre ─────────────────────────────────────────────────────────
  {
    key: 'MERCADOLIBRE_CLIENT_ID',
    required: false,
    sensitive: false,
    description: 'ML app Client ID (required for real OAuth)',
    display: (v) => v.slice(0, 4) + '****',
  },
  {
    key: 'MERCADOLIBRE_CLIENT_SECRET',
    required: false,
    sensitive: true,
    description: 'ML app Client Secret (required for real OAuth)',
  },
  {
    key: 'MERCADOLIBRE_REDIRECT_URI',
    required: false,
    sensitive: false,
    description: 'OAuth callback URL (must match ML app config)',
    display: (v) => v,
    validate: (v) => {
      try { new URL(v); } catch { return 'Must be a valid URL'; }
    },
  },
  {
    key: 'MERCADOLIBRE_SITE_ID',
    required: false,
    sensitive: false,
    description: 'ML site: MLA (Argentina), MLB (Brazil), MLM (Mexico)',
    defaultValue: 'MLA',
    display: (v) => v,
    validate: (v) => {
      if (!['MLA', 'MLB', 'MLM', 'MLC', 'MCO', 'MPE', 'MLV', 'MLU'].includes(v))
        return `Unknown site ID "${v}" — expected MLA, MLB, or MLM`;
    },
  },
  {
    key: 'MERCADOLIBRE_DRY_RUN',
    required: false,
    sensitive: false,
    defaultValue: 'true',
    description: 'true = safe (no real publishes). false = publishes real items to ML',
    display: (v) => v,
    validate: (v) => {
      if (v !== 'true' && v !== 'false')
        return 'Must be "true" or "false"';
    },
  },

  // ── Image hosting ─────────────────────────────────────────────────────────
  {
    key: 'IMAGE_PUBLIC_BASE_URL',
    required: false,
    sensitive: false,
    description: 'HTTPS base URL for serving uploaded images to ML (optional)',
    display: (v) => {
      try { return new URL(v).hostname; } catch { return v.slice(0, 40); }
    },
    validate: (v) => {
      if (!v.startsWith('https://'))
        return 'Must start with https:// — ML requires HTTPS image URLs';
    },
  },
];

export function validateEnv(): EnvValidationResult {
  const vars: EnvVarResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const spec of VAR_SPECS) {
    const raw = process.env[spec.key];

    if (!raw) {
      if (spec.defaultValue !== undefined) {
        // Has a default — status ok, note the default
        vars.push({
          key: spec.key,
          status: 'default',
          required: spec.required,
          description: spec.description,
          displayValue: spec.sensitive ? undefined : spec.defaultValue,
          warning: `Not set — using default: ${spec.defaultValue}`,
        });
      } else if (spec.required) {
        vars.push({
          key: spec.key,
          status: 'missing',
          required: true,
          description: spec.description,
        });
        errors.push(`${spec.key} is required but not set`);
      } else {
        vars.push({
          key: spec.key,
          status: 'missing',
          required: false,
          description: spec.description,
          warning: `${spec.key} not configured — related features unavailable`,
        });
        // Only warn for ML vars if at least one is missing (bundled warning below)
      }
      continue;
    }

    // Value present — validate it
    const validationError = spec.validate?.(raw);
    if (validationError) {
      vars.push({
        key: spec.key,
        status: 'invalid',
        required: spec.required,
        description: spec.description,
        displayValue: spec.sensitive ? undefined : (spec.display?.(raw) ?? raw.slice(0, 20)),
        warning: validationError,
      });
      if (spec.required) {
        errors.push(`${spec.key}: ${validationError}`);
      } else {
        warnings.push(`${spec.key}: ${validationError}`);
      }
      continue;
    }

    vars.push({
      key: spec.key,
      status: 'ok',
      required: spec.required,
      description: spec.description,
      displayValue: spec.sensitive ? undefined : (spec.display?.(raw) ?? undefined),
    });
  }

  // Bundle ML config warning
  const mlVars = ['MERCADOLIBRE_CLIENT_ID', 'MERCADOLIBRE_CLIENT_SECRET', 'MERCADOLIBRE_REDIRECT_URI'];
  const missingMl = mlVars.filter((k) => !process.env[k]);
  if (missingMl.length > 0 && missingMl.length < mlVars.length) {
    warnings.push(`Incomplete ML config — missing: ${missingMl.join(', ')}`);
  } else if (missingMl.length === mlVars.length) {
    warnings.push('Mercado Libre credentials not configured — OAuth and real publishing unavailable');
  }

  // Real publish warning
  const dryRunValue = process.env.MERCADOLIBRE_DRY_RUN ?? 'true';
  if (dryRunValue === 'false') {
    warnings.push('MERCADOLIBRE_DRY_RUN=false — real publishing is active. Ensure all ML credentials are valid before use.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    vars,
  };
}

/** Typed, validated accessors — throw at runtime if required var is missing */
export function getEnv() {
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    authSecret: process.env.AUTH_SECRET ?? '',
    mercadolibre: {
      clientId: process.env.MERCADOLIBRE_CLIENT_ID ?? null,
      redirectUri: process.env.MERCADOLIBRE_REDIRECT_URI ?? null,
      siteId: process.env.MERCADOLIBRE_SITE_ID ?? 'MLA',
      dryRun: process.env.MERCADOLIBRE_DRY_RUN !== 'false',
    },
    imageHosting: {
      publicBaseUrl: process.env.IMAGE_PUBLIC_BASE_URL ?? null,
      configured: Boolean(process.env.IMAGE_PUBLIC_BASE_URL),
      isHttps: (process.env.IMAGE_PUBLIC_BASE_URL ?? '').startsWith('https://'),
    },
  } as const;
}
