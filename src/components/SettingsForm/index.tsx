'use client';

import { useState } from 'react';
import { Save, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';

export interface SellerPrefs {
  defaultCurrency: string;
  defaultShipping: string;
  defaultWarranty: string;
  localPickUp: boolean;
  defaultCondition: string;
  defaultListingType: string;
}

interface SettingsFormProps {
  initial: SellerPrefs;
}

const CONDITION_OPTIONS = [
  { value: '', label: '— sin default —' },
  { value: 'new', label: 'Nuevo' },
  { value: 'used', label: 'Usado' },
  { value: 'refurbished', label: 'Reacondicionado' },
];

const LISTING_OPTIONS = [
  { value: 'gold_special', label: 'Gold Special (clásico)' },
  { value: 'gold_pro', label: 'Gold Pro' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'free', label: 'Gratis' },
];

const SHIPPING_OPTIONS = [
  { value: 'me2', label: 'Mercado Envíos (me2)' },
  { value: 'custom', label: 'Envío a acordar' },
  { value: 'not_specified', label: 'No especificado' },
];

export function SettingsForm({ initial }: SettingsFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<SellerPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof SellerPrefs>(key: K, value: SellerPrefs[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        toast('Preferencias guardadas', 'success');
      } else {
        toast('Error al guardar preferencias', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = cn(
    'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200',
    'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50',
    'bg-white text-gray-800'
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Default currency */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Moneda por defecto</label>
          <select
            value={form.defaultCurrency}
            onChange={(e) => update('defaultCurrency', e.target.value)}
            className={fieldClass}
          >
            <option value="ARS">ARS — Peso argentino</option>
            <option value="USD">USD — Dólar</option>
          </select>
        </div>

        {/* Default condition */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Condición por defecto</label>
          <select
            value={form.defaultCondition}
            onChange={(e) => update('defaultCondition', e.target.value)}
            className={fieldClass}
          >
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Default listing type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Tipo de publicación</label>
          <select
            value={form.defaultListingType}
            onChange={(e) => update('defaultListingType', e.target.value)}
            className={fieldClass}
          >
            {LISTING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Default shipping */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Envío por defecto</label>
          <select
            value={form.defaultShipping}
            onChange={(e) => update('defaultShipping', e.target.value)}
            className={fieldClass}
          >
            {SHIPPING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Default warranty */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-gray-700">Garantía por defecto</label>
          <input
            type="text"
            value={form.defaultWarranty}
            onChange={(e) => update('defaultWarranty', e.target.value)}
            placeholder="Ej: 12 meses, 6 meses de fábrica"
            className={fieldClass}
          />
          <p className="text-xs text-gray-400">Se aplicará automáticamente a todos los productos nuevos.</p>
        </div>
      </div>

      {/* Local pickup */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            type="checkbox"
            checked={form.localPickUp}
            onChange={(e) => update('localPickUp', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-gray-200 peer-checked:bg-indigo-600 rounded-full transition-colors" />
          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Habilitar retiro en persona</p>
          <p className="text-xs text-gray-400">Los productos nuevos tendrán retiro en persona activado.</p>
        </div>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {saving ? (
          <><Loader2 size={15} className="animate-spin" /> Guardando...</>
        ) : saved ? (
          <><CheckCircle2 size={15} /> Guardado</>
        ) : (
          <><Save size={15} /> Guardar preferencias</>
        )}
      </button>
    </form>
  );
}
