import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

/** POST /api/templates/[id]/duplicate — clone a template */
export async function POST(_: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const original = await prisma.productTemplate.findFirst({ where: { id, userId } });
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const clone = await prisma.productTemplate.create({
      data: {
        userId,
        name: `${original.name} (copia)`,
        applianceType: original.applianceType,
        description: original.description,
        templateData: original.templateData as object,
        isFavorite: false,
      },
    });
    return NextResponse.json(clone, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
