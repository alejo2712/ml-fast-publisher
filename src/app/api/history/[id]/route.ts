import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/history/[id]/retry — re-attempt a failed publish using the stored payload.
 * Body may include { action: 'retry' | 'duplicate_draft' }.
 * - retry: calls /api/ml/publish with the saved payload
 * - duplicate_draft: creates a new draft from the history entry's payload
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? 'retry';

    const entry = await prisma.publishHistory.findFirst({
      where: { id, userId },
      include: { draft: { select: { title: true, applianceType: true, draftData: true } } },
    });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'duplicate_draft') {
      // Create a new draft from the stored history entry
      const draft = await prisma.productDraft.create({
        data: {
          userId,
          title: `${entry.draft?.title ?? 'Producto'} (copia)`,
          applianceType: entry.draft?.applianceType ?? 'unknown',
          mlCategoryId: (entry.payload as Record<string, string>)?.category_id ?? '',
          draftData: (entry.draft?.draftData as object) ?? {},
          lastPayload: entry.payload as object,
          status: 'IN_PROGRESS',
        },
      });
      return NextResponse.json({ action: 'duplicate_draft', draftId: draft.id }, { status: 201 });
    }

    // action === 'retry' — repost the stored payload to ML publish endpoint
    if (!entry.payload) {
      return NextResponse.json({ error: 'No payload stored for this history entry' }, { status: 422 });
    }

    const publishRes = await fetch(
      `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/ml/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify({ items: [{ payload: entry.payload, rowIndex: 0 }] }),
      },
    );
    const publishData = await publishRes.json();
    return NextResponse.json({ action: 'retry', result: publishData });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
