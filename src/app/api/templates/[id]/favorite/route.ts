import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

/** POST /api/templates/[id]/favorite — toggle isFavorite */
export async function POST(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const template = await prisma.productTemplate.findFirst({ where: { id, userId } });
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.productTemplate.update({
      where: { id },
      data: { isFavorite: !template.isFavorite },
    });
    return NextResponse.json({ isFavorite: updated.isFavorite });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
