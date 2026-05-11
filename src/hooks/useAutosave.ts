'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ProductDraft } from '@/types';

export type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface AutosaveOptions {
  draft: ProductDraft | null;
  draftId: string | null;
  onSaved?: (id: string) => void;
  debounceMs?: number;
  /** Set to false if user is not authenticated (skips silently) */
  enabled?: boolean;
}

interface AutosaveReturn {
  savedIdRef: React.MutableRefObject<string | null>;
  state: AutosaveState;
  savedAt: Date | null;
}

/**
 * Debounced autosave hook.
 * - Creates the draft on first save (POST /api/drafts)
 * - Updates on subsequent saves (PATCH /api/drafts/[id])
 * - Skips write if draft content hasn't changed (shallow JSON compare)
 */
export function useAutosave({
  draft,
  draftId,
  onSaved,
  debounceMs = 1500,
  enabled = true,
}: AutosaveOptions): AutosaveReturn {
  const savedIdRef = useRef<string | null>(draftId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef<string>('');
  const [state, setState] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const save = useCallback(async (d: ProductDraft) => {
    if (!enabled) return;

    // Skip write if content hasn't changed since last successful save
    const currentJson = JSON.stringify({ title: d.title, condition: d.condition, price: d.price, stock: d.stock, brand: d.brand, model: d.model, images: d.images });
    if (currentJson === lastSavedJsonRef.current) return;

    setState('saving');
    try {
      const body = {
        title: d.title,
        applianceType: d.applianceType,
        mlCategoryId: d.mlCategoryId,
        condition: d.condition,
        price: d.price,
        currency: d.currency,
        stock: d.stock,
        draftData: d,
        lastPayload: null,
      };

      if (savedIdRef.current) {
        const res = await fetch(`/api/drafts/${savedIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          lastSavedJsonRef.current = currentJson;
          setState('saved');
          setSavedAt(new Date());
        } else {
          setState('error');
        }
      } else {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const created = await res.json();
          savedIdRef.current = created.id;
          lastSavedJsonRef.current = currentJson;
          setState('saved');
          setSavedAt(new Date());
          onSaved?.(created.id);
        } else {
          setState('error');
        }
      }
    } catch {
      setState('error');
      // Silent — never disrupt user flow
    }
  }, [enabled, onSaved]);

  useEffect(() => {
    if (!draft || !enabled) return;
    setState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(draft), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [draft, save, debounceMs, enabled]);

  return { savedIdRef, state, savedAt };
}
