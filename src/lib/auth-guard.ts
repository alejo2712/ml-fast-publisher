/**
 * Shared helper for API routes — returns the authenticated user ID
 * or throws a 401 Response that the caller can return directly.
 */
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function requireAuth(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { userId: session.user.id };
}
