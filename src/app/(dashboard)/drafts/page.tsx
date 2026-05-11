import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { Plus, FileText, Trash2 } from 'lucide-react';

export default async function DraftsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const drafts = await prisma.productDraft.findMany({
    where: { userId, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
  });

  const STATUS_COLOR: Record<string, string> = {
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    READY: 'bg-emerald-100 text-emerald-700',
    PUBLISHED: 'bg-blue-100 text-blue-700',
  };
  const STATUS_LABEL: Record<string, string> = {
    IN_PROGRESS: 'En progreso', READY: 'Listo', PUBLISHED: 'Publicado',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Borradores</h1>
        <Link href="/" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
          <Plus size={15} /> Nuevo borrador
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <FileText size={32} />
          <p className="text-sm">No tenés borradores todavía.</p>
          <Link href="/" className="text-indigo-600 text-sm font-medium hover:underline">Crear uno</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <Link href={`/`} className="text-sm font-medium text-gray-800 hover:text-indigo-600 truncate block">
                  {d.title}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">
                  {d.applianceType} · {d.price ? `$${d.price.toLocaleString('es-AR')}` : 'Sin precio'} · {new Date(d.updatedAt).toLocaleDateString('es-AR')}
                </p>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL[d.status] ?? d.status}
              </span>
              <form action={`/api/drafts/${d.id}`} method="DELETE">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('¿Eliminar este borrador?')) return;
                    await fetch(`/api/drafts/${d.id}`, { method: 'DELETE' });
                    window.location.reload();
                  }}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
