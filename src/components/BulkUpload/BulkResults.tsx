'use client';

import type { CsvRowResult } from '@/lib/csv/parser';
import { exportAllPayloads } from '@/lib/csv/parser';
import { CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui';
import { JsonPreview } from '@/components/JsonPreview';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado',
};

interface RowDetailProps {
  row: CsvRowResult;
}

function RowDetail({ row }: RowDetailProps) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="px-4 pb-4 space-y-3">
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

      {row.payload && (
        <button
          onClick={() => setShowJson((v) => !v)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          {showJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showJson ? 'Ocultar JSON' : 'Ver JSON (ML)'}
        </button>
      )}

      {showJson && row.payload && (
        <JsonPreview payload={row.payload} />
      )}
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

  function toggleRow(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  const exportableCount = rows.filter((r) => r.payload !== null).length;

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
        <div className="ml-auto flex gap-2">
          <button
            onClick={onReset}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Nueva carga
          </button>
          {exportableCount > 0 && (
            <button
              onClick={() => exportAllPayloads(rows)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Download size={14} />
              Exportar {exportableCount} JSON{exportableCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Row list */}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {rows.map((row) => {
          const isExpanded = expandedRows.has(row.rowIndex);
          const statusIcon =
            row.status === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> :
            row.status === 'warnings' ? <AlertTriangle size={15} className="text-amber-500 shrink-0" /> :
            <XCircle size={15} className="text-red-500 shrink-0" />;

          const rowBg =
            row.status === 'ok' ? 'bg-white hover:bg-gray-50' :
            row.status === 'warnings' ? 'bg-amber-50/40 hover:bg-amber-50' :
            'bg-red-50/40 hover:bg-red-50';

          return (
            <div key={row.rowIndex}>
              <button
                onClick={() => toggleRow(row.rowIndex)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  rowBg
                )}
              >
                {statusIcon}
                <span className="text-xs text-gray-400 font-mono w-6 shrink-0">#{row.rowIndex}</span>
                <span className="text-sm text-gray-800 font-medium flex-1 truncate">
                  {row.draft?.title || row.rawRow['descripcion_corta'] || '(sin título)'}
                </span>
                {row.missingFields.length > 0 && (
                  <span className="text-xs text-amber-600 shrink-0">
                    {row.missingFields.length} faltante{row.missingFields.length > 1 ? 's' : ''}
                  </span>
                )}
                {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
              </button>
              {isExpanded && <RowDetail row={row} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
