/**
 * Mercado Libre OAuth 2.0 helpers.
 * All functions run SERVER-SIDE only — never import in client components.
 *
 * Docs: https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion
 */

import type { MLCredentials, MLTokens } from './types';

const ML_AUTH_BASE = 'https://auth.mercadolibre.com.ar';
const ML_API_BASE = 'https://api.mercadolibre.com';

export function getCredentials(): MLCredentials | null {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOLIBRE_REDIRECT_URI;
  const siteId = process.env.MERCADOLIBRE_SITE_ID ?? 'MLA';

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, siteId };
}

export function getAuthorizationUrl(credentials: MLCredentials): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
  });
  return `${ML_AUTH_BASE}/authorization?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  credentials: MLCredentials
): Promise<MLTokens> {
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      redirect_uri: credentials.redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ML token exchange failed: ${res.status} — ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    // ML does not always return a refresh_token — treat absence as null
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
    userId: String(data.user_id),
  };
}

export async function refreshAccessToken(
  tokens: MLTokens,
  credentials: MLCredentials
): Promise<MLTokens> {
  if (!tokens.refreshToken) {
    throw new Error(
      'No hay refresh token disponible. Reconectá la cuenta en /settings/mercadolibre.'
    );
  }

  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ML token refresh failed: ${res.status} — ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    userId: tokens.userId,
  };
}

/** Simple in-memory token store for local dev. Replace with DB/KV in production. */
let _tokenStore: MLTokens | null = null;

export function getStoredTokens(): MLTokens | null {
  return _tokenStore;
}

export function storeTokens(tokens: MLTokens): void {
  _tokenStore = tokens;
}

export function clearTokens(): void {
  _tokenStore = null;
}

export async function getValidTokens(credentials: MLCredentials): Promise<MLTokens | null> {
  let tokens = getStoredTokens();
  if (!tokens) return null;

  // Refresh if expiring within 5 minutes
  if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    tokens = await refreshAccessToken(tokens, credentials);
    storeTokens(tokens);
  }

  return tokens;
}
