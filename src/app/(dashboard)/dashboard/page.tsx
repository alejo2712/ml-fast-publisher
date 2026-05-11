import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { FileText, BookTemplate, History, Plus, TrendingUp } from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [draftCount, templateCount, historyCount, recentDrafts, recentHistory] = await Promise.all([
    prisma.productDraft.count({ where: { userId, status: { not: 'ARCHIVED' } } }),
    prisma.productTemplate.count({ where: { userId } }),
    prisma.publishHistory.count({ where: { userId } }),
    prisma.productDraft.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, applianceType: true, status: true, updatedAt: true, price: true },
    }),
    prisma.publishHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, dryRun: true, createdAt: true, draft: { select: { title: true } } },
    }),
  ]);

  const STATUS_LABEL: Record<string, string> = {
    IN_PROGRESS: 'En progreso', READY: 'Listo', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
  };
  const STATUS_COLOR: Record<string, string> = {
    IN_PROGRESS: 'bg-amber-100 text-amber-700', READY: 'bg-emerald-100 text-emerald-700',
    PUBLISHED: 'bg-blue-100 text-blue-700', ARCHIVED: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Bienvenido, {session?.user?.name ?? session?.user?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Borradores', value: draftCount, icon: FileText, href: '/drafts', color: 'text-amber-600 bg-amber-50' },
          { label: 'Plantillas', value: templateCount, icon: BookTemplate, href: '/templates', color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Publicaciones', value: historyCount, icon: History, href: '/history', color: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, icon: Icon, href, color }) => (
          <Link key={label} href={href} className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color} mb-3`}>
              <Icon size={18} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      {/* Quick action */}
      <Link
        href="/"
        className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-4 font-semibold transition-colors w-fit"
      >
        <Plus size={18} />
        Nueva publicación
      </Link>

      {/* Recent drafts */}
      {recentDrafts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Borradores recientes</h2>
            <Link href="/drafts" className="text-xs text-indigo-600 hover:underline">Ver todos</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {recentDrafts.map((d) => (
              <Link key={d.id} href={`/drafts/${d.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{d.applianceType} · {new Date(d.updatedAt).toLocaleDateString('es-AR')}</p>
                </div>
                {d.price && <span className="text-sm font-medium text-gray-700 shrink-0">${d.price.toLocaleString('es-AR')}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[d.status]}`}>
                  {STATUS_LABEL[d.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent history */}
      {recentHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Publicaciones recientes</h2>
            <Link href="/history" className="text-xs text-indigo-600 hover:underline">Ver todas</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {recentHistory.map((h) => (
              <div key={h.id} className="flex items-center gap-4 px-5 py-3.5">
                <TrendingUp size={14} className={h.status === 'PUBLISHED' ? 'text-emerald-500' : h.status === 'DRY_RUN' ? 'text-blue-400' : 'text-red-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{h.draft?.title ?? 'Producto'}</p>
                  <p className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleString('es-AR')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  h.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                  h.status === 'DRY_RUN' ? 'bg-blue-100 text-blue-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {h.dryRun ? 'Dry-run' : h.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
