/**
 * GET /api/ml/status
 * Returns credential and connection state — never exposes secrets.
 */
import { NextResponse } from 'next/server';
import { getCredentials, getStoredTokens } from '@/lib/mercadolibre/auth';
import { isDryRun } from '@/lib/mercadolibre/publish';

export async function GET() {
  const credentials = getCredentials();
  const tokens = getStoredTokens();

  return NextResponse.json({
    credentialsConfigured: credentials !== null,
    connected: tokens !== null,
    dryRun: isDryRun(),
    siteId: credentials?.siteId ?? 'MLA',
    userId: tokens?.userId ?? null,
    tokenExpiresAt: tokens?.expiresAt ?? null,
  });
}
