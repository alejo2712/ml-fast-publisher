/**
 * ML Pictures API — upload image files to Mercado Libre CDN.
 * SERVER-SIDE only.
 *
 * ML endpoint: POST /pictures/items/upload
 * Auth: Bearer {access_token}
 * Content-Type: multipart/form-data (field: "file")
 * Response: { id, url, secure_url, ... }
 *
 * The returned secure_url can be used directly in listing payloads.
 */

const ML_API_BASE = 'https://api.mercadolibre.com';

export interface MLPictureUploadResult {
  id: string;
  url: string;
  secureUrl: string;
}

/**
 * Upload a single image buffer to ML's picture CDN.
 * Returns { id, url, secureUrl } — use secureUrl in listing pictures[].
 */
export async function uploadPictureToML(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  accessToken: string
): Promise<MLPictureUploadResult> {
  const formData = new FormData();
  // Convert Buffer to Uint8Array so Blob constructor receives a compatible BlobPart
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  formData.append('file', blob, filename);

  const response = await fetch(`${ML_API_BASE}/pictures/items/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => String(response.status));
    throw new Error(`ML picture upload failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    id: string;
    url?: string;
    secure_url?: string;
  };

  if (!data.id) {
    throw new Error(`ML picture upload returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return {
    id: data.id,
    url: data.url ?? '',
    secureUrl: data.secure_url ?? data.url ?? '',
  };
}
