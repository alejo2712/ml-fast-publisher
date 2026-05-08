'use client';

import type { CsvRowResult } from '@/lib/csv/parser';
import { exportAllPayloads } from '@/lib/csv/parser';
import type { MLBulkPublishResult, MLPublishResult } from '@/lib/mercadolibre/types';
import {
  CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown, ChevronRight,
  Send, FlaskConical, Loader2, Clock,
} from 'lucide-react';
import { useState, useEffect } from 'react';
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

interface RowDetailProps {
  row: CsvRowResult;
  publishState?: RowPublishState;
}

function RowDetail({ row, publishState }: RowDetailProps) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="px-4 pb-4 space-y-3 bg-white">
      {row.errors.length > 0 && (
        <div className="space-y-1">
          {row.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{e}</p>
          ))}
        </div>
      )}

      {row.missingFields.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-600">Campos faltantes:</p>
          <div className="flex flex-wrap gap-1.5">
            {row.missingFields.map((f) => (
              <span key={f.id} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {row.draft && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
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

interface BulkResultsProps {
  rows: CsvRowResult[];
  totalOk: number;
  totalWarnings: number;
  totalErrors: number;
  onReset: () => void;
}

export function BulkResults({ rows, totalOk, totalWarnings, totalErrors, onReset }: BulkResultsProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
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

  const publishableRows = rows.filter((r) => r.status !== 'error' && r.payload !== null);
  const exportableCount = rows.filter((r) => r.payload !== null).length;

  async function handleBulkPublish() {
    setShowBulkConfirm(false);
    setIsBulkPublishing(true);

    // Mark all publishable rows as "publishing"
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

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCircle2 size={14} />
          <span className="font-semibold">{totalOk}</span> listos
        </div>
        {totalWarnings > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            <AlertTriangle size={14} />
            <span className="font-semibold">{totalWarnings}</span> con advertencias
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
              Exportar JSON{exportableCount > 1 ? 's' : ''}
            </button>
          )}
          {publishableRows.length > 0 && (
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={isBulkPublishing || publishableRows.length === 0}
              className={cn(
                'flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-all',
                mlDryRun
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isBulkPublishing
                ? <><Loader2 size={14} className="animate-spin" /> Publicando...</>
                : mlDryRun
                ? <><FlaskConical size={14} /> Publicar todos ({publishableRows.length}) — dry-run</>
                : <><Send size={14} /> Publicar {publishableRows.length} en Mercado Libre</>
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
              Los {totalErrors} con errores serán ignorados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkPublish}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white',
                  mlDryRun ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'
                )}
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
            pubState?.status === 'published' ? 'bg-emerald-50/60 hover:bg-emerald-50' :
            pubState?.status === 'dry_run' ? 'bg-blue-50/60 hover:bg-blue-50' :
            pubState?.status === 'failed' ? 'bg-red-50/60 hover:bg-red-50' :
            row.status === 'ok' ? 'bg-white hover:bg-gray-50' :
            row.status === 'warnings' ? 'bg-amber-50/40 hover:bg-amber-50' :
            'bg-red-50/40 hover:bg-red-50';

          return (
            <div key={row.rowIndex}>
              <button
                onClick={() => toggleRow(row.rowIndex)}
                className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', rowBg)}
              >
                {rowIcon}
                <span className="text-xs text-gray-400 font-mono w-6 shrink-0">#{row.rowIndex}</span>
                <span className="text-sm text-gray-800 font-medium flex-1 truncate">
                  {row.draft?.title || row.rawRow['descripcion_corta'] || '(sin título)'}
                </span>
                {row.missingFields.length > 0 && !pubState && (
                  <span className="text-xs text-amber-600 shrink-0">
                    {row.missingFields.length} faltante{row.missingFields.length > 1 ? 's' : ''}
                  </span>
                )}
                {pubState?.status === 'publishing' && (
                  <span className="text-xs text-indigo-500 shrink-0">Publicando...</span>
                )}
                {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
              </button>
              {isExpanded && <RowDetail row={row} publishState={pubState} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
