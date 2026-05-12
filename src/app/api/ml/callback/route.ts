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

  const origin = request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      `${origin}/settings/mercadolibre?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/settings/mercadolibre?error=missing_code`
    );
  }

  const credentials = getCredentials();
  if (!credentials) {
    return NextResponse.redirect(
      `${origin}/settings/mercadolibre?error=credentials_not_configured`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, credentials);

    // Cache in-memory for fast access within this process
    storeTokens(tokens);

    // Persist to DB so tokens survive server restarts
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      // On update: only overwrite refreshToken when ML returned one.
      // If the new response has no refresh_token, preserve whatever was stored previously.
      const updateData: {
        mlUserId: string;
        accessToken: string;
        expiresAt: Date;
        refreshToken?: string | null;
      } = {
        mlUserId: tokens.userId,
        accessToken: tokens.accessToken,
        expiresAt: new Date(tokens.expiresAt),
      };
      if (tokens.refreshToken !== null) {
        updateData.refreshToken = tokens.refreshToken;
      }

      await prisma.mercadoLibreAccount.upsert({
        where: { userId_siteId: { userId, siteId: credentials.siteId } },
        update: updateData,
        create: {
          userId,
          siteId: credentials.siteId,
          mlUserId: tokens.userId,
          accessToken: tokens.accessToken,
          // null is fine — schema is now nullable; preflight will warn if refresh is needed
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(tokens.expiresAt),
        },
      });
    }

    return NextResponse.redirect(`${origin}/settings/mercadolibre?connected=true`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed';
    return NextResponse.redirect(
      `${origin}/settings/mercadolibre?error=${encodeURIComponent(msg)}`
    );
  }
}
