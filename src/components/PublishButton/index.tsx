'use client';

import { useState, useEffect } from 'react';
import {
  Send, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, FlaskConical,
  X, ImageIcon, ShieldCheck, AlertCircle, Info, ShieldOff,
} from 'lucide-react';
import { cn } from '@/components/ui';
import type { MLPayload } from '@/types';
import type { MLBulkPublishResult } from '@/lib/mercadolibre/types';

interface MLStatus {
  credentialsConfigured: boolean;
  connected: boolean;
  dryRun: boolean;
  siteId: string;
  userId: string | null;
}

interface PreflightCheck {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error' | 'skip';
  detail: string;
}

interface PreflightResult {
  ready: boolean;
  dryRun: boolean;
  checks: PreflightCheck[];
  blockingCount: number;
  warningCount: number;
}

interface PublishButtonProps {
  payload: MLPayload;
  isReady: boolean;
  hasLocalImages?: boolean;
  rowIndex?: number;
  onResult?: (result: MLBulkPublishResult) => void;
}

function CheckIcon({ status }: { status: PreflightCheck['status'] }) {
  if (status === 'ok')      return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />;
  if (status === 'warning') return <AlertTriangle size={13} className="text-amber-500 shrink-0" />;
  if (status === 'error')   return <AlertCircle size={13} className="text-red-500 shrink-0" />;
  return <Info size={13} className="text-gray-400 shrink-0" />;
}

function PreflightPanel({ preflight, loading }: { preflight: PreflightResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin text-indigo-400" />
        Verificando preparación...
      </div>
    );
  }
  if (!preflight) return null;

  return (
    <div className={cn(
      'rounded-xl border p-3 space-y-2',
      preflight.ready ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    )}>
      <div className="flex items-center gap-2">
        {preflight.ready
          ? <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          : <AlertCircle size={14} className="text-red-600 shrink-0" />}
        <p className={cn('text-xs font-semibold', preflight.ready ? 'text-emerald-700' : 'text-red-700')}>
          {preflight.ready
            ? preflight.warningCount > 0
              ? `Listo con ${preflight.warningCount} advertencia${preflight.warningCount > 1 ? 's' : ''}`
              : 'Todo listo para publicar'
            : `${preflight.blockingCount} problema${preflight.blockingCount > 1 ? 's' : ''} bloqueante${preflight.blockingCount > 1 ? 's' : ''} detectado${preflight.blockingCount > 1 ? 's' : ''}`}
        </p>
      </div>
      <div className="space-y-1.5">
        {preflight.checks.filter(c => c.status !== 'ok' && c.status !== 'skip').map((check) => (
          <div key={check.id} className="flex items-start gap-2">
            <CheckIcon status={check.status} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800">{check.label}</p>
              <p className="text-xs text-gray-500 leading-snug">{check.detail}</p>
            </div>
          </div>
        ))}
        {preflight.checks.filter(c => c.status !== 'ok' && c.status !== 'skip').length === 0 && (
          <p className="text-xs text-emerald-600">Todos los checks pasaron correctamente.</p>
        )}
      </div>
    </div>
  );
}

// ── Safe First Publish confirmations ─────────────────────────────────────────

const SAFE_PUBLISH_CONFIRMATIONS = [
  'El preflight pasó sin errores bloqueantes.',
  'Las imágenes son URLs HTTPS públicas, accesibles por Mercado Libre.',
  'Entiendo que este ítem quedará publicado de forma real en Mercado Libre y deberé borrarlo manualmente si fue un test.',
  'Verifiqué el título, precio, categoría y condición del producto.',
] as const;

function ConfirmModal({
  payload,
  mlStatus,
  hasLocalImages,
  onConfirm,
  onCancel,
  isPublishing,
}: {
  payload: MLPayload;
  mlStatus: MLStatus;
  hasLocalImages: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPublishing: boolean;
}) {
  const [confirmations, setConfirmations] = useState<boolean[]>(
    SAFE_PUBLISH_CONFIRMATIONS.map(() => false)
  );
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const blockedByImages = !mlStatus.dryRun && hasLocalImages;

  // Auto-run preflight when modal opens in real mode
  useEffect(() => {
    if (mlStatus.dryRun) return;
    setPreflightLoading(true);
    fetch('/api/ml/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    })
      .then(r => r.json())
      .then(data => setPreflight(data as PreflightResult))
      .catch(() => { /* silent */ })
      .finally(() => setPreflightLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preflightBlocking = !mlStatus.dryRun && preflight !== null && !preflight.ready;
  const allConfirmed = confirmations.every(Boolean);

  const confirmDisabled =
    isPublishing ||
    blockedByImages ||
    preflightLoading ||
    preflightBlocking ||
    (!mlStatus.dryRun && !allConfirmed);

  const toggleConfirmation = (i: number) => {
    setConfirmations(prev => prev.map((v, idx) => idx === i ? !v : v));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Confirmar publicación</h2>
            <p className="text-sm text-gray-500">Revisá los detalles antes de continuar.</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Dry-run notice */}
        {mlStatus.dryRun && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
            <FlaskConical size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">Modo dry-run activo</p>
              <p className="text-blue-600 text-xs mt-0.5">
                No se publicará nada real. Para publicar de verdad configurá{' '}
                <code className="bg-blue-100 px-1 rounded">MERCADOLIBRE_DRY_RUN=false</code>.
              </p>
            </div>
          </div>
        )}

        {/* Real mode header warning */}
        {!mlStatus.dryRun && (
          <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-xl p-3 text-sm">
            <ShieldOff size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-red-700">PUBLICACIÓN REAL</p>
              <p className="text-red-600 text-xs mt-0.5">
                Este ítem se publicará en Mercado Libre. No hay deshacer automático.
                Confirmá cada punto antes de continuar.
              </p>
            </div>
          </div>
        )}

        {/* Preflight panel — real mode only */}
        {!mlStatus.dryRun && (
          <PreflightPanel preflight={preflight} loading={preflightLoading} />
        )}

        {/* Local images warning */}
        {hasLocalImages && (
          <div className={cn(
            'flex items-start gap-3 rounded-xl p-3 text-sm',
            mlStatus.dryRun ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'
          )}>
            <ImageIcon size={16} className={cn('mt-0.5 shrink-0', mlStatus.dryRun ? 'text-amber-500' : 'text-red-500')} />
            <div>
              <p className={cn('font-semibold', mlStatus.dryRun ? 'text-amber-700' : 'text-red-700')}>
                {mlStatus.dryRun ? 'Imágenes locales (solo dry-run)' : 'Imágenes locales — publicación bloqueada'}
              </p>
              <p className={cn('text-xs mt-0.5', mlStatus.dryRun ? 'text-amber-600' : 'text-red-600')}>
                {mlStatus.dryRun
                  ? 'Las imágenes locales funcionan en dry-run pero ML no puede accederlas en publicación real.'
                  : 'ML requiere URLs HTTPS públicas. Reemplazá las imágenes o configurá IMAGE_PUBLIC_BASE_URL.'}
              </p>
            </div>
          </div>
        )}

        {/* Missing credentials */}
        {!mlStatus.credentialsConfigured && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <ShieldAlert size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-700">Credenciales no configuradas</p>
              <p className="text-amber-600 text-xs mt-0.5">
                Completá las variables en <code className="bg-amber-100 px-1 rounded">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* Not connected */}
        {mlStatus.credentialsConfigured && !mlStatus.connected && !mlStatus.dryRun && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
            <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">No conectado a Mercado Libre</p>
              <p className="text-red-600 text-xs mt-0.5">
                <a href="/settings/mercadolibre" className="underline font-medium">Conectar cuenta ML</a> antes de publicar.
              </p>
            </div>
          </div>
        )}

        {/* Product summary */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-gray-800 truncate">{payload.title}</p>
          <div className="flex flex-wrap gap-4 text-gray-500 text-xs">
            <span>Precio: <span className="font-medium text-gray-700">${payload.price.toLocaleString('es-AR')} {payload.currency_id}</span></span>
            <span>Stock: <span className="font-medium text-gray-700">{payload.available_quantity}</span></span>
            <span>Condición: <span className="font-medium text-gray-700">{payload.condition}</span></span>
          </div>
          <p className="text-xs text-gray-400">Cat: {payload.category_id} · Tipo: {payload.listing_type_id}</p>
          <p className="text-xs text-gray-400">
            {payload.pictures.length} imagen{payload.pictures.length !== 1 ? 'es' : ''}
            {hasLocalImages && <span className="ml-1 text-amber-500">· contiene imágenes locales</span>}
          </p>
        </div>

        {/* Safe First Publish — multi-step confirmations (real mode only) */}
        {!mlStatus.dryRun && !blockedByImages && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Confirmaciones requeridas</p>
            {SAFE_PUBLISH_CONFIRMATIONS.map((text, i) => (
              <label key={i} className="flex items-start gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={confirmations[i]}
                  onChange={() => toggleConfirmation(i)}
                  className="mt-0.5 rounded border-gray-300 text-red-600 cursor-pointer"
                />
                <span className={cn(
                  'text-xs leading-snug transition-colors',
                  confirmations[i] ? 'text-gray-500 line-through' : 'text-gray-700'
                )}>
                  {text}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isPublishing}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            title={
              preflightBlocking
                ? `Preflight falló: ${preflight?.blockingCount} problema(s) bloqueante(s)`
                : !allConfirmed && !mlStatus.dryRun
                ? 'Confirmá todos los puntos para continuar'
                : undefined
            }
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              mlStatus.dryRun
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isPublishing ? (
              <><Loader2 size={15} className="animate-spin" /> Publicando...</>
            ) : mlStatus.dryRun ? (
              <><FlaskConical size={15} /> Simular publicación</>
            ) : (
              <><Send size={15} /> Publicar en Mercado Libre</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PublishButton({ payload, isReady, hasLocalImages = false, rowIndex, onResult }: PublishButtonProps) {
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [result, setResult] = useState<MLBulkPublishResult | null>(null);

  useEffect(() => {
    fetch('/api/ml/status')
      .then((r) => r.json())
      .then(setMlStatus)
      .catch(() => {});
  }, []);

  async function handleConfirm() {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/ml/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ payload, rowIndex }] }),
      });
      const data = await res.json();

      // Surface preflight errors from server
      if (!res.ok && data.preflight) {
        const blocking = data.preflight.checks?.filter((c: PreflightCheck) => c.status === 'error') ?? [];
        const msg = blocking[0]?.detail ?? data.error ?? 'Preflight fallido';
        setResult({
          results: [{ status: 'failed', message: msg, rowIndex }],
          totalPublished: 0, totalFailed: 1, totalSkipped: 0, dryRun: false,
        });
        return;
      }

      // Surface image errors
      if (!res.ok && data.imageErrors) {
        const msg = data.imageErrors[0]?.errors?.[0] ?? data.error ?? 'Error de imágenes';
        setResult({
          results: [{ status: 'failed', message: msg, rowIndex }],
          totalPublished: 0, totalFailed: 1, totalSkipped: 0, dryRun: false,
        });
        return;
      }

      setResult(data as MLBulkPublishResult);
      onResult?.(data as MLBulkPublishResult);
    } catch (err) {
      setResult({
        results: [{ status: 'failed', message: err instanceof Error ? err.message : 'Error de red', rowIndex }],
        totalPublished: 0, totalFailed: 1, totalSkipped: 0, dryRun: false,
      });
    } finally {
      setIsPublishing(false);
      setShowModal(false);
    }
  }

  if (result) {
    const r = result.results[0];
    if (r?.status === 'published') {
      return (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <CheckCircle2 size={16} />
          <span className="font-medium">Publicado</span>
          {r.permalink && <a href={r.permalink} target="_blank" rel="noreferrer" className="text-xs underline ml-1">Ver en ML</a>}
        </div>
      );
    }
    if (r?.status === 'dry_run') {
      return (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <FlaskConical size={16} />
          <span className="font-medium">Dry-run OK — no se publicó nada</span>
          <button onClick={() => setResult(null)} className="ml-2 text-xs text-blue-500 underline">Resetear</button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
        <AlertTriangle size={16} />
        <span className="font-medium truncate">{r?.message ?? 'Error desconocido'}</span>
        <button onClick={() => setResult(null)} className="ml-2 text-xs shrink-0 underline">Reintentar</button>
      </div>
    );
  }

  const inDryRun = mlStatus?.dryRun ?? true;
  const blockedByImages = !inDryRun && hasLocalImages;
  const isDisabled = !isReady || blockedByImages;

  const title = !isReady
    ? 'Completá todos los campos requeridos antes de publicar'
    : blockedByImages
    ? 'Las imágenes locales no son válidas para publicación real. Usá URLs HTTPS o configurá IMAGE_PUBLIC_BASE_URL.'
    : undefined;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isDisabled}
        title={title}
        className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
          blockedByImages
            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
            : inDryRun
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
        )}
      >
        {blockedByImages ? (
          <><ImageIcon size={15} /> Imágenes locales</>
        ) : inDryRun ? (
          <><FlaskConical size={15} /> Publicar (dry-run)</>
        ) : (
          <><Send size={15} /> Publicar en Mercado Libre</>
        )}
      </button>

      {showModal && mlStatus && (
        <ConfirmModal
          payload={payload}
          mlStatus={mlStatus}
          hasLocalImages={hasLocalImages}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
          isPublishing={isPublishing}
        />
      )}
    </>
  );
}
