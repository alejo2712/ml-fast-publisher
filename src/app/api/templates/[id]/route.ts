import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const existing = await prisma.productTemplate.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.productTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/templates/[id]/use — increments useCount, returns templateData */
export async function POST(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const template = await prisma.productTemplate.findFirst({ where: { id, userId } });
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.productTemplate.update({ where: { id }, data: { useCount: { increment: 1 } } });
    return NextResponse.json(template);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
