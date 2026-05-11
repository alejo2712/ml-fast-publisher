/**
 * POST /api/uploads — upload a product image.
 * Files are stored at public/uploads/{userId}/{uuid}.{ext} and served statically.
 *
 * Limitation: local paths (/uploads/...) work in dry-run mode.
 * For real ML publishing, images must be accessible via a public URL.
 * When deploying to production, replace this with an S3/CDN upload flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Usá JPG, PNG o WebP.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'El archivo es demasiado grande. Máximo 5 MB por imagen.' },
        { status: 400 }
      );
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `${randomUUID()}.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', userId);

    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(join(uploadDir, filename), Buffer.from(bytes));

    const url = `/uploads/${userId}/${filename}`;
    return NextResponse.json({ url, name: file.name, size: file.size }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[uploads] Error:', e);
    return NextResponse.json({ error: 'Error al subir el archivo.' }, { status: 500 });
  }
}
