/**
 * GET /api/ml/auth
 * Redirects the user to Mercado Libre OAuth authorization page.
 */
import { NextResponse } from 'next/server';
import { getCredentials, getAuthorizationUrl } from '@/lib/mercadolibre/auth';

export async function GET() {
  const credentials = getCredentials();

  if (!credentials) {
    return NextResponse.json(
      { error: 'Mercado Libre credentials not configured. Set MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET and MERCADOLIBRE_REDIRECT_URI in your .env.local' },
      { status: 503 }
    );
  }

  const url = getAuthorizationUrl(credentials);
  return NextResponse.redirect(url);
}
