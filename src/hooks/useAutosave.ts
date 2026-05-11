'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ProductDraft } from '@/types';

interface AutosaveOptions {
  draft: ProductDraft | null;
  draftId: string | null;
  onSaved?: (id: string) => void;
  debounceMs?: number;
  /** Set to false if user is not authenticated (skips silently) */
  enabled?: boolean;
}

/**
 * Debounced autosave hook.
 * - Creates the draft on first save (POST /api/drafts)
 * - Updates on subsequent saves (PATCH /api/drafts/[id])
 * Returns a ref with the current saved draft ID.
 */
export function useAutosave({
  draft,
  draftId,
  onSaved,
  debounceMs = 1500,
  enabled = true,
}: AutosaveOptions) {
  const savedIdRef = useRef<string | null>(draftId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (d: ProductDraft) => {
    if (!enabled) return;
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
        await fetch(`/api/drafts/${savedIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const created = await res.json();
          savedIdRef.current = created.id;
          onSaved?.(created.id);
        }
      }
    } catch {
      // Autosave errors are silent — never disrupt the user flow
    }
  }, [enabled, onSaved]);

  useEffect(() => {
    if (!draft || !enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(draft), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [draft, save, debounceMs, enabled]);

  return savedIdRef;
}
