'use client';

import type { InferenceResult, MLPayload, ProductDraft } from '@/types';
import type { ValidationResult } from '@/lib/validation';
import { ArrowLeft, RefreshCw, BookTemplate, ImageIcon, AlertTriangle } from 'lucide-react';
import { isLocalImagePath } from '@/lib/images/prepare-images';
import { useState } from 'react';
import { cn } from '@/components/ui';
import { ProductPreview } from '@/components/ProductPreview';
import { MissingFields } from '@/components/MissingFields';
import { JsonPreview } from '@/components/JsonPreview';
import { PublishButton } from '@/components/PublishButton';
import { ImageUploader } from '@/components/ImageUploader';
import { SaveTemplateModal } from './SaveTemplateModal';

type Tab = 'preview' | 'missing' | 'json';

interface ReviewStepProps {
  inference: InferenceResult;
  draft: ProductDraft;
  payload: MLPayload;
  validation: ValidationResult;
  draftId: string | null;
  templateName?: string | null;
  onBack: () => void;
  onFieldChange: (id: string, value: string | number) => void;
  onImagesChange: (images: string[]) => void;
}

export function ReviewStep({
  inference,
  draft,
  payload,
  validation,
  templateName,
  onBack,
  onFieldChange,
  onImagesChange,
}: ReviewStepProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const hasLocalImages = draft.images.some(isLocalImagePath);
  const problemCount = validation.missingFields.length + validation.fieldErrors.length;

  const tabs: { id: Tab; label: string; badge?: string; badgeColor?: string }[] = [
    { id: 'preview', label: 'Vista previa' },
    {
      id: 'missing',
      label: 'Validación',
      badge: validation.isReady ? '✓' : String(problemCount),
      badgeColor: validation.isReady
        ? 'bg-emerald-100 text-emerald-700'
        : validation.status === 'invalid'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700',
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
          {templateName && (
            <span className="text-xs bg-violet-50 text-violet-600 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
              Plantilla: {templateName}
            </span>
          )}
          <button
            onClick={() => setShowSaveTemplate(true)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all font-medium"
          >
            <BookTemplate size={13} />
            Guardar plantilla
          </button>
          <PublishButton payload={payload} isReady={validation.isReady} hasLocalImages={hasLocalImages} />
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

      {/* Images — always visible, not tab-gated */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ImageIcon size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Fotos del producto</span>
          {validation.missingFields.some((f) => f.id === 'images') && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Requerida
            </span>
          )}
          {validation.fieldErrors.some((f) => f.id === 'images') && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              Inválida
            </span>
          )}
        </div>

        {/* Local images warning — shown whenever local paths are present */}
        {hasLocalImages && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs">
            <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-700">Imágenes locales detectadas</p>
              <p className="text-amber-600">
                Las fotos subidas desde tu equipo (<code className="bg-amber-100 px-0.5 rounded">/uploads/...</code>) solo funcionan en{' '}
                <strong>dry-run</strong>. Para publicar en Mercado Libre de verdad, usá URLs HTTPS públicas
                o configurá <code className="bg-amber-100 px-0.5 rounded">IMAGE_PUBLIC_BASE_URL</code> en tu entorno.
              </p>
            </div>
          </div>
        )}

        <ImageUploader images={draft.images} onChange={onImagesChange} />
      </div>

      {showSaveTemplate && (
        <SaveTemplateModal draft={draft} onClose={() => setShowSaveTemplate(false)} />
      )}
    </div>
  );
}
