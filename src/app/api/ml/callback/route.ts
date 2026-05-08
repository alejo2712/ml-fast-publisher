/**
 * GET /api/ml/callback?code=...
 * Receives OAuth code from ML, exchanges it for tokens, stores them in memory.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCredentials, exchangeCodeForTokens, storeTokens } from '@/lib/mercadolibre/auth';

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
    storeTokens(tokens);

    // Redirect back to the app after successful auth
    const origin = request.nextUrl.origin;
    return NextResponse.redirect(`${origin}/?ml_connected=true`);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Token exchange failed' },
      { status: 500 }
    );
  }
}
