/**
 * Upload strategy factory — SERVER-SIDE ONLY.
 *
 * Returns the appropriate upload backend based on configuration.
 * Currently only LocalUploadStrategy is available.
 *
 * To add a cloud provider (S3, R2, Cloudinary):
 * 1. Create a new class implementing UploadStrategy in this directory
 * 2. Check the relevant env var(s) here and return the new strategy
 * 3. Update IMAGE_PUBLIC_BASE_URL if your provider returns public URLs directly
 *
 * Example future extension:
 *   if (process.env.CLOUDINARY_URL) return new CloudinaryUploadStrategy();
 *   if (process.env.AWS_S3_BUCKET)  return new S3UploadStrategy();
 */

import { hasEphemeralFilesystem } from '@/lib/env/runtime';
import { LocalUploadStrategy } from './local-strategy';
import type { UploadStrategy } from './types';

export function getUploadStrategy(): UploadStrategy {
  // Future: check for cloud provider env vars and return appropriate strategy
  // For now, always use local filesystem
  return new LocalUploadStrategy(hasEphemeralFilesystem());
}

export type { UploadStrategy, UploadResult } from './types';
