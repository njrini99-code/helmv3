'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { readCachedResource, writeCachedResource } from '@/lib/golf/client-resource-cache';
import { conversationsCacheKey, loadGolfConversationRail } from '@/hooks/golf/use-golf-messages';

/** Routes whose RSC payload is pulled into the router cache on idle. */
const PREWARM_ROUTES = ['/golf/dashboard/calendar', '/golf/dashboard/messages'] as const;

/** One prewarm per viewer per page load — the shell remounts more than once. */
const primed = new Set<string>();

/**
 * Warms the two surfaces the owner named as slow (2026-09-10) as soon as the
 * dashboard shell is idle, so the FIRST tap on Calendar or Messages is as
 * instant as a return visit:
 *
 *   • `router.prefetch` pulls each route's payload into the client router
 *     cache (kept alive by `experimental.staleTimes.dynamic` in next.config).
 *   • The conversation rail's full waterfall runs once in the background and
 *     lands in the session cache `useGolfConversations` reads on mount.
 *
 * Deferred to `requestIdleCallback` (timeout-bounded) so it never competes
 * with the dashboard's own first paint, and skipped under Save-Data.
 */
export function useGolfSurfacePrewarm(userId: string | null | undefined): void {
  const router = useRouter();

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    if (primed.has(userId)) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      primed.add(userId);
      for (const href of PREWARM_ROUTES) {
        try {
          router.prefetch(href);
        } catch {
          // Prefetch is an optimisation; a failure here must never surface.
        }
      }
      if (readCachedResource(conversationsCacheKey(userId))) return;
      void loadGolfConversationRail(createClient(), userId)
        .then((result) => {
          if (cancelled || !result.ok) return;
          writeCachedResource(conversationsCacheKey(userId), result.rows);
        })
        .catch(() => {
          // Same: the hook will fetch on demand and report its own errors.
        });
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(run, { timeout: 2500 });
    } else {
      timerId = setTimeout(run, 1200);
    }
    return () => {
      cancelled = true;
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [userId, router]);
}
