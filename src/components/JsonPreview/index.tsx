'use client';

import { Copy, Download, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui';

interface JsonPreviewProps {
  payload: unknown;
}

export function JsonPreview({ payload }: JsonPreviewProps) {
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(payload, null, 2);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-draft-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Payload Mercado Libre (JSON)
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              copied
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200'
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
          >
            <Download size={12} />
            Descargar
          </button>
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-gray-200">
        <div className="bg-gray-900 px-4 py-2 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <span className="text-xs text-gray-400 ml-1">ml-draft.json</span>
        </div>
        <pre className="bg-gray-950 text-gray-100 text-xs overflow-auto max-h-96 p-4 leading-relaxed">
          {json}
        </pre>
      </div>

      <p className="text-xs text-gray-400">
        Este JSON sigue la estructura de la API de Mercado Libre. Requiere autenticación OAuth para publicar.
      </p>
    </div>
  );
}
