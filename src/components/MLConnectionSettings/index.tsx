'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, XCircle, AlertTriangle, AlertCircle, ShieldCheck,
  FlaskConical, ExternalLink, Copy, ImageIcon, Loader2, RefreshCw,
  Zap, Link as LinkIcon, Unlink, Info, Send,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { cn } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImageHosting {
  baseUrlConfigured: boolean;
  baseUrlDisplay: string | null;
  isHttps: boolean;
}

interface MLStatus {
  credentialsConfigured: boolean;
  connected: boolean;
  dryRun: boolean;
  siteId: string;
  userId: string | null;
  tokenExpiresAt: number | null;
  imageHosting: ImageHosting;
  warnings: string[];
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

// Sample valid payload for readiness test
const SAMPLE_PREFLIGHT_PAYLOAD = {
  title: 'Heladera Samsung No Frost 320L Blanca',
  category_id: 'MLA1577',
  price: 450000,
  currency_id: 'ARS',
  available_quantity: 1,
  buying_mode: 'buy_it_now',
  condition: 'new',
  listing_type_id: 'gold_special',
  description: { plain_text: 'Heladera Samsung No Frost 320L color blanca, 220V.' },
  pictures: [{ source: 'https://http2.mlstatic.com/D_NQ_NP_sample.jpg' }],
  attributes: [
    { id: 'BRAND', value_name: 'Samsung' },
    { id: 'VOLTAGE', value_name: '220V' },
  ],
  shipping: { mode: 'me2', free_shipping: false },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusRow({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      {ok
        ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
        : warn
        ? <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
        : <XCircle size={15} className="text-red-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{detail}</p>}
      </div>
    </div>
  );
}

function CheckStatusIcon({ status }: { status: PreflightCheck['status'] }) {
  if (status === 'ok')      return <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />;
  if (status === 'warning') return <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />;
  if (status === 'error')   return <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />;
  return <Info size={13} className="text-gray-400 shrink-0 mt-0.5" />;
}

function DisconnectModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
            <Unlink size={16} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Desconectar cuenta ML</h2>
            <p className="text-xs text-gray-500 mt-0.5">Esta acción elimina los tokens almacenados.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Se eliminarán los tokens de acceso de Mercado Libre. Deberás volver a conectar tu cuenta para publicar
          en modo real. El modo dry-run seguirá funcionando.
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading ? <><Loader2 size={13} className="animate-spin" /> Desconectando...</> : <><Unlink size={13} /> Desconectar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MLConnectionSettings() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessResult, setReadinessResult] = useState<PreflightResult | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [environment, setEnvironment] = useState<'local' | 'preview' | 'production' | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [mlRes, healthRes] = await Promise.all([
        fetch('/api/ml/status'),
        fetch('/api/health'),
      ]);
      const mlData = await mlRes.json();
      setStatus(mlData as MLStatus);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setEnvironment(healthData.environment ?? null);
      }
    } catch {
      toast('No se pudo cargar el estado de ML', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Handle OAuth callback params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'true') {
      toast('Cuenta de Mercado Libre conectada exitosamente', 'success');
      fetchStatus();
    } else if (error) {
      const messages: Record<string, string> = {
        missing_code: 'No se recibió el código de autorización de ML',
        credentials_not_configured: 'Las credenciales de ML no están configuradas',
      };
      toast(messages[error] ?? `Error de OAuth: ${error}`, 'error');
    }
  }, [searchParams, toast, fetchStatus]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/ml/disconnect', { method: 'DELETE' });
      if (res.ok) {
        toast('Cuenta de Mercado Libre desconectada', 'success');
        setShowDisconnectModal(false);
        setReadinessResult(null);
        await fetchStatus();
      } else {
        toast('Error al desconectar la cuenta', 'error');
      }
    } catch {
      toast('Error de red al desconectar', 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleTestDryRun() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ml/test-dry-run', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: 'Pipeline OK — payload válido, dry-run exitoso.' });
        toast('Test dry-run completado exitosamente', 'success');
      } else {
        setTestResult({ success: false, message: data.error ?? 'Error desconocido' });
        toast('Test dry-run falló', 'error');
      }
    } catch {
      setTestResult({ success: false, message: 'Error de red' });
      toast('Error de red', 'error');
    } finally {
      setTestLoading(false);
    }
  }

  async function handleReadinessTest() {
    setReadinessLoading(true);
    setReadinessResult(null);
    try {
      const res = await fetch('/api/ml/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: SAMPLE_PREFLIGHT_PAYLOAD }),
      });
      const data = await res.json();
      if (res.ok) {
        setReadinessResult(data as PreflightResult);
        if (data.ready) {
          toast(data.warningCount > 0 ? `Listo con ${data.warningCount} advertencia(s)` : 'Todos los checks OK', 'success');
        } else {
          toast(`${data.blockingCount} problema(s) bloqueante(s) detectado(s)`, 'error');
        }
      } else {
        toast('Error al ejecutar verificación', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setReadinessLoading(false);
    }
  }

  function copyCallbackUrl() {
    const url = `${window.location.origin}/api/ml/callback`;
    navigator.clipboard.writeText(url).then(() => toast('URL copiada', 'success'));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
        <Loader2 size={16} className="animate-spin" />
        Cargando estado de Mercado Libre...
      </div>
    );
  }

  if (!status) return null;

  const callbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ml/callback`
    : '/api/ml/callback';

  const tokenExpiry = status.tokenExpiresAt ? new Date(status.tokenExpiresAt) : null;
  const tokenExpired = tokenExpiry ? tokenExpiry < new Date() : false;
  const tokenExpiresInMs = tokenExpiry ? tokenExpiry.getTime() - Date.now() : null;
  const tokenExpiresSoon = tokenExpiresInMs !== null && tokenExpiresInMs > 0 && tokenExpiresInMs < 30 * 60 * 1000;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Mercado Libre</h1>
              {environment && (
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  environment === 'production' ? 'bg-indigo-100 text-indigo-700' :
                  environment === 'preview' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                )}>
                  {environment === 'production' ? 'Producción' : environment === 'preview' ? 'Preview' : 'Local'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Configuración de OAuth y publicación</p>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={12} />
          Actualizar
        </button>
      </div>

      {/* ── REAL MODE WARNING BANNER ─────────────────────────────────────────── */}
      {!status.dryRun && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-red-600 shrink-0" />
            <p className="text-sm font-bold text-red-700">PUBLICACIÓN REAL ACTIVA</p>
          </div>
          <p className="text-xs text-red-600 leading-snug">
            <code className="bg-red-100 px-1 rounded font-mono">MERCADOLIBRE_DRY_RUN=false</code> está configurado.
            Cualquier publicación creará ítems <strong>reales</strong> en tu cuenta de Mercado Libre.
            Usá el preflight y verificá la preparación antes de publicar.
          </p>
        </div>
      )}

      {/* ── WARNINGS ─────────────────────────────────────────────────────────── */}
      {status.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-sm font-semibold text-amber-700">
              {status.warnings.length === 1 ? '1 advertencia' : `${status.warnings.length} advertencias`}
            </p>
          </div>
          <ul className="space-y-1 pl-5 list-disc">
            {status.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── CARD 1: Connection ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Conexión OAuth</h2>
          {status.connected && (
            <button
              onClick={() => setShowDisconnectModal(true)}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-all font-medium"
            >
              <Unlink size={11} />
              Desconectar
            </button>
          )}
        </div>

        <StatusRow
          ok={status.credentialsConfigured}
          label="Credenciales configuradas"
          detail={
            status.credentialsConfigured
              ? `App configurada — Sitio: ${status.siteId}`
              : 'Falta MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET o MERCADOLIBRE_REDIRECT_URI en .env.local'
          }
        />
        <StatusRow
          ok={status.connected && !tokenExpired}
          warn={status.connected && (tokenExpired || tokenExpiresSoon)}
          label="Cuenta ML conectada"
          detail={
            status.connected
              ? tokenExpired
                ? `ML User ID: ${status.userId} — Token vencido (se renueva automáticamente al publicar)`
                : tokenExpiresSoon
                ? `ML User ID: ${status.userId} — Token vence pronto: ${tokenExpiry?.toLocaleString('es-AR')}`
                : `ML User ID: ${status.userId} — Vence: ${tokenExpiry?.toLocaleString('es-AR')}`
              : 'No conectado. Hacé click en "Conectar cuenta" para autorizar la app.'
          }
        />

        {/* OAuth connect/reconnect button */}
        {status.credentialsConfigured && (
          <div className="pt-3 space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Redirect URI (registrar en tu app ML)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-indigo-700 font-mono truncate">
                  {callbackUrl}
                </code>
                <button
                  onClick={copyCallbackUrl}
                  title="Copiar URL"
                  className="shrink-0 p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <Copy size={12} className="text-gray-500" />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Registrá esta URL en{' '}
                <a href="https://developers.mercadolibre.com.ar/apps" target="_blank" rel="noreferrer"
                   className="text-indigo-600 underline inline-flex items-center gap-0.5">
                  developers.mercadolibre.com.ar/apps
                  <ExternalLink size={10} />
                </a>
              </p>
            </div>
            <a
              href="/api/ml/auth"
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl font-semibold text-sm transition-all w-full',
                status.connected
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
              )}
            >
              <LinkIcon size={14} />
              {status.connected ? 'Reconectar cuenta ML' : 'Conectar cuenta ML'}
            </a>
          </div>
        )}

        {/* No credentials guidance */}
        {!status.credentialsConfigured && (
          <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600">Cómo configurar las credenciales</p>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>Creá una app en <a href="https://developers.mercadolibre.com.ar/apps/new" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-0.5">developers.mercadolibre.com.ar/apps/new<ExternalLink size={9} /></a></li>
              <li>Copiá el <strong>Client ID</strong> y <strong>Client Secret</strong></li>
              <li>Agregá como Redirect URI: <code className="bg-gray-200 px-1 rounded">/api/ml/callback</code> en tu dominio</li>
              <li>Completá en <code className="bg-gray-200 px-1 rounded">.env.local</code>:
                <pre className="mt-1 bg-white rounded-lg p-2.5 text-xs font-mono border border-gray-200 overflow-x-auto">
{`MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret
MERCADOLIBRE_REDIRECT_URI=http://localhost:3000/api/ml/callback
MERCADOLIBRE_SITE_ID=MLA`}
                </pre>
              </li>
              <li>Reiniciá el servidor: <code className="bg-gray-200 px-1 rounded">npm run dev</code></li>
            </ol>
          </div>
        )}
      </div>

      {/* ── CARD 2: Diagnostics ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Diagnóstico de publicación</h2>
        </div>

        <StatusRow
          ok={status.dryRun}
          warn={!status.dryRun}
          label={status.dryRun ? 'Modo dry-run activo (seguro)' : 'Modo publicación real'}
          detail={
            status.dryRun
              ? 'MERCADOLIBRE_DRY_RUN=true — no se publican ítems reales. Seguro para pruebas y desarrollo.'
              : 'MERCADOLIBRE_DRY_RUN=false — las publicaciones crean ítems REALES en tu cuenta de ML.'
          }
        />
        <StatusRow
          ok={status.imageHosting.baseUrlConfigured && status.imageHosting.isHttps}
          warn={!status.imageHosting.baseUrlConfigured}
          label={
            status.imageHosting.baseUrlConfigured
              ? status.imageHosting.isHttps
                ? `Hosting de imágenes configurado (${status.imageHosting.baseUrlDisplay})`
                : 'IMAGE_PUBLIC_BASE_URL no empieza con https://'
              : 'IMAGE_PUBLIC_BASE_URL no configurado'
          }
          detail={
            status.imageHosting.baseUrlConfigured && status.imageHosting.isHttps
              ? 'Las imágenes locales (/uploads/...) se convertirán a URLs públicas al publicar.'
              : status.imageHosting.baseUrlConfigured && !status.imageHosting.isHttps
              ? 'El valor debe comenzar con https:// para que ML pueda acceder a las imágenes.'
              : 'Sin esta variable, las imágenes locales solo funcionan en dry-run. En producción usá URLs externas (https://).'
          }
        />

        {/* Readiness test panel */}
        {readinessResult && (
          <div className={cn(
            'mt-3 rounded-xl border p-4 space-y-3',
            readinessResult.ready ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
          )}>
            <div className="flex items-center gap-2">
              {readinessResult.ready
                ? <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                : <AlertCircle size={15} className="text-red-600 shrink-0" />}
              <p className={cn('text-sm font-semibold', readinessResult.ready ? 'text-emerald-700' : 'text-red-700')}>
                {readinessResult.ready
                  ? readinessResult.warningCount > 0
                    ? `Listo — con ${readinessResult.warningCount} advertencia(s)`
                    : 'Listo para publicar'
                  : `${readinessResult.blockingCount} problema(s) bloqueante(s)`}
              </p>
            </div>
            <div className="space-y-2">
              {readinessResult.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-2.5">
                  <CheckStatusIcon status={check.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800">{check.label}</p>
                    <p className="text-xs text-gray-500 leading-snug">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3">
          <button
            onClick={handleReadinessTest}
            disabled={readinessLoading}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {readinessLoading ? (
              <><Loader2 size={14} className="animate-spin" /> Verificando...</>
            ) : (
              <><ShieldCheck size={14} /> Verificar preparación para publicación</>
            )}
          </button>
        </div>
      </div>

      {/* ── CARD 3: Dry-run test ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-700">Test del pipeline (dry-run)</h2>
        </div>
        <p className="text-xs text-gray-500">
          Valida el payload de una heladera de ejemplo y simula el flujo completo de publicación
          sin llamar a la API de ML. El resultado se registra en tu historial como DRY_RUN.
        </p>

        {testResult && (
          <div className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
            testResult.success
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          )}>
            {testResult.success
              ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              : <XCircle size={13} className="shrink-0 mt-0.5" />}
            {testResult.message}
          </div>
        )}

        <button
          onClick={handleTestDryRun}
          disabled={testLoading}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testLoading ? (
            <><Loader2 size={14} className="animate-spin" /> Ejecutando test...</>
          ) : (
            <><FlaskConical size={14} /> Ejecutar test dry-run</>
          )}
        </button>
      </div>

      {/* Disconnect modal */}
      {showDisconnectModal && (
        <DisconnectModal
          onConfirm={handleDisconnect}
          onCancel={() => setShowDisconnectModal(false)}
          loading={disconnecting}
        />
      )}
    </div>
  );
}
