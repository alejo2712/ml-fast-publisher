/**
 * POST /api/ml/preflight
 * Runs publish readiness checks without publishing anything.
 *
 * Request body: { payload: MLPayload }
 * Response: PreflightResult — structured list of checks with status indicators.
 *
 * Safe to call repeatedly. Never triggers any ML API call.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { runPreflight } from '@/lib/mercadolibre/preflight';
import type { MLPayload } from '@/types';

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAuth();
    userId = auth.userId;
  } catch (e) {
    return e as Response;
  }

  const body = await request.json().catch(() => null);
  if (!body?.payload) {
    return NextResponse.json({ error: 'Missing payload in request body' }, { status: 400 });
  }

  const result = await runPreflight(userId, body.payload as MLPayload);
  return NextResponse.json(result);
}
