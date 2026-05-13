/**
 * POST /api/ml/upload-pictures
 * Uploads image files to Mercado Libre CDN via ML's /pictures/items/upload endpoint.
 * Requires auth + ML OAuth connection.
 *
 * Request: multipart/form-data
 *   files: File[] — one or more image files (JPEG/PNG/WebP/GIF, max 5 MB each)
 *
 * Response:
 *   { uploads: [{ filename, secureUrl }], errors: [{ filename, error }] }
 *
 * The returned secureUrl values are ML-hosted HTTPS URLs ready for use in listing payloads.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getCredentials } from '@/lib/mercadolibre/auth';
import { uploadPictureToML } from '@/lib/mercadolibre/pictures';
import { logger } from '@/lib/logger';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  if (!getCredentials()) {
    return NextResponse.json({ error: 'ML credentials not configured.' }, { status: 503 });
  }

  const dbAccount = await prisma.mercadoLibreAccount.findFirst({ where: { userId } });
  if (!dbAccount) {
    return NextResponse.json(
      { error: 'Not connected to Mercado Libre. Connect at /settings/mercadolibre.' },
      { status: 401 }
    );
  }

  const accessToken = dbAccount.accessToken;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided (field name: files)' }, { status: 400 });
  }

  const uploads: Array<{ filename: string; secureUrl: string }> = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      errors.push({ filename: file.name, error: `Tipo no soportado: ${file.type}. Usá JPEG, PNG, WebP o GIF.` });
      continue;
    }
    if (file.size > MAX_SIZE_BYTES) {
      errors.push({ filename: file.name, error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 5 MB.` });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadPictureToML(buffer, file.name, file.type, accessToken);
      uploads.push({ filename: file.name, secureUrl: result.secureUrl });
      logger.info('publish', `Picture uploaded to ML CDN`, { filename: file.name, id: result.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      errors.push({ filename: file.name, error: message });
      logger.warn('publish', `Picture upload failed`, { filename: file.name, error: message });
    }
  }

  return NextResponse.json({ uploads, errors });
}
