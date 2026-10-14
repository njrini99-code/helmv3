'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { conversationsCacheKey, loadGolfConversationRail } from '@/hooks/golf/use-golf-messages';
import { getCacheEpoch, readCachedResource, writeCachedResourceIfCurrent } from '@/lib/golf/client-resource-cache';
import { prefetchAllowed } from './use-prefetch-tabs';

/**
 * Fills the inbox's session cache once the shell is idle, so the first visit to Messages paints its list at once
 * instead of a second skeleton while the browser loads it (phone test 2026-10-13: about three seconds on a phone).
 * Messages' own hook (`useGolfConversations`) reads this cache first and still refreshes silently, so the list is
 * live a moment later. One read per session, skipped when the cache is already warm, with Data Saver on or offline.
 */
export function useWarmInbox(userId: string | undefined, teamId: string | undefined): void {
  useEffect(() => {
    if (!userId || !teamId || !prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    const key = conversationsCacheKey(userId, teamId);
    if (readCachedResource(key)) return;
    let cancelled = false;
    const run = async () => {
      const epoch = getCacheEpoch();
      const result = await loadGolfConversationRail(createClient(), userId).catch(() => null);
      if (!cancelled && result?.ok) writeCachedResourceIfCurrent(key, result.rows, epoch);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    // After the tabs' prefetch (use-prefetch-tabs), so the first page's own work goes first.
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => void run(), { timeout: 3000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(() => void run(), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [userId, teamId]);
}
