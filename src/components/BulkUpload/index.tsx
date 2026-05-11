'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, ClipboardPaste, Download, FileText, Loader2, SkipForward } from 'lucide-react';
import { cn } from '@/components/ui';
import { parseCsvText, type CsvRowResult } from '@/lib/csv/parser';
import { downloadCsvTemplate, CSV_COLUMNS } from '@/lib/csv/template';
import { buildMLPayload } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import type { Condition, ProductDraft } from '@/types';
import { BulkResults } from './BulkResults';

type InputTab = 'upload' | 'paste';

export function BulkUpload() {
  const [tab, setTab] = useState<InputTab>('upload');
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rows, setRows] = useState<CsvRowResult[]>([]);
  const [summary, setSummary] = useState<{ ok: number; warnings: number; errors: number } | null>(null);
  const [fileName, setFileName] = useState('');
  const [skipInvalid, setSkipInvalid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function processText(text: string, name = '') {
    setIsProcessing(true);
    setFileName(name);
    try {
      const parsed = await parseCsvText(text);
      const displayRows = skipInvalid ? parsed.rows.filter((r) => r.status !== 'error') : parsed.rows;
      setRows(displayRows);
      setSummary({
        ok: parsed.totalOk,
        warnings: parsed.totalWarnings,
        errors: skipInvalid ? 0 : parsed.totalErrors,
      });
    } finally {
      setIsProcessing(false);
    }
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      alert('Por favor subí un archivo .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => processText(String(e.target?.result ?? ''), file.name);
    reader.readAsText(file, 'utf-8');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handlePasteSubmit() {
    if (pasteText.trim()) processText(pasteText, 'pegado');
  }

  function reset() {
    setRows([]);
    setSummary(null);
    setPasteText('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Inline edit handler — updates a row's draft, rebuilds payload + validation
  const handleRowEdit = useCallback((rowIndex: number, changes: Partial<Pick<ProductDraft, 'title' | 'price' | 'stock' | 'condition' | 'brand' | 'model'>>) => {
    setRows((prev) => prev.map((row) => {
      if (row.rowIndex !== rowIndex || !row.draft) return row;
      const updatedDraft: ProductDraft = {
        ...row.draft,
        ...changes,
        ...(changes.condition !== undefined ? { condition: changes.condition as Condition } : {}),
      };
      const payload = buildMLPayload(updatedDraft);
      const validation = validateDraft(updatedDraft);
      return {
        ...row,
        draft: updatedDraft,
        payload,
        missingFields: validation.missingFields,
        errors: validation.fieldErrors.map((fe) => `${fe.label}: ${fe.message}`),
        status: validation.isReady ? 'ok' : validation.missingFields.length > 0 ? 'warnings' : 'error',
      };
    }));
  }, []);

  if (rows.length > 0 && summary) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <FileText size={14} />
          <span>{fileName || 'archivo CSV'}</span>
          <span className="text-gray-300">·</span>
          <span>{rows.length} producto{rows.length !== 1 ? 's' : ''} procesado{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <BulkResults
          rows={rows}
          totalOk={summary.ok}
          totalWarnings={summary.warnings}
          totalErrors={summary.errors}
          onReset={reset}
          onRowEdit={handleRowEdit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto py-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Carga masiva de productos</h2>
        <p className="text-gray-500">Subí un CSV o pegá los datos directamente. Procesamos todo automáticamente.</p>
      </div>

      {/* Template download */}
      <button
        onClick={downloadCsvTemplate}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-all font-medium"
      >
        <Download size={14} />
        Descargar plantilla CSV de ejemplo
      </button>

      {/* Options */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={skipInvalid}
          onChange={(e) => setSkipInvalid(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600"
        />
        <SkipForward size={14} className="text-gray-400" />
        Ignorar filas inválidas automáticamente
      </label>

      {/* Input tabs */}
      <div className="w-full">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          {([['upload', 'Subir archivo', <Upload key="u" size={14} />], ['paste', 'Pegar datos', <ClipboardPaste key="p" size={14} />]] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {tab === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'w-full border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all',
              isDragging
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
            )}
          >
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              isDragging ? 'bg-indigo-100' : 'bg-gray-100'
            )}>
              <Upload size={22} className={isDragging ? 'text-indigo-500' : 'text-gray-400'} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                {isDragging ? 'Soltá el archivo aquí' : 'Arrastrá tu CSV o hacé click para seleccionar'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Archivos .csv · codificación UTF-8</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {tab === 'paste' && (
          <div className="space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="titulo,descripcion_corta,marca,precio"
              rows={8}
              className={cn(
                'w-full px-4 py-3 text-sm font-mono rounded-xl border-2 border-gray-200',
                'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50',
                'resize-y text-gray-800 placeholder:text-gray-300 placeholder:font-sans bg-gray-50'
              )}
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim() || isProcessing}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all',
                'bg-indigo-600 hover:bg-indigo-700 text-white',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {isProcessing
                ? <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                : <><FileText size={16} /> Procesar datos</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Column reference */}
      <details className="w-full text-sm">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium select-none">
          Ver columnas disponibles
        </summary>
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Columna</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Requerida</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Ejemplo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CSV_COLUMNS.map((col) => (
                <tr key={col.key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-indigo-700">{col.header}</td>
                  <td className="px-3 py-2">{col.required ? <span className="text-red-500 font-semibold">Sí</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[180px]">{col.example || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 size={16} className="animate-spin" />
          Procesando productos...
        </div>
      )}
    </div>
  );
}
