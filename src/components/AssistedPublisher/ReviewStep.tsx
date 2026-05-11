'use client';

import type { InferenceResult, MLPayload, ProductDraft } from '@/types';
import type { ValidationResult } from '@/lib/validation';
import { ArrowLeft, RefreshCw, BookTemplate } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui';
import { ProductPreview } from '@/components/ProductPreview';
import { MissingFields } from '@/components/MissingFields';
import { JsonPreview } from '@/components/JsonPreview';
import { PublishButton } from '@/components/PublishButton';
import { SaveTemplateModal } from './SaveTemplateModal';

type Tab = 'preview' | 'missing' | 'json';

interface ReviewStepProps {
  inference: InferenceResult;
  draft: ProductDraft;
  payload: MLPayload;
  validation: ValidationResult;
  draftId: string | null;
  onBack: () => void;
  onFieldChange: (id: string, value: string | number) => void;
}

export function ReviewStep({
  inference,
  draft,
  payload,
  validation,
  onBack,
  onFieldChange,
}: ReviewStepProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const problemCount = validation.missingFields.length + validation.fieldErrors.length;

  const tabs: { id: Tab; label: string; badge?: string; badgeColor?: string }[] = [
    { id: 'preview', label: 'Vista previa' },
    {
      id: 'missing',
      label: 'Validación',
      badge: validation.isReady ? '✓' : String(problemCount),
      badgeColor: validation.isReady ? 'bg-emerald-100 text-emerald-700' : validation.status === 'invalid' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
    },
    { id: 'json', label: 'JSON (ML)' },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Nuevo producto
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw size={14} className="text-indigo-400" />
            <span className="truncate max-w-[180px]">{inference.rawInput}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveTemplate(true)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all font-medium"
          >
            <BookTemplate size={13} />
            Guardar plantilla
          </button>
          <PublishButton payload={payload} isReady={validation.isReady} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            {tab.badge && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold', tab.badgeColor)}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'preview' && (
          <ProductPreview inference={inference} draft={draft} onFieldEdit={onFieldChange} />
        )}
        {activeTab === 'missing' && (
          <MissingFields validation={validation} draft={draft} onChange={onFieldChange} />
        )}
        {activeTab === 'json' && (
          <JsonPreview payload={payload} />
        )}
      </div>

      {showSaveTemplate && (
        <SaveTemplateModal draft={draft} onClose={() => setShowSaveTemplate(false)} />
      )}
    </div>
  );
}
