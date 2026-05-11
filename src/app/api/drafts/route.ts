import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

/** GET /api/drafts — list user's drafts */
export async function GET() {
  try {
    const { userId } = await requireAuth();
    const drafts = await prisma.productDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, title: true, applianceType: true, condition: true,
        price: true, currency: true, status: true, createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json(drafts);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/drafts — create draft */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();
    const draft = await prisma.productDraft.create({
      data: {
        userId,
        title: body.title ?? 'Borrador sin título',
        applianceType: body.applianceType ?? 'unknown',
        mlCategoryId: body.mlCategoryId ?? '',
        condition: body.condition,
        price: body.price ? parseFloat(body.price) : null,
        currency: body.currency ?? 'ARS',
        stock: body.stock ?? 1,
        rawInput: body.rawInput,
        draftData: body.draftData ?? {},
        lastPayload: body.lastPayload,
        status: 'IN_PROGRESS',
      },
    });
    return NextResponse.json(draft, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
