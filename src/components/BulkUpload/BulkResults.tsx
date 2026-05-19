'use client';

import type { CsvRowResult } from '@/lib/csv/parser';
import { exportAllPayloads } from '@/lib/csv/parser';
import type { MLBulkPublishResult, MLPublishResult } from '@/lib/mercadolibre/types';
import type { ProductDraft } from '@/types';
import {
  CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown, ChevronRight,
  Send, FlaskConical, Loader2, Clock, Pencil, X, Check, ShieldOff, ExternalLink, Hash, SkipForward, Eye, ImageIcon,
} from 'lucide-react';
import type { PrepareItemResult } from '@/app/api/ml/prepare-publish/route';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { cn } from '@/components/ui';
import { JsonPreview } from '@/components/JsonPreview';

// ─── Image upload detail ─────────────────────────────────────────────────────

export interface ImageUploadDetail {
  filename: string;
  secureUrl?: string;
  error?: string;
  width?: number;
  height?: number;
}

/** Read PNG dimensions from a File object (client-side, no deps). Returns null for non-PNG or unreadable. */
async function readPngDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const buf = await file.arrayBuffer();
    if (buf.byteLength < 24) return null;
    const view = new DataView(buf);
    if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } catch {
    return null;
  }
}

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado',
};

/** Normalize an image ref or filename to a bare lowercase basename — strips path prefix and fake browser paths */
function normalizeImageKey(name: string): string {
  return name.trim().replace(/^.*[/\\]/, '').toLowerCase();
}

type PublishRowStatus = 'idle' | 'publishing' | 'published' | 'dry_run' | 'failed' | 'preflight_failed' | 'skipped_invalid';

interface RowPublishState {
  status: PublishRowStatus;
  message?: string;
  permalink?: string;
  itemId?: string;
  /** Raw ML API response — present for real publishes (success + failure) */
  mlResponse?: unknown;
  /** ML attributes still missing after enrichment + defaults */
  missingAttributes?: Array<{ id: string; name: string; conditionalRequired: boolean }>;
  /** Resolved ML category after enrichment */
  resolvedCategoryId?: string;
  resolvedCategoryPath?: string;
  usedFallbackCategory?: boolean;
  /** Post-publish item status from GET /items/{id} */
  mlItemStatus?: string;
  mlItemSubStatus?: string[];
  postPublishWarning?: string;
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

// ─── ML error cause list ─────────────────────────────────────────────────────

/** Extract ML attribute IDs from strings like "The attributes [GTIN, ENERGY_EFFICIENCY_CLASS] are required" */
function extractAttrIds(text: string): string[] {
  const match = text.match(/\[([A-Z0-9_,\s]+)\]/);
  if (!match) return [];
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/** Render a single cause item — handles nested cause arrays recursively */
function MLCauseItem({ cause, depth = 0 }: { cause: Record<string, unknown>; depth?: number }) {
  // Primary human-readable text — ML uses "message" OR "description" depending on API version
  const text = (cause.message ?? cause.description ?? '') as string;
  const causeId = (cause.id ?? cause.cause_id ?? '') as string;
  const code = cause.code as number | undefined;
  const type = cause.type as string | undefined;
  const department = cause.department as string | undefined;
  const references = cause.references as unknown[] | undefined;
  const nested = cause.cause as Record<string, unknown>[] | undefined;

  // Extract attribute IDs embedded in bracket notation
  const embeddedAttrs = text ? extractAttrIds(text) : [];

  return (
    <div className={cn(
      'rounded-lg border text-xs space-y-1.5 px-3 py-2',
      depth === 0 ? 'bg-red-50 border-red-200' : 'bg-red-100/60 border-red-300 ml-3'
    )}>
      {/* Primary text — show even if empty to make the card visible */}
      {text ? (
        <p className="text-red-800 font-medium leading-relaxed break-words">{text}</p>
      ) : causeId ? (
        <p className="text-red-700 font-mono">{causeId}</p>
      ) : null}

      {/* Extracted attribute IDs from message brackets */}
      {embeddedAttrs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-red-400 text-[10px] uppercase tracking-wide mr-1">Falta:</span>
          {embeddedAttrs.map((attr) => (
            <span key={attr} className="font-mono bg-red-200 text-red-900 rounded px-1.5 py-0.5 text-[11px] font-semibold">
              {attr}
            </span>
          ))}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-red-500 text-[11px]">
        {code !== undefined && <span><span className="text-red-400">Código:</span> {code}</span>}
        {causeId && text && <span><span className="text-red-400">ID:</span> <span className="font-mono">{causeId}</span></span>}
        {type && <span><span className="text-red-400">Tipo:</span> {type}</span>}
        {department && <span><span className="text-red-400">Área:</span> {department}</span>}
        {references && references.length > 0 && (
          <span><span className="text-red-400">Ref:</span> {JSON.stringify(references)}</span>
        )}
      </div>

      {/* Nested cause[] */}
      {nested && nested.length > 0 && (
        <div className="space-y-1 pt-1">
          {nested.map((nc, ni) => (
            <MLCauseItem key={ni} cause={nc} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function MLCauseList({ mlResponse }: { mlResponse: unknown }) {
  const body = mlResponse as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return null;

  // Top-level error fields
  const errorCode = body.error as string | undefined;
  const errorMsg  = body.message as string | undefined;
  const causes    = body.cause as Record<string, unknown>[] | undefined;

  const hasCauses = causes && causes.length > 0;
  if (!errorCode && !errorMsg && !hasCauses) return null;

  return (
    <div className="space-y-1.5">
      {/* Header + error code */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
          Error de Mercado Libre
        </p>
        {errorCode && (
          <span className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 break-all">
            {errorCode}
          </span>
        )}
      </div>

      {/* Top-level message when there are no cause items */}
      {errorMsg && errorMsg !== errorCode && !hasCauses && (
        <p className="text-xs text-red-700 leading-relaxed">{errorMsg}</p>
      )}

      {/* Cause items */}
      {hasCauses && (
        <div className="space-y-1.5">
          {causes.map((c, i) => (
            <MLCauseItem key={i} cause={c} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail view (publish state + ML errors + JSON) ──────────────────────────

interface RowDetailProps {
  row: CsvRowResult;
  publishState?: RowPublishState;
  mlImageUrls?: Map<string, string>;
  imageUploadErrors?: Map<string, string>;
  /** Local image files the user dragged in — keyed by filename (lowercase). Used to show match status. */
  imageFiles?: Map<string, File>;
  /** Result from /api/ml/prepare-publish — shows the actual final payload diff before publishing */
  prepareResult?: PrepareItemResult;
  /** Per-filename upload details: CDN URL, error, and dimensions — set after prepare runs */
  imageUploadDetails?: Map<string, ImageUploadDetail>;
}

function RowDetail({ row, publishState, mlImageUrls, imageUploadErrors, imageFiles, prepareResult, imageUploadDetails }: RowDetailProps) {
  const [showPayload, setShowPayload] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const hasMlResponse = publishState?.mlResponse != null;
  const hasCauses = (() => {
    const body = publishState?.mlResponse as Record<string, unknown> | undefined;
    return Array.isArray(body?.cause) && (body.cause as unknown[]).length > 0;
  })();

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
          {/* ML-critical attributes — visible so you can verify the Excel was read correctly */}
          <span className={row.draft.gtin ? 'text-gray-600' : 'text-amber-500'}>
            <span className="text-gray-400">GTIN:</span>{' '}
            {row.draft.gtin ?? <span className="italic">—</span>}
          </span>
          <span className={row.draft.height ? 'text-gray-600' : 'text-amber-500'}>
            <span className="text-gray-400">Alto:</span>{' '}
            {row.draft.height != null ? `${row.draft.height} cm` : <span className="italic">—</span>}
          </span>
          <span className={row.draft.width ? 'text-gray-600' : 'text-amber-500'}>
            <span className="text-gray-400">Ancho:</span>{' '}
            {row.draft.width != null ? `${row.draft.width} cm` : <span className="italic">—</span>}
          </span>
          <span className={row.draft.depth ? 'text-gray-600' : 'text-amber-500'}>
            <span className="text-gray-400">Prof.:</span>{' '}
            {row.draft.depth != null ? `${row.draft.depth} cm` : <span className="italic">—</span>}
          </span>
        </div>
      )}

      {/* Image status panel — shown when row has any image refs (embedded or local) */}
      {row.localImageRefs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <ImageIcon size={11} />
            Imágenes
            <span className="font-normal text-gray-300 ml-1">
              {row.localImageRefs.filter((r) => r.startsWith('__emb__')).length > 0 && '(embebidas en Excel)'}
            </span>
          </p>
          {row.localImageRefs.map((ref, idx) => {
            const key = ref.toLowerCase();
            const detail = imageUploadDetails?.get(key);
            const mlUrl = detail?.secureUrl ?? mlImageUrls?.get(key);
            const uploadError = detail?.error ?? imageUploadErrors?.get(ref);
            const isEmbedded = ref.startsWith('__emb__');
            const isMatched = imageFiles?.has(normalizeImageKey(ref));
            const dims = detail?.width && detail?.height ? `${detail.width}×${detail.height}` : null;
            const dimsOk = detail?.width != null && detail.width >= 500 && detail.height != null && detail.height >= 500;
            const displayName = isEmbedded ? `Imagen ${idx + 1}` : ref;

            return (
              <div key={ref} className={cn(
                'rounded-lg px-2.5 py-2 text-xs space-y-1',
                mlUrl ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                uploadError ? 'bg-red-50 border border-red-200 text-red-700' :
                isMatched || isEmbedded ? 'bg-indigo-50 border border-indigo-200 text-indigo-800' :
                'bg-red-50 border border-red-200 text-red-700'
              )}>
                <div className="flex items-center gap-2">
                  <span className="font-medium shrink-0">{displayName}</span>
                  {dims && (
                    <span className={cn(
                      'text-[10px] rounded px-1.5 py-0.5 font-mono shrink-0',
                      dimsOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {dims} px{!dimsOk && ' ⚠ min 500×500'}
                    </span>
                  )}
                  <div className="flex-1" />
                  {mlUrl ? (
                    <a href={mlUrl} target="_blank" rel="noreferrer" className="text-emerald-600 font-medium shrink-0 underline flex items-center gap-1">
                      <ExternalLink size={10} />ML CDN ✓
                    </a>
                  ) : uploadError ? (
                    <span className="text-red-600 font-medium shrink-0 flex items-center gap-1">
                      <XCircle size={10} />Error al subir
                    </span>
                  ) : isEmbedded || isMatched ? (
                    <span className="text-indigo-600 font-medium shrink-0 flex items-center gap-1">
                      <CheckCircle2 size={10} />Lista para subir
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium shrink-0 flex items-center gap-1">
                      <XCircle size={10} />Faltante
                    </span>
                  )}
                </div>
                {uploadError && (
                  <p className="text-red-700 text-[11px] leading-relaxed pl-0.5">{uploadError}</p>
                )}
                {mlUrl && (
                  <p className="font-mono text-[10px] text-emerald-600 truncate">{mlUrl}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Prepare diff panel — shown after "Preparar publicación" is clicked */}
      {prepareResult && !publishState?.resolvedCategoryPath && (
        <div className="space-y-2.5">
          {/* Blocking errors */}
          {prepareResult.blockingErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide flex items-center gap-1">
                <XCircle size={11} /> Bloqueado — no se puede publicar
              </p>
              {prepareResult.blockingErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 leading-relaxed">{e}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {prepareResult.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              {prepareResult.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          {/* Category diff */}
          <div className={cn(
            'rounded-lg px-3 py-2.5 space-y-1',
            prepareResult.categoryBefore !== prepareResult.categoryAfter
              ? 'bg-blue-50 border border-blue-100'
              : 'bg-gray-50 border border-gray-100'
          )}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Categoría ML</p>
            <div className="text-xs space-y-0.5">
              {prepareResult.categoryBefore !== prepareResult.categoryAfter && (
                <p>
                  <span className="text-gray-400">Antes:</span>{' '}
                  <span className="font-mono text-amber-700 line-through">{prepareResult.categoryBefore}</span>
                </p>
              )}
              <p>
                <span className="text-gray-400">Final:</span>{' '}
                <span className="font-mono text-blue-800 font-semibold">{prepareResult.categoryAfter}</span>
              </p>
              {prepareResult.categoryPath && (
                <p className="text-gray-600 text-[11px]">{prepareResult.categoryPath}</p>
              )}
            </div>
          </div>

          {/* Images after */}
          {prepareResult.imagesAfter.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Imágenes finales</p>
              {prepareResult.imagesAfter.map((url, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    url.startsWith('https://') ? 'bg-emerald-400' : 'bg-red-400'
                  )} />
                  <span className="font-mono truncate text-gray-600 flex-1">{url}</span>
                  {url.startsWith('https://') && (
                    <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 shrink-0"><ExternalLink size={10} /></a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Attribute diff */}
          {(prepareResult.removedAttributes.length > 0 || prepareResult.addedAttributes.length > 0) && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Atributos filtrados</p>
              {prepareResult.removedAttributes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Eliminados:</span>
                  {prepareResult.removedAttributes.map((id) => (
                    <span key={id} className="font-mono text-[11px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 line-through">{id}</span>
                  ))}
                </div>
              )}
              {prepareResult.addedAttributes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Agregados:</span>
                  {prepareResult.addedAttributes.map((id) => (
                    <span key={id} className="font-mono text-[11px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">{id}</span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[10px] text-gray-400 uppercase">Finales:</span>
                {prepareResult.attributesAfter.map((id) => (
                  <span key={id} className="font-mono text-[11px] bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">{id}</span>
                ))}
              </div>
            </div>
          )}

          {/* Ready badge */}
          {prepareResult.ready && (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium">
              <CheckCircle2 size={12} /> Listo para publicar — payload final verificado
            </div>
          )}
        </div>
      )}

      {/* Pre-publish info panel — shown before preparation and after publish */}
      {row.draft && !prepareResult && !publishState?.resolvedCategoryPath && (
        <div className="space-y-1.5 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Al publicar — el servidor hará estos cambios</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className="col-span-2">
              <span className="text-gray-400">Categoría:</span>{' '}
              {row.draft.officialCategoryId ? (
                <span className="text-emerald-700 font-mono">{row.draft.officialCategoryId}</span>
              ) : (
                <span className="text-red-600 font-medium italic">
                  ⚠ Categoría no validada — ejecutá &quot;Preparar publicación&quot; antes de publicar
                </span>
              )}
            </span>
            <span className={row.draft.gtin ? 'text-gray-700' : 'text-amber-600'}>
              <span className="text-gray-400">GTIN:</span>{' '}
              {row.draft.gtin ?? <span className="italic">— faltante</span>}
            </span>
            <span className={row.draft.height ? 'text-gray-700' : 'text-gray-400'}>
              <span className="text-gray-400">Alto:</span>{' '}
              {row.draft.height != null ? `${row.draft.height} cm` : <span className="italic">—</span>}
            </span>
            <span className={row.draft.width ? 'text-gray-700' : 'text-gray-400'}>
              <span className="text-gray-400">Ancho:</span>{' '}
              {row.draft.width != null ? `${row.draft.width} cm` : <span className="italic">—</span>}
            </span>
            <span className={row.draft.depth ? 'text-gray-700' : 'text-gray-400'}>
              <span className="text-gray-400">Prof.:</span>{' '}
              {row.draft.depth != null ? `${row.draft.depth} cm` : <span className="italic">—</span>}
            </span>
            <span className="col-span-2">
              <span className="text-gray-400">Imágenes:</span>{' '}
              {row.localImageRefs.length > 0 && row.localImageRefs.every((r) => r.startsWith('__emb__')) ? (
                <span className="text-emerald-700">
                  Imágenes embebidas: {row.localImageRefs.length} detectada{row.localImageRefs.length !== 1 ? 's' : ''} ✓
                </span>
              ) : row.localImageRefs.length > 0 ? (
                <>
                  {row.localImageRefs.filter((r) => imageFiles?.has(normalizeImageKey(r))).length}/{row.localImageRefs.length} listas para subir a ML CDN
                  {row.localImageRefs.some((r) => !imageFiles?.has(normalizeImageKey(r))) && (
                    <span className="ml-1 text-red-500">— arrastrá los archivos faltantes</span>
                  )}
                </>
              ) : (row.draft.images ?? []).length > 0 ? (
                <span className="text-emerald-700">{(row.draft.images ?? []).length} URL{(row.draft.images ?? []).length !== 1 ? 's' : ''} HTTPS ✓</span>
              ) : (
                <span className="text-red-500 italic">— sin imágenes</span>
              )}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-1.5 mt-1">
            <p className="text-[11px] text-gray-500">
              Los atributos genéricos (CAPACITY, COOLING_TYPE) serán filtrados y reemplazados por los que la categoría resuelta soporte.
            </p>
          </div>
        </div>
      )}

      {/* Resolved category — shown after publish (or when preflight_failed due to category) */}
      {publishState?.resolvedCategoryPath && (
        <div className={cn(
          'text-xs rounded-lg px-3 py-2 space-y-0.5',
          publishState.usedFallbackCategory ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-blue-50 border border-blue-100 text-blue-800'
        )}>
          <p className="font-semibold text-[11px] uppercase tracking-wide opacity-60">Categoría ML resuelta</p>
          <p className="font-mono text-[11px]">{publishState.resolvedCategoryId}</p>
          <p>{publishState.resolvedCategoryPath}</p>
          {publishState.usedFallbackCategory && (
            <p className="text-amber-700 text-[11px] italic">Categoría de respaldo — especificá categoria_ml para mayor precisión.</p>
          )}
        </div>
      )}

      {/* Post-publish warning — item was accepted but ML closed it immediately */}
      {publishState?.postPublishWarning && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="font-semibold">Publicado, pero Mercado Libre lo finalizó</p>
            <p className="mt-0.5 leading-relaxed">{publishState.postPublishWarning}</p>
            {publishState.mlItemSubStatus && publishState.mlItemSubStatus.length > 0 && (
              <p className="mt-1 font-mono text-[11px] text-red-600">sub_status: {publishState.mlItemSubStatus.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* Publish status badge */}
      {publishState && publishState.status !== 'idle' && (
        <div className={cn(
          'text-xs rounded-lg px-3 py-2 space-y-1',
          publishState.postPublishWarning ? 'bg-red-50 text-red-700' :
          publishState.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
          publishState.status === 'dry_run' ? 'bg-amber-50 text-amber-700' :
          publishState.status === 'preflight_failed' ? 'bg-orange-50 text-orange-700' :
          publishState.status === 'skipped_invalid' ? 'bg-gray-50 text-gray-500' :
          publishState.status === 'failed' ? 'bg-red-50 text-red-700' :
          'bg-gray-50 text-gray-600'
        )}>
          <div className="flex items-center gap-2">
            {publishState.status === 'publishing' && <Loader2 size={12} className="animate-spin" />}
            {publishState.status === 'published' && !publishState.postPublishWarning && <CheckCircle2 size={12} />}
            {publishState.status === 'published' && publishState.postPublishWarning && <AlertTriangle size={12} />}
            {publishState.status === 'dry_run' && <FlaskConical size={12} />}
            {publishState.status === 'failed' && <XCircle size={12} />}
            {publishState.status === 'preflight_failed' && <ShieldOff size={12} />}
            {publishState.status === 'skipped_invalid' && <SkipForward size={12} />}
            <span>{publishState.message}</span>
          </div>
          {publishState.itemId && (
            <div className="flex items-center gap-1 pl-4">
              <Hash size={10} className="opacity-60" />
              <span className="font-mono">{publishState.itemId}</span>
            </div>
          )}
          {publishState.permalink && (
            <a href={publishState.permalink} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 pl-4 underline font-medium">
              <ExternalLink size={10} />Ver en Mercado Libre
            </a>
          )}
        </div>
      )}

      {/* ML error causes — shown for failed rows */}
      {(publishState?.status === 'failed' || publishState?.status === 'preflight_failed') && hasMlResponse && (
        <MLCauseList mlResponse={publishState.mlResponse} />
      )}

      {/* Missing ML attributes — shown when enrichment detected gaps */}
      {publishState?.missingAttributes && publishState.missingAttributes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
            Atributos ML faltantes
          </p>
          <div className="space-y-1">
            {publishState.missingAttributes.map((attr) => (
              <div
                key={attr.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs',
                  attr.conditionalRequired
                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                )}
              >
                <span className="font-mono font-semibold shrink-0">{attr.id}</span>
                <span className="text-gray-500">·</span>
                <span>{attr.name}</span>
                <span className={cn(
                  'ml-auto shrink-0 text-[10px] rounded px-1.5 py-0.5 font-medium',
                  attr.conditionalRequired
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {attr.conditionalRequired ? 'condicional' : 'obligatorio'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable sections */}
      <div className="space-y-1.5">
        {/* Payload JSON — pre-enrichment (initial state before server processes it) */}
        {row.payload && (
          <div>
            <button
              onClick={() => setShowPayload((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              {showPayload ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showPayload ? 'Ocultar payload inicial' : 'Ver payload inicial (pre-publicación)'}
            </button>
            {showPayload && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
                  Este payload es el estado <strong>inicial</strong> — antes de que el servidor lo procese. Al publicar, el servidor resolverá la categoría ML real, filtrará los atributos no soportados, y reemplazará las imágenes locales por URLs de ML CDN.
                </p>
                <JsonPreview payload={row.payload} />
              </div>
            )}
          </div>
        )}

        {/* Raw ML response — only present after a real publish attempt */}
        {hasMlResponse && (
          <div>
            <button
              onClick={() => setShowRawResponse((v) => !v)}
              className={cn(
                'text-xs font-medium flex items-center gap-1',
                hasCauses
                  ? 'text-red-600 hover:text-red-800'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {showRawResponse ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showRawResponse ? 'Ocultar respuesta ML' : 'Ver respuesta completa de Mercado Libre'}
            </button>
            {showRawResponse && (
              <div className="mt-2">
                <JsonPreview payload={publishState!.mlResponse as object} />
              </div>
            )}
          </div>
        )}
      </div>
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
  /** Local image files uploaded by the user alongside the Excel — keyed by filename (lowercase) */
  imageFiles?: Map<string, File>;
}

interface BulkPublishSummary {
  attempted: number;
  published: number;
  dryRun: number;
  failed: number;
  skipped: number;
  preflightFailed: number;
}

export function BulkResults({ rows, totalOk, totalWarnings, totalErrors, onReset, onRowEdit, imageFiles }: BulkResultsProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<number>>(new Set());
  const [publishStates, setPublishStates] = useState<Map<number, RowPublishState>>(new Map());
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [mlDryRun, setMlDryRun] = useState(false);
  const [mlConnected, setMlConnected] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [realConfirmed, setRealConfirmed] = useState(false);
  const [publishSummary, setPublishSummary] = useState<BulkPublishSummary | null>(null);
  // ML CDN URLs resolved during pre-publish image upload — keyed by original filename (lowercase)
  const [mlImageUrls, setMlImageUrls] = useState<Map<string, string>>(new Map());
  const [imageUploadErrors, setImageUploadErrors] = useState<Map<string, string>>(new Map());
  // Prepare-publish state — stores per-row enrichment diff from /api/ml/prepare-publish
  const [prepareResults, setPrepareResults] = useState<Map<number, PrepareItemResult>>(new Map());
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  // Per-filename (lowercase) upload details: CDN URL, error, dimensions
  const [imageUploadDetails, setImageUploadDetails] = useState<Map<string, ImageUploadDetail>>(new Map());

  useEffect(() => {
    fetch('/api/ml/status')
      .then((r) => r.json())
      .then((s) => {
        setMlDryRun(s.dryRun ?? false);
        setMlConnected(s.connected ?? false);
      })
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

  // Publish error rows are skipped; warning rows (missing optional fields) are included
  const publishableRows = rows.filter((r) => r.status !== 'error' && r.payload !== null);
  const exportableCount = rows.filter((r) => r.payload !== null).length;

  // Detect if any publishable row needs local image files that haven't been uploaded yet
  const missingImageFiles = !mlDryRun ? (() => {
    const missing: string[] = [];
    publishableRows.forEach((r) => {
      r.localImageRefs.forEach((ref) => {
        if (!imageFiles?.has(normalizeImageKey(ref)) && !mlImageUrls.has(normalizeImageKey(ref))) {
          if (!missing.includes(ref)) missing.push(ref);
        }
      });
    });
    return missing;
  })() : [];

  async function handleBulkPublish() {
    setShowBulkConfirm(false);
    setRealConfirmed(false);
    setIsBulkPublishing(true);
    setPublishSummary(null);
    setImageUploadErrors(new Map());

    // ── Step 1: Upload local image files to ML CDN (if any) ───────────────────
    // Collect all unique local filenames across publishable rows
    const localFilesToUpload = new Set<string>();
    publishableRows.forEach((r) => {
      r.localImageRefs.forEach((ref) => localFilesToUpload.add(ref));
    });

    const currentMlImageUrls = new Map(mlImageUrls);
    const currentImageErrors = new Map<string, string>();

    if (localFilesToUpload.size > 0 && imageFiles && imageFiles.size > 0) {
      setPublishStates((prev) => {
        const next = new Map(prev);
        publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'publishing', message: 'Subiendo imágenes a Mercado Libre...' }));
        return next;
      });

      const formData = new FormData();
      let hasFiles = false;
      for (const filename of localFilesToUpload) {
        if (currentMlImageUrls.has(normalizeImageKey(filename))) continue;
        const file = imageFiles.get(normalizeImageKey(filename));
        if (file) {
          formData.append('files', file, file.name);
          hasFiles = true;
        } else {
          currentImageErrors.set(filename, `Imagen no encontrada: ${filename}`);
        }
      }

      if (hasFiles) {
        try {
          const uploadRes = await fetch('/api/ml/upload-pictures', { method: 'POST', body: formData });
          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({})) as { error?: string };
            const msg = `Error al subir imágenes (${uploadRes.status}): ${errBody.error ?? 'Error del servidor'}`;
            setPublishStates((prev) => {
              const next = new Map(prev);
              publishableRows.filter((r) => r.localImageRefs.length > 0).forEach((r) =>
                next.set(r.rowIndex, { status: 'failed', message: msg })
              );
              return next;
            });
            setIsBulkPublishing(false);
            return;
          }
          const uploadData = await uploadRes.json() as {
            uploads: Array<{ filename: string; secureUrl: string }>;
            errors: Array<{ filename: string; error: string }>;
          };
          uploadData.uploads.forEach(({ filename, secureUrl }) => {
            currentMlImageUrls.set(filename.toLowerCase(), secureUrl);
          });
          uploadData.errors.forEach(({ filename, error }) => {
            currentImageErrors.set(filename, error);
          });
          setMlImageUrls(new Map(currentMlImageUrls));

          // If any image failed, mark those rows as failed
          if (uploadData.errors.length > 0) {
            setPublishStates((prev) => {
              const next = new Map(prev);
              publishableRows.forEach((r) => {
                const hasFailedImage = r.localImageRefs.some((ref) => currentImageErrors.has(ref));
                if (hasFailedImage) {
                  const errList = r.localImageRefs
                    .filter((ref) => currentImageErrors.has(ref))
                    .map((ref) => `${ref}: ${currentImageErrors.get(ref)}`)
                    .join('; ');
                  next.set(r.rowIndex, { status: 'failed', message: `Error subiendo imagen: ${errList}` });
                }
              });
              return next;
            });
          }
        } catch (err) {
          const msg = `Error subiendo imágenes: ${err instanceof Error ? err.message : 'Error de red'}`;
          setPublishStates((prev) => {
            const next = new Map(prev);
            publishableRows.filter((r) => r.localImageRefs.length > 0).forEach((r) =>
              next.set(r.rowIndex, { status: 'failed', message: msg })
            );
            return next;
          });
          setImageUploadErrors(currentImageErrors);
          setIsBulkPublishing(false);
          return;
        }
      }
      setImageUploadErrors(currentImageErrors);
    }

    // If prepare was run: skip rows with blocking errors and use prepared payloads for ready rows
    if (prepareResults.size > 0) {
      const preSkippedStates = new Map<number, RowPublishState>();
      publishableRows.forEach((r) => {
        const pr = prepareResults.get(r.rowIndex);
        if (pr && !pr.ready) {
          preSkippedStates.set(r.rowIndex, {
            status: 'skipped_invalid',
            message: pr.blockingErrors.join('; ') || 'Bloqueado en preparación',
          });
        } else {
          preSkippedStates.set(r.rowIndex, { status: 'publishing', message: 'Publicando...' });
        }
      });
      setPublishStates(preSkippedStates);
    } else {
      // Mark remaining publishable rows as "publishing"
      setPublishStates((prev) => {
        const next = new Map(prev);
        publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'publishing', message: 'Publicando...' }));
        return next;
      });
    }

    try {
      // Build items — use prepared finalPayload when available, else substitute CDN URLs
      const itemsRaw = publishableRows.map((r) => {
        const prepResult = prepareResults.get(r.rowIndex);

        // Skip rows blocked in prepare
        if (prepResult && !prepResult.ready) return null;

        // Use enriched final payload from prepare — skip server-side enrichment
        if (prepResult?.ready) {
          return {
            payload: prepResult.finalPayload,
            rowIndex: r.rowIndex,
            officialCategoryId: r.draft?.officialCategoryId,
            applianceType: r.draft?.applianceType,
            alreadyEnriched: true,
          };
        }

        // Fallback: substitute local image filenames with ML CDN URLs
        let payload = r.payload!;
        if (r.localImageRefs.length > 0 && payload.pictures) {
          const updatedPictures = payload.pictures.map((pic) => {
            const key = pic.source.toLowerCase();
            const isLocal = !pic.source.startsWith('http');
            if (isLocal) {
              const mlUrl = currentMlImageUrls.get(key);
              return mlUrl ? { source: mlUrl } : pic;
            }
            return pic;
          });
          payload = { ...payload, pictures: updatedPictures };
        }
        return {
          payload,
          rowIndex: r.rowIndex,
          officialCategoryId: r.draft?.officialCategoryId,
          applianceType: r.draft?.applianceType,
        };
      });
      const items = itemsRaw.filter(Boolean);
      const res = await fetch('/api/ml/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      // Always parse JSON — even non-2xx responses have useful bodies
      let data: MLBulkPublishResult | null = null;
      try {
        data = await res.json() as MLBulkPublishResult;
      } catch {
        // JSON parse failed — mark all as failed
        setPublishStates((prev) => {
          const next = new Map(prev);
          publishableRows.forEach((r) =>
            next.set(r.rowIndex, { status: 'failed', message: `Error del servidor (${res.status})` })
          );
          return next;
        });
        return;
      }

      // Handle top-level API errors (401, 503, etc.) that have no per-item results
      if (!res.ok && (!data.results || data.results.length === 0)) {
        const errMsg = (data as unknown as { error?: string }).error ?? `Error del servidor (${res.status})`;
        setPublishStates((prev) => {
          const next = new Map(prev);
          publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'failed', message: errMsg }));
          return next;
        });
        return;
      }

      // Apply per-item results
      const newStates = new Map<number, RowPublishState>();
      data.results.forEach((r: MLPublishResult) => {
        if (r.rowIndex === undefined) return;
        const status: PublishRowStatus =
          r.status === 'published' ? 'published' :
          r.status === 'dry_run' ? 'dry_run' :
          r.status === 'preflight_failed' ? 'preflight_failed' :
          r.status === 'skipped_invalid' ? 'skipped_invalid' :
          'failed';
        newStates.set(r.rowIndex, {
          status,
          message: r.message,
          permalink: r.permalink,
          itemId: r.itemId,
          mlResponse: r.mlResponse,
          missingAttributes: r.missingAttributes,
          resolvedCategoryId: r.resolvedCategoryId,
          resolvedCategoryPath: r.resolvedCategoryPath,
          usedFallbackCategory: r.usedFallbackCategory,
          mlItemStatus: r.mlItemStatus,
          mlItemSubStatus: r.mlItemSubStatus,
          postPublishWarning: r.postPublishWarning,
        });
      });
      setPublishStates(newStates);

      // Build summary
      const resultsList = data.results;
      setPublishSummary({
        attempted: resultsList.length,
        published: resultsList.filter((r) => r.status === 'published').length,
        dryRun: resultsList.filter((r) => r.status === 'dry_run').length,
        failed: resultsList.filter((r) => r.status === 'failed').length,
        skipped: resultsList.filter((r) => r.status === 'skipped_invalid').length,
        preflightFailed: resultsList.filter((r) => r.status === 'preflight_failed').length,
      });

    } catch (err) {
      // Network error
      const msg = err instanceof Error ? err.message : 'Error de red';
      setPublishStates((prev) => {
        const next = new Map(prev);
        publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'failed', message: msg }));
        return next;
      });
    } finally {
      setIsBulkPublishing(false);
    }
  }

  async function handlePrepare() {
    setPrepareError(null);
    setIsPreparing(true);
    setPrepareResults(new Map());
    setImageUploadDetails(new Map());

    // ── Step 1: Upload all local/embedded image files to ML CDN ──────────────
    const localFilesToUpload = new Set<string>();
    publishableRows.forEach((r) => r.localImageRefs.forEach((ref) => localFilesToUpload.add(ref)));

    const currentMlImageUrls = new Map(mlImageUrls);
    const newUploadDetails = new Map<string, ImageUploadDetail>();

    if (localFilesToUpload.size > 0 && imageFiles && imageFiles.size > 0) {
      // Read dimensions for all local files async before uploading
      const dimReads: Promise<void>[] = [];
      for (const filename of localFilesToUpload) {
        const key = normalizeImageKey(filename);
        if (currentMlImageUrls.has(key)) continue;
        const file = imageFiles.get(key);
        if (file) {
          dimReads.push(
            readPngDimensions(file).then((dims) => {
              newUploadDetails.set(key, { filename, ...(dims ?? {}) });
            })
          );
        }
      }
      await Promise.all(dimReads);

      const formData = new FormData();
      let hasFiles = false;
      for (const filename of localFilesToUpload) {
        const key = normalizeImageKey(filename);
        if (currentMlImageUrls.has(key)) continue;
        const file = imageFiles.get(key);
        if (file) { formData.append('files', file, file.name); hasFiles = true; }
      }

      if (hasFiles) {
        try {
          const uploadRes = await fetch('/api/ml/upload-pictures', { method: 'POST', body: formData });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({})) as { error?: string };
            const msg = err.error ?? `Error del servidor (${uploadRes.status})`;
            setImageUploadDetails(new Map(newUploadDetails));
            setPrepareError(`Error al subir imágenes a Mercado Libre CDN: ${msg}. Verificá la conexión ML en Configuración → Mercado Libre.`);
            setIsPreparing(false);
            return;
          }
          const uploadData = await uploadRes.json() as {
            uploads: Array<{ filename: string; secureUrl: string }>;
            errors: Array<{ filename: string; error: string }>;
          };

          for (const { filename, secureUrl } of uploadData.uploads) {
            const key = filename.toLowerCase();
            currentMlImageUrls.set(key, secureUrl);
            newUploadDetails.set(key, { ...(newUploadDetails.get(key) ?? { filename }), secureUrl });
          }
          for (const { filename, error } of uploadData.errors) {
            const key = filename.toLowerCase();
            newUploadDetails.set(key, { ...(newUploadDetails.get(key) ?? { filename }), error });
          }

          setImageUploadDetails(new Map(newUploadDetails));
          setMlImageUrls(new Map(currentMlImageUrls));

          // Block prepare if any required image failed to upload
          if (uploadData.errors.length > 0) {
            const failedLines = uploadData.errors.map(({ filename, error }) => `• ${filename}: ${error}`).join('\n');
            setPrepareError(
              `No se ${uploadData.errors.length === 1 ? 'pudo subir 1 imagen' : `pudieron subir ${uploadData.errors.length} imágenes`} a Mercado Libre CDN:\n${failedLines}\n\nMercado Libre debe poder acceder a las imágenes como URLs HTTPS públicas.`
            );
            setIsPreparing(false);
            return;
          }
        } catch (err) {
          setImageUploadDetails(new Map(newUploadDetails));
          setPrepareError(`Error subiendo imágenes: ${err instanceof Error ? err.message : 'Error de red'}`);
          setIsPreparing(false);
          return;
        }
      }
    }

    // ── Step 2: Build items with CDN URLs substituted ─────────────────────────
    const items = publishableRows.map((r) => {
      let payload = r.payload!;
      if (r.localImageRefs.length > 0 && payload.pictures) {
        const updatedPictures = payload.pictures.map((pic) => {
          if (!pic.source.startsWith('http')) {
            const mlUrl = currentMlImageUrls.get(pic.source.toLowerCase());
            return mlUrl ? { source: mlUrl } : pic;
          }
          return pic;
        });
        payload = { ...payload, pictures: updatedPictures };
      }
      return {
        payload,
        rowIndex: r.rowIndex,
        officialCategoryId: r.draft?.officialCategoryId,
        applianceType: r.draft?.applianceType,
      };
    });

    // ── Step 3: Call prepare-publish ──────────────────────────────────────────
    try {
      const res = await fetch('/api/ml/prepare-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setPrepareError(err.error ?? `Error del servidor (${res.status})`);
        setIsPreparing(false);
        return;
      }
      const data = await res.json() as { results: PrepareItemResult[] };
      const newResults = new Map<number, PrepareItemResult>();
      data.results.forEach((result) => {
        if (result.rowIndex !== undefined) newResults.set(result.rowIndex, result);
      });
      setPrepareResults(newResults);
      // Auto-expand all rows so the user sees the diff
      setExpandedRows(new Set(publishableRows.map((r) => r.rowIndex)));
    } catch (err) {
      setPrepareError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setIsPreparing(false);
    }
  }

  const publishedCount = Array.from(publishStates.values()).filter((s) => s.status === 'published').length;
  const dryRunCount = Array.from(publishStates.values()).filter((s) => s.status === 'dry_run').length;
  const failedCount = Array.from(publishStates.values()).filter((s) => s.status === 'failed').length;
  const skippedCount = Array.from(publishStates.values()).filter((s) =>
    s.status === 'preflight_failed' || s.status === 'skipped_invalid'
  ).length;
  const hasPublishResults = publishStates.size > 0 && !isBulkPublishing;

  return (
    <div className="space-y-4">

      {/* Prepare error banner */}
      {prepareError && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <XCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
          <p><span className="font-semibold">Error al preparar:</span> {prepareError}</p>
        </div>
      )}

      {/* Modo prueba banner — only shown in dev/test mode */}
      {mlDryRun && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <FlaskConical size={15} className="shrink-0 mt-0.5 text-amber-600" />
          <p>
            <span className="font-semibold">Modo prueba activo.</span>{' '}
            Los productos no se publicarán en Mercado Libre. Para publicar de verdad,
            desactivá el modo prueba en{' '}
            <a href="/settings/mercadolibre" className="underline hover:text-amber-900">Configuración → Mercado Libre</a>.
          </p>
        </div>
      )}

      {/* Prepare-required warning — shown in real mode before prepare is run */}
      {!mlDryRun && prepareResults.size === 0 && publishableRows.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-600" />
          <div>
            <span className="font-semibold">Preparar publicación es obligatorio antes de publicar.</span>{' '}
            Las categorías de Mercado Libre deben resolverse y validarse primero.
            Sin este paso, ML puede finalizar los anuncios por &quot;categoría incorrecta&quot; inmediatamente.
            Hacé click en <strong>Preparar publicación</strong> para validar las categorías y los atributos.
          </div>
        </div>
      )}

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

        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={onReset}
            disabled={isBulkPublishing || isPreparing}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            Nueva carga
          </button>
          {exportableCount > 0 && (
            <button
              onClick={() => exportAllPayloads(rows)}
              disabled={isBulkPublishing || isPreparing}
              className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Exportar JSON
            </button>
          )}
          {publishableRows.length > 0 && !mlDryRun && (
            <button
              onClick={handlePrepare}
              disabled={isPreparing || isBulkPublishing}
              title="Ejecuta la pipeline completa (sin publicar) y muestra el payload final que se enviará a ML"
              className={cn(
                'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border disabled:opacity-50',
                prepareResults.size > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              )}
            >
              {isPreparing
                ? <><Loader2 size={14} className="animate-spin" /> Preparando...</>
                : prepareResults.size > 0
                ? <><CheckCircle2 size={14} /> Preparado</>
                : <><Eye size={14} /> Preparar publicación</>
              }
            </button>
          )}
          {/* In real mode, require prepare-publish before allowing publish.
              Publish without category validation causes ML to finalize listings immediately. */}
          {!mlDryRun && prepareResults.size === 0 && publishableRows.length > 0 ? (
            <button
              disabled
              title="Ejecutá 'Preparar publicación' primero para validar las categorías ML"
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg bg-gray-200 text-gray-500 cursor-not-allowed opacity-80"
            >
              <Send size={14} /> Publicar {publishableRows.length} en Mercado Libre
            </button>
          ) : (
          <button
            onClick={() => publishableRows.length > 0 && setShowBulkConfirm(true)}
            disabled={isBulkPublishing || isPreparing || publishableRows.length === 0}
            title={publishableRows.length === 0 ? 'Corregí los errores en las filas antes de publicar' : undefined}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-all bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBulkPublishing
              ? <><Loader2 size={14} className="animate-spin" /> Publicando...</>
              : publishableRows.length === 0
              ? <><Send size={14} /> Sin productos válidos para publicar</>
              : mlDryRun
              ? <><FlaskConical size={14} /> Simular {publishableRows.length} — modo prueba</>
              : prepareResults.size > 0
              ? <><Send size={14} /> Publicar {publishableRows.filter((r) => prepareResults.get(r.rowIndex)?.ready !== false).length} payloads preparados</>
              : <><Send size={14} /> Publicar {publishableRows.length} en Mercado Libre</>
            }
          </button>
          )}
        </div>
      </div>

      {/* Post-publish summary panel */}
      {hasPublishResults && publishSummary && (
        <div className={cn(
          'rounded-xl border p-4 space-y-3',
          publishSummary.failed > 0 || publishSummary.preflightFailed > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
        )}>
          <p className={cn('text-sm font-bold',
            publishSummary.failed > 0 || publishSummary.preflightFailed > 0
              ? 'text-amber-800'
              : 'text-emerald-800'
          )}>
            {mlDryRun ? 'Simulación completada (modo prueba)' : 'Publicación completada'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {(publishSummary.published + publishSummary.dryRun) > 0 && (
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">
                  {publishSummary.published + publishSummary.dryRun}
                </p>
                <p className="text-gray-600">{mlDryRun ? 'simulados' : 'publicados'}</p>
              </div>
            )}
            {publishSummary.failed > 0 && (
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-2xl font-bold text-red-600">{publishSummary.failed}</p>
                <p className="text-gray-600">con error</p>
              </div>
            )}
            {publishSummary.preflightFailed > 0 && (
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-2xl font-bold text-orange-600">{publishSummary.preflightFailed}</p>
                <p className="text-gray-600">requieren corrección</p>
              </div>
            )}
            {publishSummary.skipped > 0 && (
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-2xl font-bold text-gray-500">{publishSummary.skipped}</p>
                <p className="text-gray-600">omitidos</p>
              </div>
            )}
          </div>
          {!mlDryRun && publishSummary.published > 0 && (
            <p className="text-xs text-emerald-700">
              ✓ Los productos ya están visibles en Mercado Libre. Revisá cada fila para ver el link directo.
            </p>
          )}
        </div>
      )}

      {/* Inline publish status badges (when publishing is in progress) */}
      {(publishedCount > 0 || dryRunCount > 0 || failedCount > 0 || skippedCount > 0) && !publishSummary && (
        <div className="flex flex-wrap gap-2">
          {(publishedCount + dryRunCount) > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <CheckCircle2 size={12} />
              <span className="font-semibold">{publishedCount + dryRunCount}</span>
              {mlDryRun ? 'simulados' : 'publicados'}
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
              <XCircle size={12} />
              <span className="font-semibold">{failedCount}</span> fallidos
            </div>
          )}
          {skippedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">
              <SkipForward size={12} />
              <span className="font-semibold">{skippedCount}</span> ignorados
            </div>
          )}
        </div>
      )}

      {/* Bulk confirm modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-5 p-6">
            <h2 className="font-bold text-gray-900 text-lg">
              {mlDryRun ? 'Confirmar simulación' : 'Publicar en Mercado Libre'}
            </h2>

            {/* Modo prueba notice — only shown in dev mode */}
            {mlDryRun && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                <FlaskConical size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-800">
                  <span className="font-semibold">Modo prueba activo.</span>{' '}
                  No se publicará nada real en Mercado Libre.
                </p>
              </div>
            )}

            {/* Missing image files — hard block */}
            {missingImageFiles.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Imágenes locales no encontradas</p>
                    <p className="text-xs text-red-700 mt-1">
                      El Excel referencia archivos de imagen locales que no fueron subidos. Arrastrá los archivos de imagen junto con el Excel para continuar.
                    </p>
                  </div>
                </div>
                <div className="space-y-1 pl-6">
                  {missingImageFiles.map((f) => (
                    <p key={f} className="text-xs font-mono text-red-700 bg-red-100 rounded px-2 py-0.5">{f}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Productos a publicar</span>
                <span className="font-bold text-gray-900">{publishableRows.length}</span>
              </div>
              {rows.filter((r) => r.status === 'ok').length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Listos</span>
                  <span className="font-semibold text-emerald-700">{rows.filter((r) => r.status === 'ok').length}</span>
                </div>
              )}
              {rows.filter((r) => r.status === 'warnings').length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Con campos faltantes (se publican igual)</span>
                  <span className="font-semibold text-amber-600">{rows.filter((r) => r.status === 'warnings').length}</span>
                </div>
              )}
              {totalErrors > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Con errores (se omiten)</span>
                  <span className="font-semibold text-red-500">{totalErrors}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-1 flex justify-between items-center">
                <span className="text-gray-500">Cuenta ML</span>
                {mlConnected
                  ? <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Conectada</span>
                  : <span className="text-red-500 font-medium">No conectada</span>
                }
              </div>
            </div>

            {/* Confirmation checkbox — only in real mode */}
            {!mlDryRun && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={realConfirmed}
                  onChange={(e) => setRealConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-indigo-600 cursor-pointer"
                />
                <span className="text-sm text-gray-700 leading-snug">
                  Entiendo que estos productos se publicarán en Mercado Libre
                </span>
              </label>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowBulkConfirm(false); setRealConfirmed(false); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkPublish}
                disabled={(!mlDryRun && !realConfirmed) || missingImageFiles.length > 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {mlDryRun
                  ? <><FlaskConical size={14} /> Simular {publishableRows.length} productos</>
                  : <><Send size={14} /> Publicar {publishableRows.length} en Mercado Libre</>
                }
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
            pubState?.status === 'dry_run' ? <FlaskConical size={15} className="text-amber-500 shrink-0" /> :
            pubState?.status === 'failed' ? <XCircle size={15} className="text-red-500 shrink-0" /> :
            pubState?.status === 'preflight_failed' ? <ShieldOff size={15} className="text-orange-500 shrink-0" /> :
            pubState?.status === 'skipped_invalid' ? <SkipForward size={15} className="text-gray-400 shrink-0" /> :
            row.status === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" /> :
            row.status === 'warnings' ? <Clock size={15} className="text-amber-500 shrink-0" /> :
            <XCircle size={15} className="text-red-500 shrink-0" />;

          const rowBg =
            pubState?.status === 'published' ? 'bg-emerald-50/60' :
            pubState?.status === 'dry_run' ? 'bg-amber-50/60' :
            pubState?.status === 'failed' ? 'bg-red-50/60' :
            pubState?.status === 'preflight_failed' ? 'bg-orange-50/60' :
            pubState?.status === 'skipped_invalid' ? 'bg-gray-50/60' :
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
              {isExpanded && (
                <RowDetail
                  row={row}
                  publishState={pubState}
                  mlImageUrls={mlImageUrls}
                  imageUploadErrors={imageUploadErrors}
                  imageFiles={imageFiles}
                  prepareResult={prepareResults.get(row.rowIndex)}
                  imageUploadDetails={imageUploadDetails}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
