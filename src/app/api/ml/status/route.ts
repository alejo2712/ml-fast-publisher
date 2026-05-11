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

  // Image hosting status — never expose the full URL (it may contain auth info)
  const rawBase = process.env.IMAGE_PUBLIC_BASE_URL ?? '';
  const imageBaseConfigured = rawBase.length > 0;
  const imageBaseIsHttps = rawBase.startsWith('https://');
  let imageBaseDisplay: string | null = null;
  if (imageBaseConfigured) {
    try {
      imageBaseDisplay = new URL(rawBase).hostname;
    } catch {
      imageBaseDisplay = rawBase.slice(0, 40);
    }
  }

  // Actionable warnings — used by the settings UI to guide the user
  const warnings: string[] = [];
  if (!credentials) {
    warnings.push('Credenciales de ML no configuradas (MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET, MERCADOLIBRE_REDIRECT_URI)');
  }
  if (!isDryRun() && !tokens) {
    warnings.push('No conectado a Mercado Libre — publicación real fallará');
  }
  if (imageBaseConfigured && !imageBaseIsHttps) {
    warnings.push('IMAGE_PUBLIC_BASE_URL debe empezar con https:// para que las imágenes sean accesibles desde ML');
  }

  return NextResponse.json({
    credentialsConfigured: credentials !== null,
    connected: tokens !== null,
    dryRun: isDryRun(),
    siteId: credentials?.siteId ?? 'MLA',
    userId: tokens?.userId ?? null,
    tokenExpiresAt: tokens?.expiresAt ?? null,
    imageHosting: {
      baseUrlConfigured: imageBaseConfigured,
      baseUrlDisplay: imageBaseDisplay,
      isHttps: imageBaseIsHttps,
    },
    warnings,
  });
}
