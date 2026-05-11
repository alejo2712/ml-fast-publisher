'use client';

import { useState, useCallback, useRef } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { InferenceResult, MLPayload, ProductDraft } from '@/types';
import type { ValidationResult } from '@/lib/validation';
import { inferProduct } from '@/lib/inference';
import { buildMLPayload, buildProductDraft } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import { useAutosave } from '@/hooks/useAutosave';
import { useToast } from '@/components/Toast';
import { InputStep } from './InputStep';
import { ReviewStep } from './ReviewStep';

type Step = 'input' | 'inferring' | 'review';
type SaveState = 'idle' | 'saving' | 'saved';

const FIELD_MAP: Record<string, keyof ProductDraft> = {
  title: 'title', brand: 'brand', model: 'model', condition: 'condition',
  price: 'price', stock: 'stock', color: 'color', voltage: 'voltage',
  capacity: 'capacity', power_consumption: 'watts', cooling_type: 'technology',
  type: 'technology', description: 'description', sku: 'sku',
};

export function AssistedPublisher() {
  const [step, setStep] = useState<Step>('input');
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [payload, setPayload] = useState<MLPayload | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  function triggerSaveIndicator() {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveState('saved'), 1800);
  }

  useAutosave({
    draft,
    draftId,
    enabled: step === 'review',
    onSaved(id) {
      setDraftId(id);
      triggerSaveIndicator();
    },
  });

  const handleInput = useCallback(async (input: string) => {
    setStep('inferring');
    try {
      const result = await inferProduct(input);
      const newDraft = buildProductDraft(result);
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
  }, [toast]);

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
    triggerSaveIndicator();
  }, [draft]);

  const handleBack = useCallback(() => {
    setStep('input');
    setInference(null);
    setDraft(null);
    setPayload(null);
    setValidation(null);
    setDraftId(null);
    setSaveState('idle');
  }, []);

  if (step === 'input' || step === 'inferring') {
    return <InputStep onSubmit={handleInput} isLoading={step === 'inferring'} />;
  }

  if (step === 'review' && inference && draft && payload && validation) {
    return (
      <div className="w-full">
        {saveState !== 'idle' && (
          <div className="flex justify-end mb-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              {saveState === 'saving' ? (
                <><Loader2 size={12} className="animate-spin" /> Guardando...</>
              ) : (
                <><CheckCircle2 size={12} className="text-emerald-500" /> Guardado</>
              )}
            </span>
          </div>
        )}
        <ReviewStep
          inference={inference}
          draft={draft}
          payload={payload}
          validation={validation}
          onBack={handleBack}
          onFieldChange={handleFieldChange}
        />
      </div>
    );
  }

  return null;
}
