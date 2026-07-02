'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';

/**
 * Visibility-aware polling for `/admin` panels: calls `router.refresh()` on
 * an interval, paused whenever the tab isn't visible (DECISIONS #9 — no
 * Supabase Realtime in v1, 30–60s visibility-aware polling only, since
 * SELECT-RLS leak risk on `admin_events` is unverified). Renders nothing —
 * mount ONE instance per page that wants its server components re-fetched.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }): null {
  const router = useRouter();
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);
  useVisibilityAwareInterval(refresh, intervalMs);
  return null;
}
