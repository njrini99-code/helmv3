'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * Re-runs the page's server render (a failed read's Try again, a live update) and says while it is in flight, so the control that
 * asked shows it is working and a second tap during the wait does nothing. The page on screen stays until the new render lands.
 */
export function useRefresh(): { refresh: () => void; refreshing: boolean } {
  const router = useRouter();
  const [refreshing, start] = useTransition();
  const refresh = useCallback(() => {
    if (refreshing) return;
    start(() => router.refresh());
  }, [refreshing, router]);
  return { refresh, refreshing };
}
