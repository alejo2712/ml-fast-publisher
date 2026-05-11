'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { BookTemplate, Zap, Star, Copy, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Template {
  id: string;
  name: string;
  applianceType: string;
  description: string | null;
  useCount: number;
  isFavorite: boolean;
  createdAt: string;
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleFavorite(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/templates/${id}/favorite`, { method: 'POST' });
      if (res.ok) {
        const { isFavorite } = await res.json();
        setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, isFavorite } : t));
      }
    } catch {
      toast('Error al actualizar favorito', 'error');
    } finally {
      setActionId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/templates/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const clone = await res.json();
        setTemplates((prev) => [...prev, clone]);
        toast('Plantilla duplicada', 'success');
      } else {
        toast('Error al duplicar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    setActionId(id);
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast('Plantilla eliminada', 'info');
    } catch {
      toast('Error al eliminar', 'error');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 justify-center text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando plantillas...</span>
      </div>
    );
  }

  // Sort: favorites first, then by useCount
  const sorted = [...templates].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return b.useCount - a.useCount;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Plantillas</h1>
        <p className="text-sm text-gray-500">{templates.length} plantilla{templates.length !== 1 ? 's' : ''}</p>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <BookTemplate size={32} />
          <p className="text-sm">Aún no guardaste ninguna plantilla.</p>
          <p className="text-xs text-center max-w-xs">
            Publicá un producto y usá <strong>"Guardar plantilla"</strong> para reutilizar marca, condición y configuración de envío.
          </p>
          <Link href="/" className="text-indigo-600 text-sm font-medium hover:underline mt-2">
            Ir a publicar
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {sorted.map((t) => {
            const busy = actionId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  'bg-white rounded-xl border p-5 space-y-3 transition-all',
                  t.isFavorite ? 'border-amber-200 shadow-sm' : 'border-gray-100 hover:border-indigo-200 hover:shadow-sm',
                  busy && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.applianceType} · usado {t.useCount} veces</p>
                  </div>
                  {/* Favorite star */}
                  <button
                    onClick={() => handleFavorite(t.id)}
                    disabled={busy}
                    title={t.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                    className={cn(
                      'shrink-0 p-1 rounded-lg transition-colors',
                      t.isFavorite
                        ? 'text-amber-400 hover:text-amber-600'
                        : 'text-gray-300 hover:text-amber-400'
                    )}
                  >
                    <Star size={16} fill={t.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {t.description && <p className="text-xs text-gray-500">{t.description}</p>}

                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/"
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Zap size={12} /> Usar plantilla
                  </Link>

                  <button
                    onClick={() => handleDuplicate(t.id)}
                    disabled={busy}
                    title="Duplicar plantilla"
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Copy size={12} /> Duplicar
                  </button>

                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={busy}
                    title="Eliminar plantilla"
                    className="ml-auto p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
