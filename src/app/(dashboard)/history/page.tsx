import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { History } from 'lucide-react';
import { HistoryTable } from '@/components/HistoryTable';

export default async function HistoryPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const items = await prisma.publishHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, mlItemId: true, permalink: true, status: true,
      dryRun: true, errorMessage: true, createdAt: true,
      draft: { select: { title: true, applianceType: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
          <History size={18} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de publicaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} publicacion{items.length !== 1 ? 'es' : ''} registrada{items.length !== 1 ? 's' : ''}.</p>
        </div>
      </div>

      <HistoryTable items={items.map((i) => ({ ...i, createdAt: i.createdAt }))} />
    </div>
  );
}
