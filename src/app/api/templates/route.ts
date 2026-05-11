import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const templates = await prisma.productTemplate.findMany({
      where: { userId },
      orderBy: { useCount: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await req.json();
    if (!body.name || !body.templateData) {
      return NextResponse.json({ error: 'name and templateData required' }, { status: 400 });
    }
    const template = await prisma.productTemplate.create({
      data: {
        userId,
        name: body.name,
        applianceType: body.applianceType ?? 'unknown',
        description: body.description,
        templateData: body.templateData,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
