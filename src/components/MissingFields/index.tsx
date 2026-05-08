'use client';

import type { MissingField, ProductDraft } from '@/types';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/components/ui';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};

interface MissingFieldsProps {
  fields: MissingField[];
  draft: ProductDraft;
  onChange: (id: string, value: string | number) => void;
}

export function MissingFields({ fields, draft, onChange }: MissingFieldsProps) {
  if (fields.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
        <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
        <p className="text-emerald-700 font-medium text-sm">
          ¡Todo completo! Tu publicación está lista para exportar.
        </p>
      </div>
    );
  }

  function getCurrentValue(id: string): string | number {
    const draft_map: Record<string, keyof ProductDraft> = {
      title: 'title',
      brand: 'brand',
      model: 'model',
      condition: 'condition',
      price: 'price',
      stock: 'stock',
      color: 'color',
      voltage: 'voltage',
      capacity: 'capacity',
      power_consumption: 'watts',
      cooling_type: 'technology',
      type: 'technology',
      images: 'images',
    };
    const key = draft_map[id.toLowerCase()];
    if (!key) return '';
    const val = draft[key];
    if (Array.isArray(val)) return (val as string[]).join(', ');
    return (val as string | number | undefined) ?? '';
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600">
        <AlertCircle size={16} />
        <span className="text-sm font-semibold">
          {fields.length} campo{fields.length > 1 ? 's' : ''} requerido{fields.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid gap-3">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-400 text-xs">*</span>}
              {field.unit && <span className="text-gray-400 text-xs">({field.unit})</span>}
            </label>

            {field.type === 'select' && field.options ? (
              <select
                value={String(getCurrentValue(field.id))}
                onChange={(e) => onChange(field.id, e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200',
                  'focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50',
                  'bg-white text-gray-900'
                )}
              >
                <option value="">Seleccionar...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {field.id === 'condition' ? (CONDITION_LABELS[opt] || opt) : opt}
                  </option>
                ))}
              </select>
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={String(getCurrentValue(field.id))}
                onChange={(e) => onChange(field.id, parseFloat(e.target.value) || 0)}
                placeholder={field.placeholder}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200',
                  'focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50',
                  'bg-white text-gray-900'
                )}
              />
            ) : (
              <input
                type="text"
                value={String(getCurrentValue(field.id))}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200',
                  'focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50',
                  'bg-white text-gray-900'
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
