'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, ClipboardPaste, Download, FileText, Loader2, SkipForward, FileSpreadsheet, ImagePlus, X } from 'lucide-react';
import { cn } from '@/components/ui';
import { parseCsvText, parseXlsxBuffer, type CsvRowResult } from '@/lib/csv/parser';
import { downloadCsvTemplate, downloadExcelTemplate, CSV_COLUMNS } from '@/lib/csv/template';
import { buildMLPayload } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import type { Condition, ProductDraft } from '@/types';
import { BulkResults } from './BulkResults';

type InputTab = 'upload' | 'paste';

function isXlsxFile(file: File): boolean {
  return (
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  );
}

function isCsvFile(file: File): boolean {
  return (
    file.name.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'text/plain'
  );
}

export function BulkUpload() {
  const [tab, setTab] = useState<InputTab>('upload');
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rows, setRows] = useState<CsvRowResult[]>([]);
  const [summary, setSummary] = useState<{ ok: number; warnings: number; errors: number } | null>(null);
  const [fileName, setFileName] = useState('');
  const [skipInvalid, setSkipInvalid] = useState(false);
  // Local image files uploaded alongside the Excel — keyed by filename (case-insensitive)
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFile(file: File) {
    if (isXlsxFile(file)) {
      setIsProcessing(true);
      setFileName(file.name);
      try {
        const buffer = await file.arrayBuffer();
        const { csv, embeddedImages } = await parseXlsxBuffer(buffer);

        // Auto-populate imageFiles from any images embedded in the "Imagenes" sheet
        if (embeddedImages.size > 0) {
          setImageFiles((prev) => {
            const next = new Map(prev);
            for (const [key, dataUrl] of embeddedImages) {
              const [header, b64] = dataUrl.split(',');
              const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              next.set(key, new File([bytes], key, { type: mime }));
            }
            return next;
          });
        }

        await processText(csv, file.name);
      } catch (err) {
        alert(`No se pudo leer el archivo Excel: ${err instanceof Error ? err.message : String(err)}`);
        setIsProcessing(false);
      }
      return;
    }

    if (!isCsvFile(file)) {
      alert('Subí un archivo .xlsx (Excel) o .csv');
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handlePasteSubmit() {
    if (pasteText.trim()) processText(pasteText, 'pegado');
  }

  /** Strip path prefix and lowercase — robust to fake browser paths like "C:\fakepath\photo.png" and Excel path prefixes like "images/photo.png" */
  function normalizeImageKey(name: string): string {
    return name.trim().replace(/^.*[/\\]/, '').toLowerCase();
  }

  function addImageFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const imageOnly = arr.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (imageOnly.length === 0) return;
    setImageFiles((prev) => {
      const next = new Map(prev);
      imageOnly.forEach((f) => next.set(normalizeImageKey(f.name), f));
      return next;
    });
  }

  function removeImageFile(filename: string) {
    setImageFiles((prev) => {
      const next = new Map(prev);
      next.delete(normalizeImageKey(filename));
      return next;
    });
  }

  function handleImageDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingImages(false);
    if (e.dataTransfer.files.length) addImageFiles(e.dataTransfer.files);
  }

  function handleImageInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addImageFiles(e.target.files);
    e.target.value = '';
  }

  function reset() {
    setRows([]);
    setSummary(null);
    setPasteText('');
    setFileName('');
    setImageFiles(new Map());
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
    // Count how many rows have local image refs that need matching
    const rowsWithLocalImages = rows.filter((r) => r.localImageRefs.length > 0);
    const allLocalRefs = [...new Set(rowsWithLocalImages.flatMap((r) => r.localImageRefs))];
    const missingRefs = allLocalRefs.filter((ref) => !imageFiles.has(normalizeImageKey(ref)));

    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
            ? <FileSpreadsheet size={14} className="text-emerald-600" />
            : <FileText size={14} />}
          <span>{fileName || 'archivo'}</span>
          <span className="text-gray-300">·</span>
          <span>{rows.length} producto{rows.length !== 1 ? 's' : ''} procesado{rows.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Image upload panel — only shown when Excel references local image filenames */}
        {allLocalRefs.length > 0 && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ImagePlus size={15} className="text-indigo-600 shrink-0" />
              <p className="text-sm font-semibold text-indigo-900">
                Tu Excel referencia {allLocalRefs.length} imagen{allLocalRefs.length !== 1 ? 's' : ''} local{allLocalRefs.length !== 1 ? 'es' : ''}
              </p>
              {missingRefs.length > 0 && (
                <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  {missingRefs.length} faltante{missingRefs.length !== 1 ? 's' : ''}
                </span>
              )}
              {missingRefs.length === 0 && (
                <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  Todas encontradas
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-700">
              Subí las imágenes que referencia tu Excel. Se subirán a Mercado Libre antes de publicar.
            </p>

            {/* Image drop zone */}
            <div
              onDragEnter={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
              onDragLeave={() => setIsDraggingImages(false)}
              onDrop={handleImageDrop}
              onClick={() => imageInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl py-4 flex items-center justify-center gap-2 cursor-pointer transition-all text-sm',
                isDraggingImages ? 'border-indigo-400 bg-indigo-100' : 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50/80'
              )}
            >
              <Upload size={14} className="text-indigo-400 shrink-0" />
              <span className="text-indigo-600 font-medium">
                {isDraggingImages ? 'Soltá las imágenes' : 'Arrastrá imágenes aquí o hacé click'}
              </span>
              <span className="text-indigo-400 text-xs">JPEG · PNG · WebP · max 5 MB</span>
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageInput} />
            </div>

            {/* Uploaded files list */}
            {imageFiles.size > 0 && (
              <div className="space-y-1">
                {allLocalRefs.map((ref) => {
                  const found = imageFiles.has(normalizeImageKey(ref));
                  return (
                    <div key={ref} className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs',
                      found ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'
                    )}>
                      <span className="font-mono flex-1 truncate">{ref}</span>
                      {found ? (
                        <>
                          <span className="text-emerald-600 font-medium shrink-0">Encontrada</span>
                          <button onClick={() => removeImageFile(ref)} className="text-gray-400 hover:text-gray-600 shrink-0 ml-1">
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <span className="text-red-600 font-medium shrink-0">No encontrada</span>
                      )}
                    </div>
                  );
                })}
                {/* Extra uploaded files not referenced in Excel */}
                {Array.from(imageFiles.keys())
                  .filter((k) => !allLocalRefs.map((r) => normalizeImageKey(r)).includes(k))
                  .map((k) => (
                    <div key={k} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 text-gray-500">
                      <span className="font-mono flex-1 truncate">{k}</span>
                      <span className="text-gray-400 shrink-0">No referenciada</span>
                      <button onClick={() => removeImageFile(k)} className="text-gray-400 hover:text-gray-600 shrink-0 ml-1">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Debug panel — shows raw upload vs Excel ref matching so the user can diagnose filename mismatches */}
        {(imageFiles.size > 0 || allLocalRefs.length > 0) && (
          <details className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-xs open:pb-3">
            <summary className="cursor-pointer select-none font-medium text-gray-500 hover:text-gray-700">
              Imágenes detectadas — {imageFiles.size} subida{imageFiles.size !== 1 ? 's' : ''}, {allLocalRefs.length - missingRefs.length}/{allLocalRefs.length} reconocida{allLocalRefs.length !== 1 ? 's' : ''}
            </summary>
            <div className="mt-3 space-y-3">
              {imageFiles.size > 0 && (
                <div>
                  <p className="font-semibold text-gray-600 mb-1">Archivos subidos (clave de búsqueda):</p>
                  <div className="space-y-0.5 pl-2">
                    {Array.from(imageFiles.keys()).map((k) => (
                      <p key={k} className="font-mono text-gray-700">{k}</p>
                    ))}
                  </div>
                </div>
              )}
              {allLocalRefs.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-600 mb-1">Referencias del Excel (clave normalizada → resultado):</p>
                  <div className="space-y-0.5 pl-2">
                    {allLocalRefs.map((ref) => {
                      const key = normalizeImageKey(ref);
                      const matched = imageFiles.has(key);
                      return (
                        <p key={ref} className={`font-mono ${matched ? 'text-emerald-700' : 'text-red-600'}`}>
                          {ref === key ? ref : `${ref} → ${key}`}
                          {' '}{matched ? '✓ coincide' : '✗ no encontrada'}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        <BulkResults
          rows={rows}
          totalOk={summary.ok}
          totalWarnings={summary.warnings}
          totalErrors={summary.errors}
          onReset={reset}
          onRowEdit={handleRowEdit}
          imageFiles={imageFiles}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto py-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Publicar en Mercado Libre</h2>
        <p className="text-gray-500 text-sm max-w-md">
          Subí tu Excel con los productos, corregí los errores que aparezcan y publicá
          directamente en Mercado Libre con un click.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
          <span className="bg-gray-100 rounded-full px-2.5 py-0.5">1. Subí tu Excel</span>
          <span>→</span>
          <span className="bg-gray-100 rounded-full px-2.5 py-0.5">2. Corregí errores</span>
          <span>→</span>
          <span className="bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-0.5 font-medium">3. Publicá en ML</span>
        </div>
      </div>

      {/* Template download buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={downloadExcelTemplate}
          className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-all font-medium"
        >
          <FileSpreadsheet size={14} />
          Descargar plantilla Excel (.xlsx)
        </button>
        <button
          onClick={downloadCsvTemplate}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-all font-medium"
        >
          <Download size={14} />
          Descargar plantilla CSV
        </button>
      </div>

      <p className="text-xs text-gray-400 -mt-3 text-center">
        Usá la plantilla como guía. Solo son obligatorias las columnas <strong>descripcion_corta</strong> y <strong>precio</strong>.
      </p>

      {/* Skip invalid option */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={skipInvalid}
          onChange={(e) => setSkipInvalid(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600"
        />
        <SkipForward size={14} className="text-gray-400" />
        Ignorar filas con errores automáticamente
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
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
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
                {isDragging ? 'Soltá el archivo aquí' : 'Arrastrá tu archivo o hacé click para seleccionar'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Excel (.xlsx) o CSV · UTF-8</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {tab === 'paste' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Pegá el contenido de tu planilla directamente (incluí la fila de encabezados). Columnas separadas por comas.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`titulo,descripcion_corta,marca,precio\n"Heladera Samsung 320L","heladera samsung no frost 320 litros blanca","Samsung","250000"`}
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
          Ver todas las columnas disponibles
        </summary>
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Columna</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Obligatoria</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Ejemplo</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 hidden sm:table-cell">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CSV_COLUMNS.map((col) => (
                <tr key={col.key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-indigo-700">{col.header}</td>
                  <td className="px-3 py-2">{col.required ? <span className="text-red-500 font-semibold">Sí</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{col.example || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 hidden sm:table-cell max-w-[220px] truncate" title={col.hint}>{col.hint}</td>
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
