import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

/** GET /api/drafts/[id] */
export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const draft = await prisma.productDraft.findFirst({ where: { id, userId } });
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PATCH /api/drafts/[id] — partial update / autosave */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.productDraft.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const draft = await prisma.productDraft.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        applianceType: body.applianceType ?? existing.applianceType,
        mlCategoryId: body.mlCategoryId ?? existing.mlCategoryId,
        condition: body.condition ?? existing.condition,
        price: body.price !== undefined ? parseFloat(body.price) : existing.price,
        currency: body.currency ?? existing.currency,
        stock: body.stock ?? existing.stock,
        status: body.status ?? existing.status,
        draftData: body.draftData ?? existing.draftData,
        lastPayload: body.lastPayload ?? existing.lastPayload,
      },
    });
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/drafts/[id] */
export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const existing = await prisma.productDraft.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.productDraft.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
