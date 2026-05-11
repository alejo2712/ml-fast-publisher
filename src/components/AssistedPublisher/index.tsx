'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { Condition, InferenceResult, ListingType, MLPayload, ProductDraft, ShippingMode } from '@/types';
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

/** Fields that can be patched via MissingFields / ProductPreview text inputs */
const FIELD_MAP: Record<string, keyof ProductDraft> = {
  title: 'title', brand: 'brand', model: 'model', condition: 'condition',
  price: 'price', stock: 'stock', color: 'color', voltage: 'voltage',
  capacity: 'capacity', power_consumption: 'watts', cooling_type: 'technology',
  type: 'technology', description: 'description', sku: 'sku',
};

/** Apply seller preferences as fallback defaults (prefs win for currency/listingType/shipping) */
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

interface TemplateData {
  brand?: string;
  model?: string;
  condition?: string;
  currency?: string;
  warranty?: string;
  listingType?: string;
  shipping?: { mode: string; localPickUp: boolean; freeShipping: boolean };
  voltage?: string;
  color?: string;
}

/**
 * Fill blank draft fields from template data.
 * Inference-derived values always win; template only fills in what inference couldn't detect.
 */
function applyTemplateFallback(draft: ProductDraft, t: TemplateData): ProductDraft {
  return {
    ...draft,
    brand: draft.brand || t.brand,
    model: draft.model || t.model,
    condition: draft.condition || (t.condition as Condition | undefined),
    // currency is handled by prefs — don't touch here
    warranty: draft.warranty || t.warranty,
    listingType: (t.listingType as ListingType) || draft.listingType,
    shipping: t.shipping
      ? {
          mode: (t.shipping.mode as ShippingMode) || draft.shipping.mode,
          localPickUp: t.shipping.localPickUp ?? draft.shipping.localPickUp,
          freeShipping: t.shipping.freeShipping ?? draft.shipping.freeShipping,
        }
      : draft.shipping,
    voltage: draft.voltage || t.voltage,
    color: draft.color || t.color,
  };
}

export function AssistedPublisher() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');

  const [step, setStep] = useState<Step>('input');
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [payload, setPayload] = useState<MLPayload | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<SellerPrefs | null>(null);
  const [template, setTemplate] = useState<{ id: string; name: string; data: TemplateData } | null>(null);
  const [templateCleared, setTemplateCleared] = useState(false);
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

  // Load template from URL param
  useEffect(() => {
    if (!templateId || templateCleared) return;

    fetch(`/api/templates/${templateId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.templateData) {
          setTemplate({ id: data.id, name: data.name, data: data.templateData as TemplateData });
        }
      })
      .catch(() => {});
  }, [templateId, templateCleared]);

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

      // 1. Apply template fallback (inference wins over template)
      if (template) newDraft = applyTemplateFallback(newDraft, template.data);

      // 2. Apply seller preferences (currency/listing type always from prefs)
      if (prefs) newDraft = applyPreferences(newDraft, prefs);

      // Increment useCount when template is actually used to start a flow
      if (template) {
        fetch(`/api/templates/${template.id}`, { method: 'POST' }).catch(() => {});
      }

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
  }, [toast, prefs, template]);

  const handleFieldChange = useCallback((id: string, value: string | number) => {
    if (!draft) return;

    const key = FIELD_MAP[id.toLowerCase()];
    const updatedDraft: ProductDraft = key ? { ...draft, [key]: value } : { ...draft };

    const newPayload = buildMLPayload(updatedDraft);
    const newValidation = validateDraft(updatedDraft);

    setDraft(updatedDraft);
    setPayload(newPayload);
    setValidation(newValidation);
  }, [draft]);

  const handleImagesChange = useCallback((images: string[]) => {
    if (!draft) return;
    const updatedDraft = { ...draft, images };
    setDraft(updatedDraft);
    setPayload(buildMLPayload(updatedDraft));
    setValidation(validateDraft(updatedDraft));
  }, [draft]);

  const handleBack = useCallback(() => {
    setStep('input');
    setInference(null);
    setDraft(null);
    setPayload(null);
    setValidation(null);
    setDraftId(null);
  }, []);

  const handleClearTemplate = useCallback(() => {
    setTemplate(null);
    setTemplateCleared(true);
  }, []);

  if (step === 'input' || step === 'inferring') {
    return (
      <InputStep
        onSubmit={handleInput}
        isLoading={step === 'inferring'}
        templateName={template?.name}
        onClearTemplate={handleClearTemplate}
      />
    );
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
          templateName={template?.name}
          onBack={handleBack}
          onFieldChange={handleFieldChange}
          onImagesChange={handleImagesChange}
        />
      </div>
    );
  }

  return null;
}
