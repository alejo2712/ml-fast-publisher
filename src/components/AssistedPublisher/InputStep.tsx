'use client';

import { useState } from 'react';
import { Sparkles, ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '@/components/ui';

const EXAMPLES = [
  'Heladera Samsung no frost 320 litros blanca usada',
  'Lavarropas LG 8kg carga frontal nuevo 220v',
  'Microondas Samsung 28 litros negro 1200w',
  'Freidora de aire Philips 4 litros nueva',
  'Aspiradora Electrolux sin bolsa 1800w usada',
];

interface InputStepProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
}

export function InputStep({ onSubmit, isLoading }: InputStepProps) {
  const [input, setInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim().length > 2) onSubmit(input.trim());
  }

  function useExample(example: string) {
    setInput(example);
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto py-12">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full">
          <Sparkles size={14} />
          Publicación asistida
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          ¿Qué querés publicar?
        </h1>
        <p className="text-gray-500 text-lg">
          Describí tu producto y listo. Nosotros hacemos el resto.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: Heladera Samsung no frost 320 litros blanca usada"
            className={cn(
              'w-full min-h-[120px] px-5 py-4 text-base rounded-2xl border-2 border-gray-200',
              'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50',
              'resize-none transition-all placeholder:text-gray-400',
              'text-gray-900 bg-white shadow-sm'
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim().length > 2) onSubmit(input.trim());
              }
            }}
          />
          <div className="absolute bottom-3 right-3 text-xs text-gray-300">
            Enter para analizar
          </div>
        </div>

        <button
          type="submit"
          disabled={input.trim().length < 3 || isLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base transition-all',
            'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
          )}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analizando...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Analizar producto
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className="w-full space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Lightbulb size={14} />
          Ejemplos rápidos
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => useExample(ex)}
              className={cn(
                'text-sm px-3 py-1.5 rounded-lg border border-gray-200',
                'text-gray-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50',
                'transition-all cursor-pointer'
              )}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
