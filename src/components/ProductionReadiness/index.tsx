'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, AlertCircle, RefreshCw,
  Loader2, ShieldCheck, Database, Server, Zap, ImageIcon,
  HardDrive, Globe, Lock, ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/components/ui';

// ── Types ──────────────────────────────────────────────────────────────────────

type ReadinessStatus = 'ok' | 'warning' | 'blocking';

interface ReadinessItem {
  id: string;
  label: string;
  description: string;
  status: ReadinessStatus;
  detail: string;
  action?: string;
  actionHref?: string;
}

interface ReadinessGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: ReadinessItem[];
}

interface HealthResponse {
  status: 'ok' | 'warning' | 'error';
  environment: 'local' | 'preview' | 'production';
  version: string;
  details: {
    env: { status: string; checks: { id: string; status: string; detail: string }[] };
    database: { status: string; checks: { id: string; status: string; detail: string }[] };
    auth: { status: string; checks: { id: string; status: string; detail: string }[] };
    mercadolibre: { status: string; checks: { id: string; status: string; detail: string }[] };
    imageHosting: { status: string; checks: { id: string; status: string; detail: string }[] };
    uploads: { status: string; checks: { id: string; status: string; detail: string }[] };
  };
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusFromCheck(status: string): ReadinessStatus {
  if (status === 'ok') return 'ok';
  if (status === 'warning') return 'warning';
  return 'blocking';
}

function buildReadinessGroups(health: HealthResponse): ReadinessGroup[] {
  const { details, environment } = health;

  // ── Database ──────────────────────────────────────────────────────────────
  const dbItems: ReadinessItem[] = [
    {
      id: 'db_connection',
      label: 'Conexión a base de datos',
      description: 'PostgreSQL debe ser accesible desde el servidor',
      status: statusFromCheck(details.database.checks.find(c => c.id === 'connection')?.status ?? 'error'),
      detail: details.database.checks.find(c => c.id === 'connection')?.detail ?? 'No disponible',
      action: details.database.status !== 'ok' ? 'Configurar DATABASE_URL' : undefined,
    },
    {
      id: 'db_schema',
      label: 'Schema sincronizado',
      description: 'Las tablas de la base de datos deben existir',
      status: statusFromCheck(details.database.checks.find(c => c.id === 'schema')?.status ?? 'error'),
      detail: details.database.checks.find(c => c.id === 'schema')?.detail ?? 'No disponible',
      action: details.database.checks.find(c => c.id === 'schema')?.status !== 'ok' ? 'Ejecutar: prisma db push' : undefined,
    },
  ];

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authItems: ReadinessItem[] = [
    {
      id: 'auth_secret',
      label: 'AUTH_SECRET configurado',
      description: 'Requerido para login y sesiones',
      status: statusFromCheck(details.auth.checks.find(c => c.id === 'secret')?.status ?? 'error'),
      detail: details.auth.checks.find(c => c.id === 'secret')?.detail ?? 'No disponible',
      action: details.auth.status !== 'ok' ? 'Generar: openssl rand -base64 32' : undefined,
    },
  ];

  // ── Mercado Libre ─────────────────────────────────────────────────────────
  const mlCredCheck = details.mercadolibre.checks.find(c => c.id === 'credentials');
  const mlTokenCheck = details.mercadolibre.checks.find(c => c.id === 'tokens');
  const mlDryRunCheck = details.mercadolibre.checks.find(c => c.id === 'dry_run');

  const mlItems: ReadinessItem[] = [
    {
      id: 'ml_credentials',
      label: 'Credenciales ML configuradas',
      description: 'MERCADOLIBRE_CLIENT_ID y CLIENT_SECRET',
      status: statusFromCheck(mlCredCheck?.status ?? 'error'),
      detail: mlCredCheck?.detail ?? 'No disponible',
      action: mlCredCheck?.status !== 'ok' ? 'Configurar credenciales ML' : undefined,
      actionHref: 'https://developers.mercadolibre.com.ar',
    },
    {
      id: 'ml_oauth',
      label: 'Cuenta ML conectada (OAuth)',
      description: 'Token de acceso obtenido mediante OAuth',
      status: statusFromCheck(mlTokenCheck?.status ?? 'warning'),
      detail: mlTokenCheck?.detail ?? 'No disponible',
      action: mlTokenCheck?.status !== 'ok' ? 'Conectar en /settings/mercadolibre' : undefined,
      actionHref: '/settings/mercadolibre',
    },
    {
      id: 'ml_dry_run',
      label: 'Modo de publicación',
      description: 'dry-run=true es seguro; false publica items reales',
      status: mlDryRunCheck?.status === 'ok' ? 'ok' : 'warning',
      detail: mlDryRunCheck?.detail ?? 'No disponible',
    },
  ];

  // ── Image hosting ─────────────────────────────────────────────────────────
  const imgBaseCheck = details.imageHosting.checks.find(c => c.id === 'base_url');
  const uploadsBackendCheck = details.uploads.checks.find(c => c.id === 'backend');
  const uploadsPublicCheck = details.uploads.checks.find(c => c.id === 'public_access');

  const imageItems: ReadinessItem[] = [
    {
      id: 'img_public_url',
      label: 'IMAGE_PUBLIC_BASE_URL',
      description: 'URL HTTPS pública para que ML pueda acceder a imágenes locales',
      status: statusFromCheck(imgBaseCheck?.status ?? 'warning'),
      detail: imgBaseCheck?.detail ?? 'No configurado',
      action: imgBaseCheck?.status !== 'ok' ? 'Configurar IMAGE_PUBLIC_BASE_URL' : undefined,
    },
    {
      id: 'uploads_backend',
      label: 'Backend de almacenamiento',
      description: 'En Vercel el filesystem es efímero — las imágenes no persisten',
      status: statusFromCheck(uploadsBackendCheck?.status ?? 'ok'),
      detail: uploadsBackendCheck?.detail ?? 'Local',
      action: uploadsBackendCheck?.status === 'warning' ? 'Migrar a S3/R2/Cloudinary para producción en Vercel' : undefined,
    },
    {
      id: 'uploads_public',
      label: 'Acceso público a uploads',
      description: 'Requerido para publicación real en Mercado Libre',
      status: statusFromCheck(uploadsPublicCheck?.status ?? 'warning'),
      detail: uploadsPublicCheck?.detail ?? 'No disponible',
    },
  ];

  // ── Environment ───────────────────────────────────────────────────────────
  const envItems: ReadinessItem[] = [
    {
      id: 'env_environment',
      label: 'Entorno de ejecución',
      description: 'Verifica que el entorno detectado es el correcto',
      status: environment === 'production' ? 'ok' : environment === 'preview' ? 'warning' : 'warning',
      detail: environment === 'production'
        ? 'Entorno de producción detectado (VERCEL_ENV=production)'
        : environment === 'preview'
        ? 'Entorno preview detectado (VERCEL_ENV=preview) — adecuado para testing, no para tráfico real'
        : 'Entorno local detectado — no es un deployment de Vercel',
    },
    {
      id: 'env_ml_redirect',
      label: 'MERCADOLIBRE_REDIRECT_URI',
      description: 'Debe coincidir exactamente con la URI registrada en la app ML',
      status: statusFromCheck(details.env.checks.find(c => c.id === 'MERCADOLIBRE_REDIRECT_URI')?.status ?? 'warning'),
      detail: details.env.checks.find(c => c.id === 'MERCADOLIBRE_REDIRECT_URI')?.detail ?? 'No configurado',
      action: !details.env.checks.find(c => c.id === 'MERCADOLIBRE_REDIRECT_URI' && c.status === 'ok')
        ? 'Debe ser: https://tu-dominio.vercel.app/api/ml/callback'
        : undefined,
    },
  ];

  return [
    { id: 'database', title: 'Base de datos', icon: Database, items: dbItems },
    { id: 'auth', title: 'Autenticación', icon: Lock, items: authItems },
    { id: 'mercadolibre', title: 'Mercado Libre', icon: Zap, items: mlItems },
    { id: 'images', title: 'Imágenes', icon: ImageIcon, items: imageItems },
    { id: 'environment', title: 'Entorno', icon: Globe, items: envItems },
  ];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ReadinessStatus }) {
  if (status === 'ok') return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
  if (status === 'warning') return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
  return <XCircle size={16} className="text-red-500 shrink-0" />;
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="mt-0.5 shrink-0">
        <StatusDot status={item.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{item.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
        <p className={cn(
          'text-xs mt-1 leading-snug',
          item.status === 'ok' ? 'text-emerald-700' :
          item.status === 'warning' ? 'text-amber-700' : 'text-red-700'
        )}>{item.detail}</p>
        {item.action && (
          <p className="text-xs text-indigo-600 mt-1 font-medium">
            {item.actionHref ? (
              <a href={item.actionHref} target={item.actionHref.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="hover:underline">
                → {item.action}
              </a>
            ) : (
              <span>→ {item.action}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function ReadinessGroupCard({ group }: { group: ReadinessGroup }) {
  const Icon = group.icon;
  const blockingCount = group.items.filter(i => i.status === 'blocking').length;
  const warningCount = group.items.filter(i => i.status === 'warning').length;
  const allOk = blockingCount === 0 && warningCount === 0;
  const groupStatus: ReadinessStatus = blockingCount > 0 ? 'blocking' : warningCount > 0 ? 'warning' : 'ok';

  return (
    <div className={cn(
      'bg-white rounded-xl border p-5',
      groupStatus === 'blocking' ? 'border-red-200' :
      groupStatus === 'warning' ? 'border-amber-200' :
      'border-gray-100'
    )}>
      <div className="flex items-center gap-2.5 mb-3">
        <Icon size={15} className={cn(
          groupStatus === 'blocking' ? 'text-red-500' :
          groupStatus === 'warning' ? 'text-amber-500' : 'text-emerald-500'
        )} />
        <span className="text-sm font-semibold text-gray-800">{group.title}</span>
        {!allOk && (
          <span className={cn(
            'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
            groupStatus === 'blocking' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          )}>
            {blockingCount > 0 ? `${blockingCount} bloqueante${blockingCount > 1 ? 's' : ''}` : `${warningCount} advertencia${warningCount > 1 ? 's' : ''}`}
          </span>
        )}
        {allOk && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
      </div>
      <div>
        {group.items.map(item => (
          <ReadinessRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// ── Score banner ──────────────────────────────────────────────────────────────

function ScoreBanner({ groups, environment }: { groups: ReadinessGroup[]; environment: 'local' | 'preview' | 'production' }) {
  const allItems = groups.flatMap(g => g.items);
  const blockingCount = allItems.filter(i => i.status === 'blocking').length;
  const warningCount = allItems.filter(i => i.status === 'warning').length;
  const okCount = allItems.filter(i => i.status === 'ok').length;

  const readyForProduction = blockingCount === 0;
  const readyForRealPublish = blockingCount === 0 && warningCount === 0;

  return (
    <div className={cn(
      'rounded-xl border-2 p-5',
      blockingCount > 0 ? 'bg-red-50 border-red-300' :
      warningCount > 0 ? 'bg-amber-50 border-amber-300' :
      'bg-emerald-50 border-emerald-300'
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {blockingCount > 0
            ? <AlertCircle size={20} className="text-red-600 shrink-0" />
            : warningCount > 0
            ? <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            : <ShieldCheck size={20} className="text-emerald-600 shrink-0" />}
        </div>
        <div className="flex-1">
          <p className={cn(
            'font-bold text-base',
            blockingCount > 0 ? 'text-red-800' :
            warningCount > 0 ? 'text-amber-800' : 'text-emerald-800'
          )}>
            {blockingCount > 0
              ? `${blockingCount} problema${blockingCount > 1 ? 's' : ''} bloqueante${blockingCount > 1 ? 's' : ''} — no listo para producción`
              : warningCount > 0
              ? `Listo para deploy con ${warningCount} advertencia${warningCount > 1 ? 's' : ''}`
              : 'Todo listo para producción'}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 size={13} />{okCount} OK
            </span>
            {warningCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertTriangle size={13} />{warningCount} advertencia{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {blockingCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-700">
                <XCircle size={13} />{blockingCount} bloqueante{blockingCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
              readyForProduction ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            )}>
              <Server size={10} />
              {readyForProduction ? 'Deploy: listo' : 'Deploy: bloqueado'}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
              readyForRealPublish ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            )}>
              <Zap size={10} />
              {readyForRealPublish ? 'Publicación real: lista' : 'Publicación real: requiere atención'}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
              environment === 'production' ? 'bg-indigo-100 text-indigo-700' :
              environment === 'preview' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            )}>
              <Globe size={10} />
              {environment === 'production' ? 'Producción' : environment === 'preview' ? 'Preview' : 'Local'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductionReadiness() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data as HealthResponse);
      setLastRefresh(new Date());
    } catch {
      setError('No se pudo conectar al endpoint de salud');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const groups = health ? buildReadinessGroups(health) : [];

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50">
            <ClipboardCheck size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Checklist de producción</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Verificando...' :
               lastRefresh ? `Última verificación: ${lastRefresh.toLocaleTimeString('es-AR')}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Loading */}
      {loading && !health && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Ejecutando verificaciones...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-700">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {health && (
        <>
          {/* Score banner */}
          <ScoreBanner groups={groups} environment={health.environment} />

          {/* Vercel ephemeral filesystem warning */}
          {health.details.uploads.checks.find(c => c.id === 'backend' && c.status === 'warning') && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <HardDrive size={15} className="text-amber-600 shrink-0" />
                <p className="text-sm font-bold text-amber-700">AVISO: Filesystem efímero en Vercel</p>
              </div>
              <p className="text-xs text-amber-700 leading-snug">
                En Vercel (serverless), los archivos subidos al filesystem local se pierden entre invocaciones de función.
                Las imágenes subidas via la UI <strong>no son persistentes</strong>.
                Para producción real, migrá a un proveedor de almacenamiento en la nube:
                <strong> S3, Cloudflare R2, o Cloudinary</strong>.
              </p>
              <p className="text-xs text-amber-600 font-medium">
                Mientras tanto: usá solo URLs HTTPS externas en los productos, o configurá
                <code className="bg-amber-100 px-1 rounded font-mono mx-0.5">IMAGE_PUBLIC_BASE_URL</code>
                apuntando a tu servidor con disco persistente.
              </p>
            </div>
          )}

          {/* Checklist groups */}
          <div className="space-y-3">
            {groups.map(group => (
              <ReadinessGroupCard key={group.id} group={group} />
            ))}
          </div>

          {/* Footer links */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-100">
            <a href="/settings/system" className="hover:text-indigo-500 transition-colors">
              Estado del sistema →
            </a>
            <a href="/settings/mercadolibre" className="hover:text-indigo-500 transition-colors">
              Configuración ML →
            </a>
            <a href="/api/health" target="_blank" rel="noreferrer" className="hover:text-indigo-500 transition-colors">
              /api/health ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
