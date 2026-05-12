/**
 * Mercado Libre API client wrapper.
 * SERVER-SIDE only — never import in client components.
 */

import type { MLApiErrorBody } from './types';

const ML_API_BASE = 'https://api.mercadolibre.com';

/** Structured ML API error with parsed body */
export class MLApiError extends Error {
  readonly httpStatus: number;
  readonly body: MLApiErrorBody;

  constructor(path: string, httpStatus: number, body: MLApiErrorBody) {
    // Build a human-readable message from the ML error body
    const cause = body.cause?.map((c) => c.description).filter(Boolean).join('; ');
    const detail = body.message ?? body.error ?? 'Error desconocido';
    super(`ML ${path} ${httpStatus}: ${detail}${cause ? ` — ${cause}` : ''}`);
    this.name = 'MLApiError';
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

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
    const body: MLApiErrorBody = await res.json().catch(() => ({}));
    throw new MLApiError(path, res.status, body);
  }
  return res.json() as Promise<T>;
}

/**
 * POST to ML API. Returns { data, rawBody } so callers can store the response.
 * Throws MLApiError on non-2xx responses.
 */
export async function mlPost<T>(
  path: string,
  accessToken: string,
  body: unknown
): Promise<{ data: T; rawBody: unknown }> {
  const res = await mlFetch(path, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const rawBody: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MLApiError(path, res.status, rawBody as MLApiErrorBody);
  }
  return { data: rawBody as T, rawBody };
}
