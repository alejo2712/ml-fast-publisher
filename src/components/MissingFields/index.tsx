'use client';

import type { FieldError, ValidationResult } from '@/lib/validation';
import type { MissingField, ProductDraft } from '@/types';
import { AlertCircle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/components/ui';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};

interface MissingFieldsProps {
  validation: ValidationResult;
  draft: ProductDraft;
  onChange: (id: string, value: string | number) => void;
}

function StatusBanner({ validation }: { validation: ValidationResult }) {
  if (validation.isReady) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
        <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
        <div>
          <p className="text-emerald-700 font-semibold text-sm">Listo para publicar</p>
          <p className="text-emerald-600 text-xs mt-0.5">Todos los campos requeridos están completos y válidos.</p>
        </div>
      </div>
    );
  }
  if (validation.status === 'invalid') {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
        <XCircle className="text-red-500 shrink-0" size={20} />
        <div>
          <p className="text-red-700 font-semibold text-sm">Información inválida</p>
          <p className="text-red-600 text-xs mt-0.5">
            {validation.fieldErrors.length} campo{validation.fieldErrors.length > 1 ? 's tienen' : ' tiene'} valores incorrectos.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
      <AlertCircle className="text-amber-500 shrink-0" size={20} />
      <div>
        <p className="text-amber-700 font-semibold text-sm">Información faltante</p>
        <p className="text-amber-600 text-xs mt-0.5">
          {validation.missingFields.length} campo{validation.missingFields.length > 1 ? 's requeridos' : ' requerido'} sin completar.
        </p>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  currentValue,
  error,
  onChange,
}: {
  field: MissingField;
  currentValue: string | number;
  error?: FieldError;
  onChange: (id: string, value: string | number) => void;
}) {
  const hasError = !!error;
  const borderClass = hasError
    ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
    : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-50';

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
        {field.label}
        <span className="text-red-400 text-xs">*</span>
        {field.unit && <span className="text-gray-400 text-xs">({field.unit})</span>}
      </label>

      {field.type === 'select' && field.options ? (
        <select
          value={String(currentValue)}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={cn('w-full px-3 py-2 text-sm rounded-lg border bg-white text-gray-900 focus:outline-none focus:ring-2', borderClass)}
        >
          <option value="">Seleccionar...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {field.id === 'condition' ? (CONDITION_LABELS[opt] ?? opt) : opt}
            </option>
          ))}
        </select>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={currentValue === 0 ? '' : String(currentValue)}
          onChange={(e) => onChange(field.id, parseFloat(e.target.value) || 0)}
          placeholder={field.placeholder}
          min={0}
          className={cn('w-full px-3 py-2 text-sm rounded-lg border bg-white text-gray-900 focus:outline-none focus:ring-2', borderClass)}
        />
      ) : (
        <input
          type="text"
          value={String(currentValue)}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={cn('w-full px-3 py-2 text-sm rounded-lg border bg-white text-gray-900 focus:outline-none focus:ring-2', borderClass)}
        />
      )}

      {hasError && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <XCircle size={11} />
          {error!.message}
        </p>
      )}
    </div>
  );
}

export function MissingFields({ validation, draft, onChange }: MissingFieldsProps) {
  const { missingFields, fieldErrors, isReady } = validation;

  function getCurrentValue(id: string): string | number {
    const draftMap: Record<string, keyof ProductDraft> = {
      title: 'title', brand: 'brand', model: 'model', condition: 'condition',
      price: 'price', stock: 'stock', color: 'color', voltage: 'voltage',
      capacity: 'capacity', power_consumption: 'watts', cooling_type: 'technology',
      type: 'technology', description: 'description', images: 'images',
    };
    const key = draftMap[id.toLowerCase()];
    if (!key) return '';
    const val = draft[key];
    if (Array.isArray(val)) return (val as string[]).join(', ');
    return (val as string | number | undefined) ?? '';
  }

  return (
    <div className="space-y-5">
      <StatusBanner validation={validation} />

      {/* Fields with invalid values — images handled by ImageUploader */}
      {fieldErrors.filter((e) => e.id !== 'images').length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
            Valores inválidos — corregir
          </p>
          <div className="grid gap-3">
            {fieldErrors.filter((e) => e.id !== 'images').map((err) => {
              // Build a minimal MissingField shape for the input renderer
              const asMissing: MissingField = {
                id: err.id,
                label: err.label,
                required: true,
                type: err.id === 'price' || err.id === 'stock' || err.id === 'capacity' || err.id === 'watts' ? 'number' : 'text',
              };
              if (err.id === 'condition') {
                asMissing.type = 'select';
                asMissing.options = ['new', 'used', 'refurbished'];
              }
              return (
                <FieldInput
                  key={err.id}
                  field={asMissing}
                  currentValue={getCurrentValue(err.id)}
                  error={err}
                  onChange={onChange}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Truly missing fields — images are handled by ImageUploader in the review step */}
      {missingFields.filter((f) => f.id !== 'images' && !fieldErrors.some((e) => e.id === f.id)).length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
            Campos requeridos faltantes
          </p>
          <div className="grid gap-3">
            {missingFields
              .filter((f) => f.id !== 'images' && !fieldErrors.some((e) => e.id === f.id))
              .map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  currentValue={getCurrentValue(field.id)}
                  onChange={onChange}
                />
              ))}
          </div>
        </div>
      )}
      {/* Images are handled by the dedicated ImageUploader section below the tabs */}
      {missingFields.some((f) => f.id === 'images') && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Agregá al menos una foto en la sección <strong>Fotos del producto</strong> que está debajo.
        </div>
      )}

      {isReady && (
        <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
          <Info size={13} className="mt-0.5 shrink-0" />
          Podés publicar directamente o revisar el JSON antes de hacerlo.
        </div>
      )}
    </div>
  );
}
