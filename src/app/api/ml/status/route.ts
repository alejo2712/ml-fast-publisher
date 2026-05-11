/**
 * GET /api/ml/status
 * Returns credential and connection state — never exposes secrets.
 * Checks in-memory store first (fast), falls back to DB (survives restarts).
 */
import { NextResponse } from 'next/server';
import { getCredentials, getStoredTokens, storeTokens } from '@/lib/mercadolibre/auth';
import { isDryRun } from '@/lib/mercadolibre/publish';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const credentials = getCredentials();

  // Check in-memory store first
  let tokens = getStoredTokens();

  // If not in memory, try DB (tokens survive server restarts)
  if (!tokens) {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      const dbAccount = await prisma.mercadoLibreAccount.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      if (dbAccount) {
        tokens = {
          accessToken: dbAccount.accessToken,
          refreshToken: dbAccount.refreshToken,
          expiresAt: dbAccount.expiresAt.getTime(),
          userId: dbAccount.mlUserId,
        };
        // Warm the in-memory cache so subsequent requests are fast
        storeTokens(tokens);
      }
    }
  }

  return NextResponse.json({
    credentialsConfigured: credentials !== null,
    connected: tokens !== null,
    dryRun: isDryRun(),
    siteId: credentials?.siteId ?? 'MLA',
    userId: tokens?.userId ?? null,
    tokenExpiresAt: tokens?.expiresAt ?? null,
  });
}
