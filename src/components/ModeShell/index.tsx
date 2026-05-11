'use client';

import { Suspense, useState } from 'react';
import { Sparkles, Table2, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { AssistedPublisher } from '@/components/AssistedPublisher';
import { BulkUpload } from '@/components/BulkUpload';

type Mode = 'single' | 'bulk';

function AssistedPublisherFallback() {
  return (
    <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">Cargando...</span>
    </div>
  );
}

export function ModeShell() {
  const [mode, setMode] = useState<Mode>('single');

  return (
    <div className="space-y-6">
      {/* Mode switcher */}
      <div className="flex justify-center">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setMode('single')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              mode === 'single'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Sparkles size={14} />
            Un producto
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              mode === 'bulk'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Table2 size={14} />
            Carga masiva CSV
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        <Suspense fallback={<AssistedPublisherFallback />}>
          <AssistedPublisher />
        </Suspense>
      ) : (
        <BulkUpload />
      )}
    </div>
  );
}
