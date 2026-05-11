/**
 * POST /api/ml/test-dry-run
 * Validates a sample product payload and simulates a dry-run publish.
 * Always safe — never calls the real ML API regardless of env config.
 * Used by /settings/mercadolibre to verify the pipeline works.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { buildMLPayload } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import { prepareImages } from '@/lib/images/prepare-images';
import { prisma } from '@/lib/db';
import type { ProductDraft } from '@/types';

const SAMPLE_DRAFT: ProductDraft = {
  title: 'Heladera Samsung No Frost 320L Blanca',
  applianceType: 'refrigerator',
  categoryId: 'refrigerator',
  mlCategoryId: 'MLA1577',
  brand: 'Samsung',
  model: 'RT32K5730WW',
  condition: 'new',
  price: 450000,
  currency: 'ARS',
  stock: 1,
  description: 'Heladera Samsung No Frost 320L. Color blanco. Voltaje 220V.',
  color: 'Blanco',
  voltage: '220V',
  capacity: '320',
  images: [],
  listingType: 'gold_special',
  shipping: { mode: 'me2', localPickUp: false, freeShipping: false },
};

export async function POST() {
  let userId: string;
  try {
    const auth = await requireAuth();
    userId = auth.userId;
  } catch (e) {
    return e as Response;
  }

  // Build and validate payload
  const payload = buildMLPayload(SAMPLE_DRAFT);
  const validation = validateDraft(SAMPLE_DRAFT);

  // Images are empty for this test — prepareImages with dryRun=true always passes
  const imagePrep = prepareImages([], true);

  // Persist as DRY_RUN history so the test is auditable
  await prisma.publishHistory.create({
    data: {
      userId,
      mlItemId: null,
      permalink: null,
      status: 'DRY_RUN',
      dryRun: true,
      payload: payload as object,
    },
  });

  return NextResponse.json({
    success: true,
    result: {
      status: 'dry_run',
      message: 'Test dry-run completado. El pipeline de publicación funciona correctamente.',
    },
    validation: {
      isReady: validation.isReady,
      missingFields: validation.missingFields.map((f) => f.id),
      fieldErrors: validation.fieldErrors.map((f) => ({ id: f.id, message: f.message })),
    },
    imagePrep: {
      hasLocalOnly: imagePrep.hasLocalOnly,
      blockRealPublish: imagePrep.blockRealPublish,
      warnings: imagePrep.warnings,
    },
    payload,
  });
}
