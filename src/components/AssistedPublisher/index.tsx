'use client';

import { useState, useCallback } from 'react';
import type { InferenceResult, MLPayload, MissingField, ProductDraft } from '@/types';
import { inferProduct } from '@/lib/inference';
import { buildMLPayload, buildProductDraft } from '@/lib/payload-builder';
import { getMissingFields } from '@/lib/validation';
import { InputStep } from './InputStep';
import { ReviewStep } from './ReviewStep';

type Step = 'input' | 'inferring' | 'review';

export function AssistedPublisher() {
  const [step, setStep] = useState<Step>('input');
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [payload, setPayload] = useState<MLPayload | null>(null);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);

  const handleInput = useCallback(async (input: string) => {
    setStep('inferring');
    try {
      const result = await inferProduct(input);
      const newDraft = buildProductDraft(result);
      const newPayload = buildMLPayload(newDraft);
      const missing = getMissingFields(newDraft);

      setInference(result);
      setDraft(newDraft);
      setPayload(newPayload);
      setMissingFields(missing);
      setStep('review');
    } catch {
      setStep('input');
    }
  }, []);

  const handleFieldChange = useCallback((id: string, value: string | number) => {
    if (!draft || !inference) return;

    const fieldMap: Record<string, keyof ProductDraft> = {
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
      description: 'description',
      sku: 'sku',
    };

    const key = fieldMap[id.toLowerCase()];
    const updatedDraft = key
      ? { ...draft, [key]: value }
      : { ...draft };

    if (id === 'images') {
      const urlStr = String(value);
      updatedDraft.images = urlStr.split(',').map((u) => u.trim()).filter(Boolean);
    }

    const newPayload = buildMLPayload(updatedDraft);
    const newMissing = getMissingFields(updatedDraft);

    setDraft(updatedDraft);
    setPayload(newPayload);
    setMissingFields(newMissing);
  }, [draft, inference]);

  const handleBack = useCallback(() => {
    setStep('input');
    setInference(null);
    setDraft(null);
    setPayload(null);
    setMissingFields([]);
  }, []);

  if (step === 'input' || step === 'inferring') {
    return <InputStep onSubmit={handleInput} isLoading={step === 'inferring'} />;
  }

  if (step === 'review' && inference && draft && payload) {
    return (
      <ReviewStep
        inference={inference}
        draft={draft}
        payload={payload}
        missingFields={missingFields}
        onBack={handleBack}
        onFieldChange={handleFieldChange}
        onDraftFieldChange={handleFieldChange}
      />
    );
  }

  return null;
}
