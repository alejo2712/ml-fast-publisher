/**
 * Runtime environment detection — safe to import on server or client.
 *
 * Detects whether the app is running in local development, a Vercel preview
 * deployment, or Vercel production. Falls back gracefully when Vercel env
 * vars are absent.
 *
 * Sources:
 *   VERCEL_ENV         = "production" | "preview" | "development"  (Vercel only)
 *   NEXT_PUBLIC_VERCEL_ENV  same value, accessible in browser code
 *   NODE_ENV           = "development" | "production" | "test"
 *
 * No secrets. No sensitive values. Safe for both server and client.
 */

export type DeploymentEnvironment = 'local' | 'preview' | 'production';

/**
 * Returns the current deployment environment.
 * Call on the server — for client code use `getClientEnv()` from client.ts.
 */
export function getDeploymentEnvironment(): DeploymentEnvironment {
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';

  // VERCEL_ENV="development" means running `vercel dev` locally — treat as local
  return 'local';
}

/**
 * Human-readable label for the current environment.
 */
export function getEnvironmentLabel(env: DeploymentEnvironment): string {
  if (env === 'production') return 'Producción';
  if (env === 'preview') return 'Preview';
  return 'Local';
}

/**
 * Returns whether the app is running on Vercel (any tier).
 */
export function isVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Returns whether file uploads are ephemeral (Vercel serverless).
 * On Vercel, local filesystem writes do not persist between invocations.
 */
export function hasEphemeralFilesystem(): boolean {
  return isVercel();
}
