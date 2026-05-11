import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

/** POST /api/drafts/[id]/duplicate — clone a draft */
export async function POST(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;

    const original = await prisma.productDraft.findFirst({ where: { id, userId } });
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const clone = await prisma.productDraft.create({
      data: {
        userId,
        title: `${original.title} (copia)`,
        applianceType: original.applianceType,
        mlCategoryId: original.mlCategoryId,
        condition: original.condition,
        price: original.price,
        currency: original.currency,
        stock: original.stock,
        rawInput: original.rawInput,
        draftData: original.draftData ?? {},
        lastPayload: original.lastPayload ?? undefined,
        status: 'IN_PROGRESS',
      },
    });

    return NextResponse.json(clone, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
