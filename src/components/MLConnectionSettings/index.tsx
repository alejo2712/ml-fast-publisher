'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  FlaskConical,
  ExternalLink,
  Copy,
  ImageIcon,
  Loader2,
  RefreshCw,
  Zap,
  Link as LinkIcon,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { cn } from '@/components/ui';

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

function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      {ok ? (
        <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

export function MLConnectionSettings() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ml/status');
      const data = await res.json();
      setStatus(data as MLStatus);
    } catch {
      toast('No se pudo cargar el estado de ML', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle callback params
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
      toast('Error de red al ejecutar el test', 'error');
    } finally {
      setTestLoading(false);
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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mercado Libre</h1>
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

      {/* Warnings */}
      {status.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
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

      {/* Connection status card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-1">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Estado de conexión</h2>

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
          label="Cuenta ML conectada"
          detail={
            status.connected
              ? tokenExpired
                ? `ML User ID: ${status.userId} — Token vencido (se renueva automáticamente al publicar)`
                : `ML User ID: ${status.userId}${tokenExpiry ? ` — Vence: ${tokenExpiry.toLocaleString('es-AR')}` : ''}`
              : 'No conectado. Hacé click en "Conectar cuenta" para autorizar la app.'
          }
        />
        <StatusRow
          ok={status.dryRun}
          label={status.dryRun ? 'Modo dry-run activo (seguro)' : 'Modo publicación real'}
          detail={
            status.dryRun
              ? 'MERCADOLIBRE_DRY_RUN=true — no se publican ítems reales. Para publicar de verdad, configurá MERCADOLIBRE_DRY_RUN=false.'
              : 'MERCADOLIBRE_DRY_RUN=false — las publicaciones son reales. Activá dry-run si estás probando.'
          }
        />
      </div>

      {/* Image hosting card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-1">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          <span className="flex items-center gap-2">
            <ImageIcon size={14} className="text-gray-400" />
            Hosting de imágenes
          </span>
        </h2>

        <StatusRow
          ok={status.imageHosting.baseUrlConfigured && status.imageHosting.isHttps}
          label={
            status.imageHosting.baseUrlConfigured
              ? status.imageHosting.isHttps
                ? `IMAGE_PUBLIC_BASE_URL configurado (${status.imageHosting.baseUrlDisplay})`
                : 'IMAGE_PUBLIC_BASE_URL configurado pero NO empieza con https://'
              : 'IMAGE_PUBLIC_BASE_URL no configurado'
          }
          detail={
            status.imageHosting.baseUrlConfigured
              ? status.imageHosting.isHttps
                ? 'Las imágenes subidas localmente (/uploads/...) se convertirán automáticamente a URLs públicas al publicar.'
                : 'El valor debe comenzar con https:// para que Mercado Libre pueda acceder a las imágenes.'
              : 'Sin esta variable, las imágenes locales solo funcionan en dry-run. Podés usar URLs externas (https://) sin configurarla.'
          }
        />
      </div>

      {/* OAuth connect */}
      {status.credentialsConfigured && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Conectar cuenta de Mercado Libre</h2>

          {/* Callback URL instructions */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Redirect URI (configurar en tu app ML)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-indigo-700 font-mono truncate">
                {callbackUrl}
              </code>
              <button
                onClick={copyCallbackUrl}
                title="Copiar URL"
                className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <Copy size={13} className="text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Esta URL debe estar registrada en tu app de ML en{' '}
              <a
                href="https://developers.mercadolibre.com.ar/apps"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline inline-flex items-center gap-0.5"
              >
                developers.mercadolibre.com.ar/apps
                <ExternalLink size={10} />
              </a>
              {' '}bajo "Redirect URIs".
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
            <LinkIcon size={15} />
            {status.connected ? 'Reconectar cuenta ML' : 'Conectar cuenta ML'}
          </a>
        </div>
      )}

      {/* Dry-run test */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-700">Test del pipeline (dry-run)</h2>
        </div>
        <p className="text-xs text-gray-500">
          Valida el payload de una heladera de ejemplo y simula el flujo completo de publicación sin llamar a la API de ML.
          El resultado se registra en tu historial como DRY_RUN.
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
            <><ShieldCheck size={14} /> Ejecutar test dry-run</>
          )}
        </button>
      </div>

      {/* No credentials guidance */}
      {!status.credentialsConfigured && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Cómo configurar las credenciales</h2>
          <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
            <li>
              Creá una app en{' '}
              <a
                href="https://developers.mercadolibre.com.ar/apps/new"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline inline-flex items-center gap-0.5"
              >
                developers.mercadolibre.com.ar/apps/new
                <ExternalLink size={10} />
              </a>
            </li>
            <li>
              Copiá el <strong>Client ID</strong> y <strong>Client Secret</strong>
            </li>
            <li>
              Agregá como Redirect URI:{' '}
              <code className="bg-gray-100 px-1 rounded font-mono">/api/ml/callback</code> en tu dominio
            </li>
            <li>
              Completá en <code className="bg-gray-100 px-1 rounded font-mono">.env.local</code>:
              <pre className="mt-1 bg-gray-50 rounded-lg p-3 text-xs font-mono border border-gray-200 overflow-x-auto whitespace-pre">
                {`MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret
MERCADOLIBRE_REDIRECT_URI=http://localhost:3000/api/ml/callback
MERCADOLIBRE_SITE_ID=MLA`}
              </pre>
            </li>
            <li>Reiniciá el servidor: <code className="bg-gray-100 px-1 rounded font-mono">npm run dev</code></li>
          </ol>
        </div>
      )}
    </div>
  );
}
