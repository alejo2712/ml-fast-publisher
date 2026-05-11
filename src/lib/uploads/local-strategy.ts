/**
 * LocalUploadStrategy — saves files to public/uploads/{userId}/ on the local
 * filesystem and serves them via Next.js static file serving.
 *
 * Limitations:
 *   - Ephemeral on Vercel: files are lost between serverless invocations
 *   - Not publicly accessible by default: requires IMAGE_PUBLIC_BASE_URL to
 *     enable real ML publishing
 *
 * Safe for: dry-run, local development, self-hosted servers with persistent
 * disk (e.g. a VPS running `npm start`).
 *
 * Not safe for: Vercel/serverless production without cloud storage migration.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { UploadResult, UploadStrategy } from './types';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class LocalUploadStrategy implements UploadStrategy {
  readonly backend = 'local' as const;
  readonly isEphemeral: boolean;
  readonly producesPublicHttps = false;

  constructor(isEphemeral: boolean) {
    this.isEphemeral = isEphemeral;
  }

  async upload(file: File, userId: string): Promise<UploadResult> {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error('Tipo de archivo no permitido. Usá JPG, PNG o WebP.');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new Error('El archivo es demasiado grande. Máximo 5 MB por imagen.');
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `${randomUUID()}.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', userId);

    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(join(uploadDir, filename), Buffer.from(bytes));

    const url = `/uploads/${userId}/${filename}`;

    return {
      url,
      name: file.name,
      size: file.size,
      backend: 'local',
      isPublicHttps: false,
    };
  }
}
