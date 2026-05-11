'use client';

import { useState } from 'react';
import { BookTemplate, Loader2, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { useToast } from '@/components/Toast';
import type { ProductDraft } from '@/types';

interface SaveTemplateModalProps {
  draft: ProductDraft;
  onClose: () => void;
}

export function SaveTemplateModal({ draft, onClose }: SaveTemplateModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(`Plantilla ${draft.applianceType}`);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          applianceType: draft.applianceType,
          templateData: {
            brand: draft.brand,
            model: draft.model,
            condition: draft.condition,
            currency: draft.currency,
            warranty: draft.warranty,
            listingType: draft.listingType,
            shipping: draft.shipping,
            voltage: draft.voltage,
            color: draft.color,
          },
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast('Plantilla guardada', 'success');
        setTimeout(onClose, 800);
      } else {
        toast('Error al guardar plantilla', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = cn(
    'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200',
    'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookTemplate size={18} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900">Guardar como plantilla</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nombre de la plantilla</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Heladeras Samsung usadas"
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Se guardarán: marca, condición, tipo de publicación, envío, garantía y otros datos reutilizables.
          El precio y el título <strong>no</strong> se incluyen.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Guardando...</>
            ) : saved ? (
              <><CheckCircle2 size={14} /> Guardado</>
            ) : (
              <><BookTemplate size={14} /> Guardar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
