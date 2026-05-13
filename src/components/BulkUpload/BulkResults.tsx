'use client';

import type { CsvRowResult } from '@/lib/csv/parser';
import { exportAllPayloads } from '@/lib/csv/parser';
import type { MLBulkPublishResult, MLPublishResult } from '@/lib/mercadolibre/types';
import type { ProductDraft } from '@/types';
import {
  CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown, ChevronRight,
  Send, FlaskConical, Loader2, Clock, Pencil, X, Check, ShieldOff, ExternalLink, Hash, SkipForward,
  Info,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { cn } from '@/components/ui';
import { JsonPreview } from '@/components/JsonPreview';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado',
};

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
}

function RowDetail({ row, publishState, mlImageUrls, imageUploadErrors }: RowDetailProps) {
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

      {/* Local image status — shown when row references local image filenames */}
      {row.localImageRefs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Imágenes locales</p>
          {row.localImageRefs.map((ref) => {
            const mlUrl = mlImageUrls?.get(ref.toLowerCase());
            const uploadError = imageUploadErrors?.get(ref);
            return (
              <div key={ref} className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs',
                mlUrl ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                uploadError ? 'bg-red-50 border border-red-200 text-red-700' :
                'bg-gray-50 border border-gray-200 text-gray-600'
              )}>
                <span className="font-mono flex-1 truncate">{ref}</span>
                {mlUrl ? (
                  <a href={mlUrl} target="_blank" rel="noreferrer" className="text-emerald-600 font-medium shrink-0 underline flex items-center gap-1">
                    <ExternalLink size={10} />ML CDN
                  </a>
                ) : uploadError ? (
                  <span className="text-red-600 font-medium shrink-0">{uploadError}</span>
                ) : (
                  <span className="text-gray-400 shrink-0 italic">Pendiente de subir</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pre-publish info panel: category, GTIN, required attrs (shown before and after publish) */}
      {row.draft && !publishState?.resolvedCategoryPath && (
        <div className="space-y-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Antes de publicar</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className={row.draft.gtin ? 'text-gray-700' : 'text-amber-600'}>
              <span className="text-gray-400">GTIN:</span>{' '}
              {row.draft.gtin ?? <span className="italic">— faltante</span>}
            </span>
            <span className={row.draft.officialCategoryId ? 'text-gray-700' : 'text-amber-600'}>
              <span className="text-gray-400">categoria_ml:</span>{' '}
              {row.draft.officialCategoryId ?? <span className="italic">— auto-resolución</span>}
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
            <span className="text-gray-600">
              <span className="text-gray-400">Imágenes:</span>{' '}
              {(row.draft.images ?? []).length > 0 ? (
                `${(row.draft.images ?? []).length} imagen${(row.draft.images ?? []).length !== 1 ? 'es' : ''}`
              ) : <span className="text-red-500 italic">— sin imágenes</span>}
              {row.localImageRefs.length > 0 && (
                <span className="ml-1 text-indigo-600">({row.localImageRefs.length} local{row.localImageRefs.length !== 1 ? 'es' : ''})</span>
              )}
            </span>
          </div>
          {!row.draft.officialCategoryId && (
            <p className="text-[11px] text-amber-600 mt-1">
              Sin categoria_ml: el sistema predecirá la categoría automáticamente. Para mayor precisión, especificala.
            </p>
          )}
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
        {/* Payload JSON */}
        {row.payload && (
          <div>
            <button
              onClick={() => setShowPayload((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              {showPayload ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showPayload ? 'Ocultar payload' : 'Ver payload JSON (ML)'}
            </button>
            {showPayload && <div className="mt-2"><JsonPreview payload={row.payload} /></div>}
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
  const [errorsExpanded, setErrorsExpanded] = useState(totalErrors > 0);
  // ML CDN URLs resolved during pre-publish image upload — keyed by original filename (lowercase)
  const [mlImageUrls, setMlImageUrls] = useState<Map<string, string>>(new Map());
  const [imageUploadErrors, setImageUploadErrors] = useState<Map<string, string>>(new Map());

  // Auto-expand errors section when errors are introduced
  const prevErrorCount = useRef(totalErrors);
  useEffect(() => {
    if (totalErrors > 0 && totalErrors !== prevErrorCount.current) {
      setErrorsExpanded(true);
    }
    prevErrorCount.current = totalErrors;
  }, [totalErrors]);

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

  // Error rows are skipped; warning rows (missing optional fields) are included.
  // The publish button always shows — it only disables when ZERO rows are publishable.
  const publishableRows = rows.filter((r) => r.status !== 'error' && r.payload !== null);
  const errorRows = rows.filter((r) => r.status === 'error');
  const exportableCount = rows.filter((r) => r.payload !== null).length;
  const hasPartialErrors = errorRows.length > 0 && publishableRows.length > 0;

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

    if (localFilesToUpload.size > 0 && imageFiles && imageFiles.size > 0 && !mlDryRun) {
      setPublishStates((prev) => {
        const next = new Map(prev);
        publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'publishing', message: 'Subiendo imágenes a Mercado Libre...' }));
        return next;
      });

      // Build FormData with all local files that need uploading (skip already uploaded)
      const formData = new FormData();
      let hasFiles = false;
      for (const filename of localFilesToUpload) {
        if (currentMlImageUrls.has(filename.toLowerCase())) continue; // already uploaded
        const file = imageFiles.get(filename.toLowerCase());
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
        } catch (err) {
          // Network error uploading images — mark all local-image rows as failed
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

    // Mark remaining publishable rows as "publishing"
    setPublishStates((prev) => {
      const next = new Map(prev);
      publishableRows.forEach((r) => next.set(r.rowIndex, { status: 'publishing', message: 'Publicando...' }));
      return next;
    });

    try {
      // Build items — replace local image filenames with ML CDN URLs in payload
      const items = publishableRows.map((r) => {
        let payload = r.payload!;

        // Substitute local image filenames with ML CDN URLs
        if (r.localImageRefs.length > 0 && payload.pictures) {
          const updatedPictures = payload.pictures.map((pic) => {
            const key = pic.source.toLowerCase();
            const isLocal = !pic.source.startsWith('http');
            if (isLocal) {
              const mlUrl = currentMlImageUrls.get(key);
              return mlUrl ? { source: mlUrl } : pic; // keep original if not found (will fail at server)
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

  const publishedCount = Array.from(publishStates.values()).filter((s) => s.status === 'published').length;
  const dryRunCount = Array.from(publishStates.values()).filter((s) => s.status === 'dry_run').length;
  const failedCount = Array.from(publishStates.values()).filter((s) => s.status === 'failed').length;
  const skippedCount = Array.from(publishStates.values()).filter((s) =>
    s.status === 'preflight_failed' || s.status === 'skipped_invalid'
  ).length;
  const hasPublishResults = publishStates.size > 0 && !isBulkPublishing;

  return (
    <div className="space-y-4">

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

      {/* Summary panel */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
        {/* Counts row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg">
            <CheckCircle2 size={14} />
            <span className="font-semibold">{totalOk + totalWarnings}</span>
            <span className="text-emerald-600">{totalOk + totalWarnings === 1 ? 'válido' : 'válidos'}</span>
          </div>
          {totalWarnings > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-white border border-amber-200 px-3 py-1.5 rounded-lg">
              <AlertTriangle size={14} />
              <span className="font-semibold">{totalWarnings}</span>
              <span className="text-amber-600">con advertencias</span>
            </div>
          )}
          {totalErrors > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-lg">
              <XCircle size={14} />
              <span className="font-semibold">{totalErrors}</span>
              <span className="text-red-600">{totalErrors === 1 ? 'con error' : 'con errores'}</span>
            </div>
          )}

          <div className="ml-auto flex gap-2 flex-wrap">
            <button
              onClick={onReset}
              disabled={isBulkPublishing}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors disabled:opacity-50"
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
            {/* Publish button — always visible, disabled only when 0 publishable rows */}
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={isBulkPublishing || publishableRows.length === 0}
              className={cn(
                'flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed',
                publishableRows.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              )}
            >
              {isBulkPublishing
                ? <><Loader2 size={14} className="animate-spin" /> Publicando...</>
                : mlDryRun
                ? <><FlaskConical size={14} /> Simular {publishableRows.length}{hasPartialErrors ? ' válidos' : ''} — modo prueba</>
                : publishableRows.length === 0
                ? <><XCircle size={14} /> Sin productos válidos</>
                : hasPartialErrors
                ? <><Send size={14} /> Publicar {publishableRows.length} productos válidos</>
                : <><Send size={14} /> Publicar {publishableRows.length} en Mercado Libre</>
              }
            </button>
          </div>
        </div>

        {/* Skip notice — shown when some rows will be skipped */}
        {hasPartialErrors && !isBulkPublishing && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info size={12} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              <span className="font-semibold">{errorRows.length} {errorRows.length === 1 ? 'producto con error' : 'productos con errores'} se omitirán</span>{' '}
              automáticamente. Corregí los errores o publicá solo los válidos.
            </span>
          </div>
        )}

        {/* All invalid notice */}
        {publishableRows.length === 0 && rows.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <XCircle size={12} className="shrink-0 mt-0.5 text-red-500" />
            <span>
              <span className="font-semibold">Todos los productos tienen errores.</span>{' '}
              Corregí los errores antes de publicar.
            </span>
          </div>
        )}
      </div>

      {/* Error detail section — auto-expanded when errors exist */}
      {errorRows.length > 0 && (
        <div className="rounded-xl border border-red-200 overflow-hidden">
          <button
            onClick={() => setErrorsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-800">
                {errorRows.length === 1 ? '1 producto con error' : `${errorRows.length} productos con errores`}
                {' '}
                <span className="font-normal text-red-600">— se omitirán al publicar</span>
              </span>
            </div>
            {errorsExpanded ? <ChevronDown size={14} className="text-red-400" /> : <ChevronRight size={14} className="text-red-400" />}
          </button>

          {errorsExpanded && (
            <div className="divide-y divide-red-100 bg-white">
              {errorRows.map((row) => (
                <div key={row.rowIndex} className="px-4 py-3 space-y-2">
                  {/* Row title */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono w-6 shrink-0">#{row.rowIndex}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {row.draft?.title || row.rawRow['descripcion_corta'] || '(sin título)'}
                    </span>
                    {row.draft?.price && (
                      <span className="text-xs text-gray-500 shrink-0">${row.draft.price.toLocaleString('es-AR')}</span>
                    )}
                  </div>

                  {/* Error list */}
                  <div className="pl-8 space-y-1">
                    {row.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                        <XCircle size={11} className="shrink-0 mt-0.5 text-red-400" />
                        <span>{e}</span>
                      </div>
                    ))}
                    {row.missingFields.length > 0 && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-500" />
                        <span>Campos obligatorios faltantes: {row.missingFields.map((f) => f.label).join(', ')}</span>
                      </div>
                    )}
                    {/* Local image refs that caused errors */}
                    {row.localImageRefs.length > 0 && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <Info size={11} className="shrink-0 mt-0.5 text-gray-400" />
                        <span>
                          Imágenes locales: {row.localImageRefs.join(', ')}{' '}
                          {imageFiles && imageFiles.size > 0
                            ? row.localImageRefs.every((f) => imageFiles.has(f.toLowerCase()))
                              ? <span className="text-emerald-600">✓ archivos cargados</span>
                              : <span className="text-red-600">— algunos archivos no encontrados</span>
                            : <span className="text-amber-600">— arrastrá los archivos de imagen al área de carga</span>
                          }
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick edit link */}
                  {row.draft && (
                    <div className="pl-8">
                      <button
                        onClick={() => {
                          setEditingRows((prev) => { const n = new Set(prev); n.add(row.rowIndex); return n; });
                          setExpandedRows((prev) => { const n = new Set(prev); n.add(row.rowIndex); return n; });
                          // Scroll into row list
                          setTimeout(() => {
                            document.getElementById(`row-${row.rowIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 50);
                        }}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <Pencil size={10} />
                        Editar fila
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                disabled={!mlDryRun && !realConfirmed}
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
            <div key={row.rowIndex} id={`row-${row.rowIndex}`} className={cn('transition-colors', rowBg)}>
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
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
