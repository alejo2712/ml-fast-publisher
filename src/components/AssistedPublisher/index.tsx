'use client';

import { useState, useCallback } from 'react';
import type { InferenceResult, MLPayload, ProductDraft } from '@/types';
import type { ValidationResult } from '@/lib/validation';
import { inferProduct } from '@/lib/inference';
import { buildMLPayload, buildProductDraft } from '@/lib/payload-builder';
import { validateDraft } from '@/lib/validation';
import { InputStep } from './InputStep';
import { ReviewStep } from './ReviewStep';

type Step = 'input' | 'inferring' | 'review';

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
      setStep('input');
    }
  }, []);

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
  }, []);

  if (step === 'input' || step === 'inferring') {
    return <InputStep onSubmit={handleInput} isLoading={step === 'inferring'} />;
  }

  if (step === 'review' && inference && draft && payload && validation) {
    return (
      <ReviewStep
        inference={inference}
        draft={draft}
        payload={payload}
        validation={validation}
        onBack={handleBack}
        onFieldChange={handleFieldChange}
      />
    );
  }

  return null;
}
