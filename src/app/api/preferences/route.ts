import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

/** GET /api/preferences — returns seller preferences (creates defaults if none) */
export async function GET() {
  try {
    const { userId } = await requireAuth();
    const prefs = await prisma.sellerPreferences.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return NextResponse.json(prefs);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PUT /api/preferences — update seller preferences */
export async function PUT(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();
    const prefs = await prisma.sellerPreferences.upsert({
      where: { userId },
      update: {
        defaultCurrency: body.defaultCurrency,
        defaultShipping: body.defaultShipping,
        defaultWarranty: body.defaultWarranty ?? null,
        localPickUp: body.localPickUp ?? false,
        defaultCondition: body.defaultCondition ?? null,
        defaultListingType: body.defaultListingType,
      },
      create: {
        userId,
        defaultCurrency: body.defaultCurrency ?? 'ARS',
        defaultShipping: body.defaultShipping ?? 'me2',
        defaultWarranty: body.defaultWarranty ?? null,
        localPickUp: body.localPickUp ?? false,
        defaultCondition: body.defaultCondition ?? null,
        defaultListingType: body.defaultListingType ?? 'gold_special',
      },
    });
    return NextResponse.json(prefs);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
