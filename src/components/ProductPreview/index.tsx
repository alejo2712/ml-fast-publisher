'use client';

import type { InferenceResult, ProductDraft } from '@/types';
import { Tag, Zap, Package, Thermometer, Palette, Settings, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/components/ui';
import { APPLIANCE_TYPE_LABELS } from '@/lib/inference/dictionaries';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};

const CONDITION_COLORS: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  used: 'bg-amber-50 text-amber-700 border-amber-200',
  refurbished: 'bg-blue-50 text-blue-700 border-blue-200',
};

interface InferenceChipProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  inferred?: boolean;
}

function InferenceChip({ label, value, icon, inferred }: InferenceChipProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm',
      inferred ? 'bg-indigo-50 border-indigo-100' : 'bg-gray-50 border-gray-100'
    )}>
      <span className="text-gray-400">{icon}</span>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className={cn('font-medium', inferred ? 'text-indigo-700' : 'text-gray-700')}>{value}</div>
      </div>
      {inferred && (
        <span className="ml-auto">
          <CheckCircle2 size={14} className="text-indigo-400" />
        </span>
      )}
    </div>
  );
}

interface ProductPreviewProps {
  inference: InferenceResult;
  draft: ProductDraft;
  onFieldEdit: (field: string, value: string) => void;
}

export function ProductPreview({ inference, draft, onFieldEdit }: ProductPreviewProps) {
  const typeLabel = APPLIANCE_TYPE_LABELS[inference.applianceType] || 'Electrodoméstico';
  const conditionLabel = draft.condition ? CONDITION_LABELS[draft.condition] : null;

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Título sugerido</span>
          {inference.confidence >= 0.7 && (
            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
              Inferido con {Math.round(inference.confidence * 100)}% confianza
            </span>
          )}
        </div>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => onFieldEdit('title', e.target.value)}
          maxLength={60}
          className={cn(
            'w-full px-4 py-3 font-semibold text-gray-900 text-base rounded-xl border-2 border-gray-100',
            'focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50',
            'bg-gray-50 hover:bg-white transition-colors'
          )}
        />
        <div className="text-xs text-gray-400 text-right">{draft.title.length}/60 caracteres</div>
      </div>

      {/* Detected chips */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Detectado automáticamente
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <InferenceChip
            label="Categoría"
            value={typeLabel}
            icon={<Package size={14} />}
            inferred={inference.applianceType !== 'unknown'}
          />
          {inference.brand && (
            <InferenceChip
              label="Marca"
              value={inference.brand}
              icon={<Tag size={14} />}
              inferred
            />
          )}
          {inference.condition && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm',
              CONDITION_COLORS[inference.condition] || 'bg-gray-50 border-gray-100'
            )}>
              <Circle size={8} className="fill-current" />
              <div>
                <div className="text-xs opacity-70">Condición</div>
                <div className="font-medium">{conditionLabel}</div>
              </div>
            </div>
          )}
          {inference.capacity && (
            <InferenceChip
              label="Capacidad"
              value={`${inference.capacity} ${inference.capacityUnit || 'L'}`}
              icon={<Thermometer size={14} />}
              inferred
            />
          )}
          {inference.color && (
            <InferenceChip
              label="Color"
              value={inference.color}
              icon={<Palette size={14} />}
              inferred
            />
          )}
          {inference.voltage && (
            <InferenceChip
              label="Voltaje"
              value={inference.voltage}
              icon={<Zap size={14} />}
              inferred
            />
          )}
          {inference.technology && (
            <InferenceChip
              label="Tecnología"
              value={inference.technology}
              icon={<Settings size={14} />}
              inferred
            />
          )}
          {inference.model && (
            <InferenceChip
              label="Modelo"
              value={inference.model}
              icon={<Tag size={14} />}
              inferred
            />
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Descripción</span>
        <textarea
          value={draft.description || ''}
          onChange={(e) => onFieldEdit('description', e.target.value)}
          rows={4}
          className={cn(
            'w-full px-4 py-3 text-sm text-gray-700 rounded-xl border-2 border-gray-100',
            'focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50',
            'bg-gray-50 hover:bg-white transition-colors resize-none'
          )}
          placeholder="Descripción del producto (se genera automáticamente si está vacío)"
        />
      </div>
    </div>
  );
}
