import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { BookTemplate, Zap } from 'lucide-react';
import Link from 'next/link';

export default async function TemplatesPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const templates = await prisma.productTemplate.findMany({
    where: { userId },
    orderBy: { useCount: 'desc' },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Plantillas</h1>
      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <BookTemplate size={32} />
          <p className="text-sm">Aún no guardaste ninguna plantilla.</p>
          <p className="text-xs">Publicá un producto y usá "Guardar como plantilla".</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 hover:border-indigo-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.applianceType} · usado {t.useCount} veces</p>
                </div>
                <BookTemplate size={16} className="text-indigo-400 shrink-0" />
              </div>
              {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
              <Link
                href="/"
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <Zap size={12} /> Usar plantilla
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
