import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const url = new URL(req.url);
    const take = parseInt(url.searchParams.get('take') ?? '50');
    const skip = parseInt(url.searchParams.get('skip') ?? '0');

    const [items, total] = await Promise.all([
      prisma.publishHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true, mlItemId: true, permalink: true, status: true,
          dryRun: true, errorMessage: true, createdAt: true,
          draft: { select: { id: true, title: true, applianceType: true } },
        },
      }),
      prisma.publishHistory.count({ where: { userId } }),
    ]);

    return NextResponse.json({ items, total });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();
    const record = await prisma.publishHistory.create({
      data: {
        userId,
        draftId: body.draftId,
        mlItemId: body.mlItemId,
        permalink: body.permalink,
        status: body.status ?? 'PENDING',
        dryRun: body.dryRun ?? true,
        payload: body.payload,
        errorMessage: body.errorMessage,
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
