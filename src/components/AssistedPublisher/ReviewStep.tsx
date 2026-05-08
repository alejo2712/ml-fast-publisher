'use client';

import type { InferenceResult, MLPayload, MissingField, ProductDraft } from '@/types';
import { ArrowLeft, RefreshCw, Layers } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui';
import { ProductPreview } from '@/components/ProductPreview';
import { MissingFields } from '@/components/MissingFields';
import { JsonPreview } from '@/components/JsonPreview';

type Tab = 'preview' | 'missing' | 'json';

interface ReviewStepProps {
  inference: InferenceResult;
  draft: ProductDraft;
  payload: MLPayload;
  missingFields: MissingField[];
  onBack: () => void;
  onFieldChange: (id: string, value: string | number) => void;
  onDraftFieldChange: (field: string, value: string | number) => void;
}

export function ReviewStep({
  inference,
  draft,
  payload,
  missingFields,
  onBack,
  onFieldChange,
  onDraftFieldChange,
}: ReviewStepProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'preview', label: 'Vista previa' },
    { id: 'missing', label: 'Campos faltantes', count: missingFields.length || undefined },
    { id: 'json', label: 'JSON (ML)' },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
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
          Analizado: <span className="text-gray-700 font-medium truncate max-w-[200px]">{inference.rawInput}</span>
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
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                tab.count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              )}>
                {tab.count > 0 ? tab.count : '✓'}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'preview' && (
          <ProductPreview
            inference={inference}
            draft={draft}
            onFieldEdit={onDraftFieldChange}
          />
        )}
        {activeTab === 'missing' && (
          <MissingFields
            fields={missingFields}
            draft={draft}
            onChange={onFieldChange}
          />
        )}
        {activeTab === 'json' && (
          <JsonPreview payload={payload} />
        )}
      </div>
    </div>
  );
}
