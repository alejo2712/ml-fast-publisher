/**
 * POST /api/uploads — upload a product image.
 *
 * Uses the configured upload strategy (see src/lib/uploads/strategy.ts).
 * Currently: LocalUploadStrategy — stores files at public/uploads/{userId}/
 *
 * PRODUCTION WARNING:
 *   On Vercel (serverless), the local filesystem is ephemeral — files are
 *   lost between function invocations. For production, migrate to a cloud
 *   storage provider (S3, Cloudflare R2, Cloudinary) and update IMAGE_PUBLIC_BASE_URL.
 *
 * Uploaded files are served by Next.js static serving at /uploads/... .
 * For real ML publishing, configure IMAGE_PUBLIC_BASE_URL with the public
 * HTTPS base URL of this server.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getUploadStrategy } from '@/lib/uploads/strategy';
import { hasEphemeralFilesystem } from '@/lib/env/runtime';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const strategy = getUploadStrategy();
    const result = await strategy.upload(file, userId);

    return NextResponse.json(
      {
        url: result.url,
        name: result.name,
        size: result.size,
        backend: result.backend,
        isPublicHttps: result.isPublicHttps,
        // Warn consumer when storage is ephemeral
        ephemeralWarning: strategy.isEphemeral
          ? 'El sistema de archivos es efímero en este entorno (Vercel serverless). Las imágenes subidas pueden perderse entre reinicios. Para producción, migrá a un proveedor de almacenamiento en la nube (S3, R2, Cloudinary).'
          : null,
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : 'Error al subir el archivo.';
    console.error('[uploads] Error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/uploads/status — returns upload backend info for diagnostics.
 * Used by /settings/system and /settings/production-readiness.
 */
export async function GET() {
  try {
    await requireAuth();
    const strategy = getUploadStrategy();
    const ephemeral = hasEphemeralFilesystem();

    return NextResponse.json({
      backend: strategy.backend,
      isEphemeral: ephemeral,
      producesPublicHttps: strategy.producesPublicHttps,
      imagePublicBaseUrl: process.env.IMAGE_PUBLIC_BASE_URL ?? null,
      recommendation: ephemeral
        ? 'Migrá a S3/R2/Cloudinary para almacenamiento persistente en producción'
        : 'Filesystem local — adecuado para desarrollo y servidores con disco persistente',
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
