'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, FileText, Trash2, Copy, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Draft {
  id: string;
  title: string;
  applianceType: string;
  price: number | null;
  status: string;
  updatedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  READY: 'bg-emerald-100 text-emerald-700',
  PUBLISHED: 'bg-blue-100 text-blue-700',
};
const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'En progreso', READY: 'Listo', PUBLISHED: 'Publicado',
};

export default function DraftsPage() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/drafts');
      if (res.ok) setDrafts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este borrador?')) return;
    setActionId(id);
    try {
      await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      toast('Borrador eliminado', 'info');
    } catch {
      toast('Error al eliminar', 'error');
    } finally {
      setActionId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/drafts/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const clone = await res.json();
        setDrafts((prev) => [clone, ...prev]);
        toast('Borrador duplicado', 'success');
      } else {
        toast('Error al duplicar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 justify-center text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando borradores...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Borradores</h1>
        <Link
          href="/"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
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
          {drafts.map((d) => {
            const busy = actionId === d.id;
            return (
              <div key={d.id} className={cn('flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors', busy && 'opacity-60')}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {d.applianceType}
                    {d.price ? ` · $${d.price.toLocaleString('es-AR')}` : ' · Sin precio'}
                    {' · '}{new Date(d.updatedAt).toLocaleDateString('es-AR')}
                  </p>
                </div>

                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDuplicate(d.id)}
                    disabled={busy}
                    title="Duplicar borrador"
                    className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    disabled={busy}
                    title="Eliminar borrador"
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">{drafts.length} borrador{drafts.length !== 1 ? 'es' : ''}</p>
    </div>
  );
}
