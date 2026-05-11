'use client';

import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
import type { InferenceResult, MLPayload, ProductDraft } from '@/types';
import type { ValidationResult } from '@/lib/validation';
import { inferProduct } from '@/lib/inference';
import { buildMLPayload, buildProductDraft } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import { useAutosave } from '@/hooks/useAutosave';
import { useToast } from '@/components/Toast';
import { InputStep } from './InputStep';
import { ReviewStep } from './ReviewStep';
import type { SellerPrefs } from '@/components/SettingsForm';

type Step = 'input' | 'inferring' | 'review';

const FIELD_MAP: Record<string, keyof ProductDraft> = {
  title: 'title', brand: 'brand', model: 'model', condition: 'condition',
  price: 'price', stock: 'stock', color: 'color', voltage: 'voltage',
  capacity: 'capacity', power_consumption: 'watts', cooling_type: 'technology',
  type: 'technology', description: 'description', sku: 'sku',
};

function applyPreferences(draft: ProductDraft, prefs: SellerPrefs): ProductDraft {
  return {
    ...draft,
    currency: (prefs.defaultCurrency as ProductDraft['currency']) || draft.currency,
    condition: (prefs.defaultCondition as ProductDraft['condition']) || draft.condition,
    warranty: prefs.defaultWarranty || draft.warranty,
    listingType: (prefs.defaultListingType as ProductDraft['listingType']) || draft.listingType,
    shipping: {
      ...draft.shipping,
      mode: (prefs.defaultShipping as ProductDraft['shipping']['mode']) || draft.shipping.mode,
      localPickUp: prefs.localPickUp ?? draft.shipping.localPickUp,
    },
  };
}

export function AssistedPublisher() {
  const [step, setStep] = useState<Step>('input');
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [payload, setPayload] = useState<MLPayload | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<SellerPrefs | null>(null);
  const { toast } = useToast();

  // Load seller preferences on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setPrefs({
          defaultCurrency: data.defaultCurrency,
          defaultShipping: data.defaultShipping,
          defaultWarranty: data.defaultWarranty ?? '',
          localPickUp: data.localPickUp,
          defaultCondition: data.defaultCondition ?? '',
          defaultListingType: data.defaultListingType,
        });
      })
      .catch(() => {});
  }, []);

  const { state: saveState, savedAt } = useAutosave({
    draft,
    draftId,
    enabled: step === 'review',
    onSaved(id) { setDraftId(id); },
  });

  const handleInput = useCallback(async (input: string) => {
    setStep('inferring');
    try {
      const result = await inferProduct(input);
      let newDraft = buildProductDraft(result);
      if (prefs) newDraft = applyPreferences(newDraft, prefs);
      const newPayload = buildMLPayload(newDraft);
      const newValidation = validateDraft(newDraft);

      setInference(result);
      setDraft(newDraft);
      setPayload(newPayload);
      setValidation(newValidation);
      setStep('review');
    } catch {
      toast('Error al procesar el producto. Intentá de nuevo.', 'error');
      setStep('input');
    }
  }, [toast, prefs]);

  const handleFieldChange = useCallback((id: string, value: string | number) => {
    if (!draft) return;

    const key = FIELD_MAP[id.toLowerCase()];
    let updatedDraft: ProductDraft = key ? { ...draft, [key]: value } : { ...draft };

    if (id === 'images') {
      updatedDraft.images = String(value).split(',').map((u) => u.trim()).filter(Boolean);
    }

    const newPayload = buildMLPayload(updatedDraft);
    const newValidation = validateDraft(updatedDraft);

    setDraft(updatedDraft);
    setPayload(newPayload);
    setValidation(newValidation);
  }, [draft]);

  const handleBack = useCallback(() => {
    setStep('input');
    setInference(null);
    setDraft(null);
    setPayload(null);
    setValidation(null);
    setDraftId(null);
  }, []);

  if (step === 'input' || step === 'inferring') {
    return <InputStep onSubmit={handleInput} isLoading={step === 'inferring'} />;
  }

  if (step === 'review' && inference && draft && payload && validation) {
    return (
      <div className="w-full">
        {/* Autosave indicator */}
        {saveState !== 'idle' && (
          <div className="flex justify-end mb-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              {saveState === 'saving' || saveState === 'dirty' ? (
                <><Loader2 size={12} className="animate-spin" /> Guardando...</>
              ) : saveState === 'saved' ? (
                <><CheckCircle2 size={12} className="text-emerald-500" />
                  Guardado{savedAt ? ` · ${savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}</>
              ) : (
                <><AlertCircle size={12} className="text-amber-500" /> Sin guardar</>
              )}
            </span>
          </div>
        )}
        <ReviewStep
          inference={inference}
          draft={draft}
          payload={payload}
          validation={validation}
          draftId={draftId}
          onBack={handleBack}
          onFieldChange={handleFieldChange}
        />
      </div>
    );
  }

  return null;
}
