/**
 * DELETE /api/ml/disconnect
 * Removes the MercadoLibreAccount row for this user and clears the in-memory
 * token cache. After this, /api/ml/status will return connected: false.
 *
 * The user must re-run the OAuth flow to reconnect.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { clearTokens } from '@/lib/mercadolibre/auth';
import { prisma } from '@/lib/db';

export async function DELETE() {
  let userId: string;
  try {
    const auth = await requireAuth();
    userId = auth.userId;
  } catch (e) {
    return e as Response;
  }

  // Remove all ML accounts for this user (handles multiple siteIds gracefully)
  await prisma.mercadoLibreAccount.deleteMany({ where: { userId } });

  // Clear the in-memory token cache (shared across requests in this process)
  clearTokens();

  return NextResponse.json({ disconnected: true, message: 'Cuenta de Mercado Libre desconectada' });
}
