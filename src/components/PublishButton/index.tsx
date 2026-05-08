'use client';

import { useState, useEffect } from 'react';
import { Send, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, FlaskConical, X } from 'lucide-react';
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

interface PublishButtonProps {
  payload: MLPayload;
  isReady: boolean;
  rowIndex?: number;
  onResult?: (result: MLBulkPublishResult) => void;
}

function ConfirmModal({
  payload,
  mlStatus,
  onConfirm,
  onCancel,
  isPublishing,
}: {
  payload: MLPayload;
  mlStatus: MLStatus;
  onConfirm: () => void;
  onCancel: () => void;
  isPublishing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Confirmar publicación</h2>
            <p className="text-sm text-gray-500">Revisá los detalles antes de continuar.</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

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

        {mlStatus.credentialsConfigured && !mlStatus.connected && !mlStatus.dryRun && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
            <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">No conectado a Mercado Libre</p>
              <p className="text-red-600 text-xs mt-0.5">
                <a href="/api/ml/auth" className="underline font-medium">Conectar cuenta ML</a> antes de publicar.
              </p>
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-gray-800 truncate">{payload.title}</p>
          <div className="flex flex-wrap gap-4 text-gray-500 text-xs">
            <span>Precio: <span className="font-medium text-gray-700">${payload.price.toLocaleString('es-AR')} {payload.currency_id}</span></span>
            <span>Stock: <span className="font-medium text-gray-700">{payload.available_quantity}</span></span>
            <span>Condición: <span className="font-medium text-gray-700">{payload.condition}</span></span>
          </div>
          <p className="text-xs text-gray-400">Cat: {payload.category_id} · Tipo: {payload.listing_type_id}</p>
        </div>

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
            disabled={isPublishing}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              mlStatus.dryRun ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isPublishing ? (
              <><Loader2 size={15} className="animate-spin" /> Publicando...</>
            ) : mlStatus.dryRun ? (
              <><FlaskConical size={15} /> Simular publicación</>
            ) : (
              <><Send size={15} /> Publicar ahora</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PublishButton({ payload, isReady, rowIndex, onResult }: PublishButtonProps) {
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
      const data: MLBulkPublishResult = await res.json();
      setResult(data);
      onResult?.(data);
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

  const isDryRun = mlStatus?.dryRun ?? true;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={!isReady}
        title={!isReady ? 'Completá todos los campos requeridos antes de publicar' : undefined}
        className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
          isDryRun
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
        )}
      >
        {isDryRun ? <FlaskConical size={15} /> : <Send size={15} />}
        {isDryRun ? 'Publicar (dry-run)' : 'Publicar en Mercado Libre'}
      </button>

      {showModal && mlStatus && (
        <ConfirmModal
          payload={payload}
          mlStatus={mlStatus}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
          isPublishing={isPublishing}
        />
      )}
    </>
  );
}
