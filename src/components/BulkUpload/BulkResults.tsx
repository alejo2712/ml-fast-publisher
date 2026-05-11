'use client';

import type { CsvRowResult } from '@/lib/csv/parser';
import { exportAllPayloads } from '@/lib/csv/parser';
import type { MLBulkPublishResult, MLPublishResult } from '@/lib/mercadolibre/types';
import type { ProductDraft } from '@/types';
import {
  CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown, ChevronRight,
  Send, FlaskConical, Loader2, Clock, Pencil, X, Check,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { cn } from '@/components/ui';
import { JsonPreview } from '@/components/JsonPreview';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado',
};

type PublishRowStatus = 'idle' | 'publishing' | 'published' | 'dry_run' | 'failed';

interface RowPublishState {
  status: PublishRowStatus;
  message?: string;
  permalink?: string;
}

// ─── Inline edit cell ────────────────────────────────────────────────────────

interface EditCellProps {
  label: string;
  value: string;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  onCommit: (value: string) => void;
  error?: boolean;
}

const EditCell = memo(function EditCell({ label, value, type = 'text', options, onCommit, error }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  function commit() {
    setEditing(false);
    if (local !== value) onCommit(local);
  }

  function cancel() {
    setLocal(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  }

  // Sync external value changes
  if (!editing && local !== value) setLocal(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-0">
        {type === 'select' && options ? (
          <select
            ref={inputRef as React.Ref<HTMLSelectElement>}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            autoFocus
            className="text-xs border border-indigo-400 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type={type}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="text-xs border border-indigo-400 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-28 bg-white"
          />
        )}
        <button onClick={commit} className="text-emerald-500 hover:text-emerald-700 shrink-0"><Check size={11} /></button>
        <button onClick={cancel} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={11} /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        'group flex items-center gap-1 text-xs rounded px-1.5 py-1 -mx-1.5 transition-colors text-left',
        error
          ? 'text-red-600 bg-red-50 hover:bg-red-100'
          : 'text-gray-700 hover:bg-gray-100'
      )}
      title={`Editar ${label}`}
    >
      <span className="truncate max-w-[140px]">{value || <span className="text-gray-400 italic">—</span>}</span>
      <Pencil size={10} className="opacity-0 group-hover:opacity-50 shrink-0" />
    </button>
  );
});

// ─── Inline edit row panel ───────────────────────────────────────────────────

type RowChanges = Partial<Pick<ProductDraft, 'title' | 'price' | 'stock' | 'condition' | 'brand' | 'model'>>;

interface EditPanelProps {
  row: CsvRowResult;
  onEdit: (changes: RowChanges) => void;
}

const CONDITION_OPTIONS = [
  { value: '', label: '— sin definir —' },
  { value: 'new', label: 'Nuevo' },
  { value: 'used', label: 'Usado' },
  { value: 'refurbished', label: 'Reacondicionado' },
];

function EditPanel({ row, onEdit }: EditPanelProps) {
  if (!row.draft) return null;
  const { draft } = row;

  const fieldError = (id: string) => row.errors.some((e) => e.toLowerCase().includes(id));

  return (
    <div className="px-4 pb-4 bg-amber-50/30 border-t border-amber-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Editar campos</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Título</p>
          <EditCell
            label="título"
            value={draft.title}
            type="text"
            error={fieldError('título')}
            onCommit={(v) => onEdit({ title: v.slice(0, 60) })}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Precio (ARS)</p>
          <EditCell
            label="precio"
            value={draft.price != null ? String(draft.price) : ''}
            type="number"
            error={!draft.price}
            onCommit={(v) => { const n = parseFloat(v); if (!isNaN(n)) onEdit({ price: n }); }}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Stock</p>
          <EditCell
            label="stock"
            value={String(draft.stock ?? 1)}
            type="number"
            onCommit={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) onEdit({ stock: n }); }}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Condición</p>
          <EditCell
            label="condición"
            value={draft.condition ?? ''}
            type="select"
            options={CONDITION_OPTIONS}
            error={!draft.condition}
            onCommit={(v) => onEdit({ condition: v as ProductDraft['condition'] })}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Marca</p>
          <EditCell
            label="marca"
            value={draft.brand ?? ''}
            type="text"
            error={!draft.brand}
            onCommit={(v) => onEdit({ brand: v })}
          />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Modelo</p>
          <EditCell
            label="modelo"
            value={draft.model ?? ''}
            type="text"
            onCommit={(v) => onEdit({ model: v })}
          />
        </div>
      </div>

      {/* Validation issues */}
      {(row.errors.length > 0 || row.missingFields.length > 0) && (
        <div className="mt-3 space-y-1">
          {row.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
          ))}
          {row.missingFields.length > 0 && (
            <p className="text-xs text-amber-600">
              Campos faltantes: {row.missingFields.map((f) => f.label).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Detail view (JSON + publish state) ─────────────────────────────────────

interface RowDetailProps {
  row: CsvRowResult;
  publishState?: RowPublishState;
}

function RowDetail({ row, publishState }: RowDetailProps) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="px-4 pb-4 space-y-3 bg-white border-t border-gray-50">
      {row.draft && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 pt-3">
          {row.draft.brand && <span><span className="text-gray-400">Marca:</span> {row.draft.brand}</span>}
          {row.draft.model && <span><span className="text-gray-400">Modelo:</span> {row.draft.model}</span>}
          {row.draft.condition && <span><span className="text-gray-400">Condición:</span> {CONDITION_LABELS[row.draft.condition]}</span>}
          {row.draft.price && <span><span className="text-gray-400">Precio:</span> ${row.draft.price.toLocaleString('es-AR')}</span>}
          {row.draft.capacity && <span><span className="text-gray-400">Capacidad:</span> {row.draft.capacity}</span>}
          {row.draft.color && <span><span className="text-gray-400">Color:</span> {row.draft.color}</span>}
        </div>
      )}

      {publishState && publishState.status !== 'idle' && (
        <div className={cn(
          'text-xs rounded-lg px-3 py-2 flex items-center gap-2',
          publishState.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
          publishState.status === 'dry_run' ? 'bg-blue-50 text-blue-700' :
          publishState.status === 'failed' ? 'bg-red-50 text-red-700' :
          'bg-gray-50 text-gray-600'
        )}>
          {publishState.status === 'publishing' && <Loader2 size={12} className="animate-spin" />}
          {publishState.status === 'published' && <CheckCircle2 size={12} />}
          {publishState.status === 'dry_run' && <FlaskConical size={12} />}
          {publishState.status === 'failed' && <XCircle size={12} />}
          <span>{publishState.message}</span>
          {publishState.permalink && (
            <a href={publishState.permalink} target="_blank" rel="noreferrer" className="underline ml-1">Ver en ML</a>
          )}
        </div>
      )}

      {row.payload && (
        <button
          onClick={() => setShowJson((v) => !v)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          {showJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showJson ? 'Ocultar JSON' : 'Ver JSON (ML)'}
        </button>
      )}
      {showJson && row.payload && <JsonPreview payload={row.payload} />}
    </div>
  );
}

// ─── BulkResults ─────────────────────────────────────────────────────────────

interface BulkResultsProps {
  rows: CsvRowResult[];
  totalOk: number;
  totalWarnings: number;
  totalErrors: number;
  onReset: () => void;
  onRowEdit: (rowIndex: number, changes: RowChanges) => void;
}

export function BulkResults({ rows, totalOk, totalWarnings, totalErrors, onReset, onRowEdit }: BulkResultsProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<number>>(new Set());
  const [publishStates, setPublishStates] = useState<Map<number, RowPublishState>>(new Map());
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [mlDryRun, setMlDryRun] = useState(true);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  useEffect(() => {
    fetch('/api/ml/status')
      .then((r) => r.json())
      .then((s) => setMlDryRun(s.dryRun ?? true))
      .catch(() => {});
  }, []);

  function toggleRow(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleEdit(idx: number) {
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  const publishableRows = rows.filter((r) => r.status !== 'error' && r.payload !== null);
  const exportableCount = rows.filter((r) => r.payload !== null).length;

  async function handleBulkPublish() {
    setShowBulkConfirm(false);
    setIsBulkPublishing(true);
    setPublishStates((prev) => {
      const next = new Map(prev);
      publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'publishing', message: 'Publicando...' }));
      return next;
    });

    try {
      const items = publishableRows.map((r) => ({ payload: r.payload!, rowIndex: r.rowIndex }));
      const res = await fetch('/api/ml/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data: MLBulkPublishResult = await res.json();
      setPublishStates((prev) => {
        const next = new Map(prev);
        data.results.forEach((r: MLPublishResult) => {
          if (r.rowIndex !== undefined) {
            next.set(r.rowIndex, {
              status: r.status === 'published' ? 'published' : r.status === 'dry_run' ? 'dry_run' : 'failed',
              message: r.message,
              permalink: r.permalink,
            });
          }
        });
        return next;
      });
    } catch (err) {
      setPublishStates((prev) => {
        const next = new Map(prev);
        publishableRows.forEach((r) =>
          next.set(r.rowIndex, { status: 'failed', message: err instanceof Error ? err.message : 'Error de red' })
        );
        return next;
      });
    } finally {
      setIsBulkPublishing(false);
    }
  }

  const publishedCount = Array.from(publishStates.values()).filter((s) => s.status === 'published' || s.status === 'dry_run').length;
  const failedCount = Array.from(publishStates.values()).filter((s) => s.status === 'failed').length;

  // Track how many rows have been edited
  const editedCount = rows.filter((r, _, arr) => {
    const orig = arr.find((x) => x.rowIndex === r.rowIndex);
    return orig !== r;
  }).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCircle2 size={14} />
          <span className="font-semibold">{totalOk}</span> listos
        </div>
        {totalWarnings > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            <AlertTriangle size={14} />
            <span className="font-semibold">{totalWarnings}</span> incompletos
          </div>
        )}
        {totalErrors > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
            <XCircle size={14} />
            <span className="font-semibold">{totalErrors}</span> con errores
          </div>
        )}
        {publishedCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
            {mlDryRun ? <FlaskConical size={14} /> : <CheckCircle2 size={14} />}
            <span className="font-semibold">{publishedCount}</span> {mlDryRun ? 'simulados' : 'publicados'}
          </div>
        )}
        {failedCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
            <XCircle size={14} />
            <span className="font-semibold">{failedCount}</span> fallidos
          </div>
        )}

        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={onReset}
            disabled={isBulkPublishing}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            Nueva carga
          </button>
          {exportableCount > 0 && (
            <button
              onClick={() => exportAllPayloads(rows)}
              disabled={isBulkPublishing}
              className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Exportar JSON
            </button>
          )}
          {publishableRows.length > 0 && (
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={isBulkPublishing}
              className={cn(
                'flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-all',
                mlDryRun ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isBulkPublishing
                ? <><Loader2 size={14} className="animate-spin" /> Publicando...</>
                : mlDryRun
                ? <><FlaskConical size={14} /> Publicar {publishableRows.length} — dry-run</>
                : <><Send size={14} /> Publicar {publishableRows.length} en ML</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Bulk confirm modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-5 p-6">
            <h2 className="font-bold text-gray-900 text-lg">Confirmar publicación masiva</h2>
            {mlDryRun && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
                <FlaskConical size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-blue-700"><span className="font-semibold">Dry-run activo.</span> No se publicará nada real.</p>
              </div>
            )}
            <p className="text-sm text-gray-600">
              Se procesarán <span className="font-bold text-gray-900">{publishableRows.length} productos</span>.
              {totalErrors > 0 && ` Los ${totalErrors} con errores serán ignorados.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowBulkConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleBulkPublish}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white', mlDryRun ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700')}
              >
                {mlDryRun ? <><FlaskConical size={14} /> Simular</> : <><Send size={14} /> Publicar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row list */}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {rows.map((row) => {
          const isExpanded = expandedRows.has(row.rowIndex);
          const isEditing = editingRows.has(row.rowIndex);
          const pubState = publishStates.get(row.rowIndex);

          const rowIcon =
            pubState?.status === 'publishing' ? <Loader2 size={15} className="text-indigo-400 animate-spin shrink-0" /> :
            pubState?.status === 'published' ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> :
            pubState?.status === 'dry_run' ? <FlaskConical size={15} className="text-blue-500 shrink-0" /> :
            pubState?.status === 'failed' ? <XCircle size={15} className="text-red-500 shrink-0" /> :
            row.status === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> :
            row.status === 'warnings' ? <Clock size={15} className="text-amber-500 shrink-0" /> :
            <XCircle size={15} className="text-red-500 shrink-0" />;

          const rowBg =
            pubState?.status === 'published' ? 'bg-emerald-50/60' :
            pubState?.status === 'dry_run' ? 'bg-blue-50/60' :
            pubState?.status === 'failed' ? 'bg-red-50/60' :
            row.status === 'ok' ? 'bg-white' :
            row.status === 'warnings' ? 'bg-amber-50/30' :
            'bg-red-50/30';

          return (
            <div key={row.rowIndex} className={cn('transition-colors', rowBg)}>
              {/* Row header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => toggleRow(row.rowIndex)} className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                  {rowIcon}
                  <span className="text-xs text-gray-400 font-mono w-6 shrink-0">#{row.rowIndex}</span>
                  <span className="text-sm text-gray-800 font-medium flex-1 truncate">
                    {row.draft?.title || row.rawRow['descripcion_corta'] || '(sin título)'}
                  </span>
                </button>

                {/* Price badge */}
                {row.draft?.price ? (
                  <span className="text-xs font-semibold text-gray-700 shrink-0">
                    ${row.draft.price.toLocaleString('es-AR')}
                  </span>
                ) : (
                  <span className="text-xs text-red-400 shrink-0">sin precio</span>
                )}

                {/* Edit toggle */}
                {row.draft && (
                  <button
                    onClick={() => toggleEdit(row.rowIndex)}
                    className={cn(
                      'flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors shrink-0',
                      isEditing
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                    )}
                    title="Editar campos"
                  >
                    <Pencil size={11} />
                    {isEditing ? 'Cerrar' : 'Editar'}
                  </button>
                )}

                <button onClick={() => toggleRow(row.rowIndex)} className="shrink-0 text-gray-400">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>

              {/* Inline edit panel */}
              {isEditing && row.draft && (
                <EditPanel
                  row={row}
                  onEdit={(changes) => onRowEdit(row.rowIndex, changes)}
                />
              )}

              {/* Detail panel (JSON etc.) */}
              {isExpanded && <RowDetail row={row} publishState={pubState} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
