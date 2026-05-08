/**
 * Mercado Libre API client wrapper.
 * SERVER-SIDE only — never import in client components.
 */

const ML_API_BASE = 'https://api.mercadolibre.com';

export async function mlFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${ML_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });
}

export async function mlGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await mlFetch(path, accessToken);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`ML GET ${path} failed: ${res.status} — ${JSON.stringify(body)}`);
  }
  return res.json() as Promise<T>;
}

export async function mlPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await mlFetch(path, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`ML POST ${path} failed: ${res.status} — ${JSON.stringify(errBody)}`);
  }
  return res.json() as Promise<T>;
}
