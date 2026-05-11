/**
 * GET /api/ml/callback?code=...
 * Receives OAuth code from ML, exchanges it for tokens.
 * Tokens are persisted to DB (MercadoLibreAccount) for durability across restarts
 * and also cached in-memory for fast access within the same process lifetime.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, exchangeCodeForTokens, storeTokens } from '@/lib/mercadolibre/auth';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `ML OAuth error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const credentials = getCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'Credentials not configured' }, { status: 503 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, credentials);

    // Cache in-memory for fast access within this process
    storeTokens(tokens);

    // Persist to DB so tokens survive server restarts
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      await prisma.mercadoLibreAccount.upsert({
        where: { userId_siteId: { userId, siteId: credentials.siteId } },
        update: {
          mlUserId: tokens.userId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(tokens.expiresAt),
        },
        create: {
          userId,
          siteId: credentials.siteId,
          mlUserId: tokens.userId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(tokens.expiresAt),
        },
      });
    }

    const origin = request.nextUrl.origin;
    return NextResponse.redirect(`${origin}/?ml_connected=true`);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Token exchange failed' },
      { status: 500 }
    );
  }
}
