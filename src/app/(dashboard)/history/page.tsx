import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { CheckCircle2, XCircle, FlaskConical, History } from 'lucide-react';

export default async function HistoryPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const { items } = { items: await prisma.publishHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, mlItemId: true, permalink: true, status: true,
      dryRun: true, errorMessage: true, createdAt: true,
      draft: { select: { title: true, applianceType: true } },
    },
  })};

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Historial de publicaciones</h1>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <History size={32} />
          <p className="text-sm">Todavía no publicaste nada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {items.map((h) => (
            <div key={h.id} className="flex items-center gap-4 px-5 py-4">
              {h.status === 'PUBLISHED' ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> :
               h.status === 'DRY_RUN'   ? <FlaskConical size={16} className="text-blue-400 shrink-0" /> :
               <XCircle size={16} className="text-red-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {h.draft?.title ?? 'Producto sin nombre'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {h.draft?.applianceType} · {new Date(h.createdAt).toLocaleString('es-AR')}
                  {h.mlItemId && ` · ID: ${h.mlItemId}`}
                </p>
                {h.errorMessage && <p className="text-xs text-red-500 mt-0.5 truncate">{h.errorMessage}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {h.dryRun && <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">dry-run</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  h.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                  h.status === 'DRY_RUN'   ? 'bg-blue-100 text-blue-700' :
                  h.status === 'FAILED'    ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {h.status.toLowerCase().replace('_', ' ')}
                </span>
                {h.permalink && (
                  <a href={h.permalink} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    Ver en ML
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
