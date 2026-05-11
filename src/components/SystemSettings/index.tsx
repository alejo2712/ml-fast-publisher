'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, AlertCircle,
  RefreshCw, Loader2, Activity, Database, ShieldCheck,
  Zap, ImageIcon, Server, Info, HardDrive, Globe,
} from 'lucide-react';
import { cn } from '@/components/ui';

// ── Types (mirror DiagnosticsResult from server) ──────────────────────────────

type CheckStatus = 'ok' | 'warning' | 'error';

interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface SubsystemDiagnostic {
  status: CheckStatus;
  checks: DiagnosticCheck[];
}

interface DiagnosticsResult {
  status: CheckStatus;
  timestamp: string;
  version: string;
  environment: 'local' | 'preview' | 'production';
  env: SubsystemDiagnostic;
  database: SubsystemDiagnostic;
  auth: SubsystemDiagnostic;
  mercadolibre: SubsystemDiagnostic;
  imageHosting: SubsystemDiagnostic;
  uploads: SubsystemDiagnostic;
}

interface HealthResponse {
  status: CheckStatus;
  timestamp: string;
  version: string;
  environment: 'local' | 'preview' | 'production';
  warnings: string[];
  details: DiagnosticsResult;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
      status === 'ok' && 'bg-emerald-100 text-emerald-700',
      status === 'warning' && 'bg-amber-100 text-amber-700',
      status === 'error' && 'bg-red-100 text-red-700',
    )}>
      {status === 'ok' && <CheckCircle2 size={10} />}
      {status === 'warning' && <AlertTriangle size={10} />}
      {status === 'error' && <AlertCircle size={10} />}
      {status === 'ok' ? 'OK' : status === 'warning' ? 'ADVERTENCIA' : 'ERROR'}
    </span>
  );
}

function CheckRow({ check }: { check: DiagnosticCheck }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="mt-0.5 shrink-0">
        {check.status === 'ok'
          ? <CheckCircle2 size={14} className="text-emerald-500" />
          : check.status === 'warning'
          ? <AlertTriangle size={14} className="text-amber-500" />
          : <AlertCircle size={14} className="text-red-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono font-semibold text-gray-700">{check.label}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{check.detail}</p>
      </div>
    </div>
  );
}

function SubsystemCard({
  title,
  icon: Icon,
  subsystem,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  subsystem: SubsystemDiagnostic;
}) {
  const [expanded, setExpanded] = useState(subsystem.status !== 'ok');

  return (
    <div className={cn(
      'bg-white rounded-xl border p-5',
      subsystem.status === 'error' ? 'border-red-200' :
      subsystem.status === 'warning' ? 'border-amber-200' :
      'border-gray-100'
    )}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={15} className={cn(
            subsystem.status === 'error' ? 'text-red-500' :
            subsystem.status === 'warning' ? 'text-amber-500' :
            'text-emerald-500'
          )} />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={subsystem.status} />
          <span className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-gray-50 pt-3">
          {subsystem.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SystemSettings() {
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

  const overallStatus = health?.status ?? 'error';

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            overallStatus === 'error' ? 'bg-red-50' :
            overallStatus === 'warning' ? 'bg-amber-50' : 'bg-emerald-50'
          )}>
            <Activity size={18} className={cn(
              overallStatus === 'error' ? 'text-red-600' :
              overallStatus === 'warning' ? 'text-amber-600' : 'text-emerald-600'
            )} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Estado del sistema</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Actualizando...' :
               lastRefresh ? `Última actualización: ${lastRefresh.toLocaleTimeString('es-AR')}` : ''}
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
          Ejecutando diagnósticos...
        </div>
      )}

      {/* Fetch error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-700">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {health && (
        <>
          {/* Overall status banner */}
          <div className={cn(
            'rounded-xl border-2 p-4 flex items-center gap-3',
            health.status === 'ok' && 'bg-emerald-50 border-emerald-300',
            health.status === 'warning' && 'bg-amber-50 border-amber-300',
            health.status === 'error' && 'bg-red-50 border-red-300',
          )}>
            {health.status === 'ok'
              ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              : health.status === 'warning'
              ? <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              : <AlertCircle size={18} className="text-red-600 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-bold',
                health.status === 'ok' ? 'text-emerald-800' :
                health.status === 'warning' ? 'text-amber-800' : 'text-red-800'
              )}>
                {health.status === 'ok' ? 'Sistema operativo' :
                 health.status === 'warning' ? 'Sistema operativo con advertencias' :
                 'Sistema con errores críticos'}
              </p>
              {health.warnings.length > 0 && (
                <p className="text-xs mt-0.5 text-gray-600 truncate">
                  {health.warnings[0]}
                  {health.warnings.length > 1 && ` (+${health.warnings.length - 1} más)`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
              <span className={cn(
                'px-2 py-0.5 rounded-full font-semibold text-xs',
                health.environment === 'production' ? 'bg-indigo-100 text-indigo-700' :
                health.environment === 'preview' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
              )}>
                {health.environment === 'production' ? 'Producción' :
                 health.environment === 'preview' ? 'Preview' : 'Local'}
              </span>
              <span className="flex items-center gap-1"><Server size={12} />v{health.version}</span>
            </div>
          </div>

          {/* Real publish warning banner */}
          {health.details.mercadolibre.checks.some(
            c => c.id === 'dry_run' && c.status === 'warning'
          ) && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2">
                <Zap size={15} className="text-red-600 shrink-0" />
                <p className="text-sm font-bold text-red-700">PUBLICACIÓN REAL ACTIVA</p>
              </div>
              <p className="text-xs text-red-600 leading-snug">
                <code className="bg-red-100 px-1 rounded font-mono">MERCADOLIBRE_DRY_RUN=false</code> está configurado.
                Cualquier publicación crea ítems <strong>reales</strong> en Mercado Libre.
                Usá el preflight antes de cada publicación.
              </p>
            </div>
          )}

          {/* Subsystem cards */}
          <div className="space-y-3">
            <SubsystemCard
              title="Variables de entorno"
              icon={Info}
              subsystem={health.details.env}
            />
            <SubsystemCard
              title="Base de datos"
              icon={Database}
              subsystem={health.details.database}
            />
            <SubsystemCard
              title="Autenticación"
              icon={ShieldCheck}
              subsystem={health.details.auth}
            />
            <SubsystemCard
              title="Mercado Libre"
              icon={Zap}
              subsystem={health.details.mercadolibre}
            />
            <SubsystemCard
              title="Hosting de imágenes"
              icon={ImageIcon}
              subsystem={health.details.imageHosting}
            />
            <SubsystemCard
              title="Almacenamiento de uploads"
              icon={HardDrive}
              subsystem={health.details.uploads}
            />
          </div>

          {/* Build info */}
          <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-100 flex-wrap">
            <span>v{health.version}</span>
            <span>·</span>
            <span>{new Date(health.timestamp).toLocaleString('es-AR')}</span>
            <span>·</span>
            <a href="/api/health" target="_blank" rel="noreferrer" className="hover:text-indigo-500 transition-colors">
              /api/health ↗
            </a>
            <span>·</span>
            <a href="/settings/production-readiness" className="hover:text-indigo-500 transition-colors flex items-center gap-1">
              <Globe size={10} />
              Checklist de producción
            </a>
          </div>
        </>
      )}
    </div>
  );
}
