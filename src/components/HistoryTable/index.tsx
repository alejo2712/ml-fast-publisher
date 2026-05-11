'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, FlaskConical, RotateCcw, Copy, ExternalLink, Search, Filter } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';

export interface HistoryEntry {
  id: string;
  mlItemId: string | null;
  permalink: string | null;
  status: string;
  dryRun: boolean;
  errorMessage: string | null;
  createdAt: Date;
  environment?: string | null;
  durationMs?: number | null;
  draft: { title: string; applianceType: string } | null;
}

interface HistoryTableProps {
  items: HistoryEntry[];
}

type StatusFilter = 'all' | 'PUBLISHED' | 'DRY_RUN' | 'FAILED' | 'PENDING';

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Publicado', DRY_RUN: 'Dry-run', FAILED: 'Fallido',
  PENDING: 'Pendiente', SKIPPED: 'Ignorado',
  VALIDATION_FAILED: 'Validación fallida', PREFLIGHT_FAILED: 'Preflight fallido',
};
const STATUS_COLOR: Record<string, string> = {
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  DRY_RUN: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
  VALIDATION_FAILED: 'bg-orange-100 text-orange-700',
  PREFLIGHT_FAILED: 'bg-purple-100 text-purple-700',
};

const ENV_COLOR: Record<string, string> = {
  production: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
  preview: 'bg-amber-50 text-amber-600 border border-amber-200',
  local: 'bg-gray-50 text-gray-500 border border-gray-200',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function HistoryTable({ items: initialItems }: HistoryTableProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [items, setItems] = useState<HistoryEntry[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const title = item.draft?.title?.toLowerCase() ?? '';
        const type = item.draft?.applianceType?.toLowerCase() ?? '';
        const id = item.mlItemId?.toLowerCase() ?? '';
        if (!title.includes(q) && !type.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  async function handleRetry(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/history/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (res.ok) {
        const data = await res.json();
        const result = data.result?.results?.[0];
        const newStatus = result?.status === 'published' ? 'PUBLISHED' : result?.status === 'dry_run' ? 'DRY_RUN' : 'FAILED';
        // Prepend new entry to list
        toast(`Reintento: ${STATUS_LABEL[newStatus] ?? newStatus}`, newStatus === 'FAILED' ? 'error' : 'success');
      } else {
        toast('Error al reintentar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/history/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate_draft' }),
      });
      if (res.ok) {
        toast('Borrador creado desde historial', 'success');
      } else {
        toast('Error al duplicar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setLoadingId(null);
    }
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => { counts[i.status] = (counts[i.status] ?? 0) + 1; });
    return counts;
  }, [items]);

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: `Todos (${items.length})` },
    { value: 'PUBLISHED', label: `Publicados (${statusCounts['PUBLISHED'] ?? 0})` },
    { value: 'DRY_RUN', label: `Dry-run (${statusCounts['DRY_RUN'] ?? 0})` },
    { value: 'FAILED', label: `Fallidos (${statusCounts['FAILED'] ?? 0})` },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, tipo, ID..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 bg-white"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <Filter size={13} className="text-gray-400 ml-1" />
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                statusFilter === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {search || statusFilter !== 'all' ? 'No hay resultados para este filtro.' : 'Todavía no publicaste nada.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {filtered.map((h) => {
            const isLoading = loadingId === h.id;
            return (
              <div key={h.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                {/* Status icon */}
                {h.status === 'PUBLISHED' ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> :
                 h.status === 'DRY_RUN' ? <FlaskConical size={16} className="text-blue-400 shrink-0" /> :
                 <XCircle size={16} className="text-red-400 shrink-0" />}

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {h.draft?.title ?? 'Producto sin nombre'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {h.draft?.applianceType} · {new Date(h.createdAt).toLocaleString('es-AR')}
                    {h.mlItemId && <span className="ml-1 font-mono">· {h.mlItemId}</span>}
                  </p>
                  {h.errorMessage && (
                    <p className="text-xs text-red-500 mt-0.5 truncate" title={h.errorMessage}>{h.errorMessage}</p>
                  )}
                </div>

                {/* Badges + actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {/* Environment badge */}
                  {h.environment && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ENV_COLOR[h.environment] ?? ENV_COLOR.local}`}>
                      {h.environment === 'production' ? 'prod' : h.environment === 'preview' ? 'preview' : 'local'}
                    </span>
                  )}
                  {/* Dry-run badge */}
                  {h.dryRun && h.status !== 'DRY_RUN' && (
                    <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">dry-run</span>
                  )}
                  {/* Duration badge */}
                  {h.durationMs != null && h.durationMs > 0 && (
                    <span className="text-xs text-gray-400 font-mono">{formatDuration(h.durationMs)}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[h.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[h.status] ?? h.status}
                  </span>

                  {/* Retry (only for failed) */}
                  {h.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetry(h.id)}
                      disabled={isLoading}
                      title="Reintentar publicación"
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg transition-all disabled:opacity-50"
                    >
                      <RotateCcw size={11} className={isLoading ? 'animate-spin' : ''} />
                      Reintentar
                    </button>
                  )}

                  {/* Duplicate as draft */}
                  <button
                    onClick={() => handleDuplicate(h.id)}
                    disabled={isLoading}
                    title="Crear borrador desde esta publicación"
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2 py-0.5 rounded-lg transition-all disabled:opacity-50"
                  >
                    <Copy size={11} />
                    Duplicar
                  </button>

                  {/* ML link */}
                  {h.permalink && (
                    <a
                      href={h.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      <ExternalLink size={11} />
                      Ver en ML
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        Mostrando {filtered.length} de {items.length} publicaciones
      </p>
    </div>
  );
}
