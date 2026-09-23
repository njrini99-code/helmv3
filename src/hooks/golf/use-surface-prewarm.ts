'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  readCachedResource,
  writeCachedResourceIfCurrent,
  getCacheEpoch,
} from '@/lib/golf/client-resource-cache';
// NOT a static import of use-golf-messages: that module (realtime channels,
// message state, the whole conversation waterfall) would otherwise ship in
// every dashboard page's bundle via this hook, for what is here a single
// idle-time background fetch. Loaded dynamically inside `run()` instead.

/** Calendar always renders (it degrades gracefully with no team). */
const CALENDAR_ROUTE = '/golf/dashboard/calendar';
/** Messages hard-blocks with an empty state for a viewer with no team
 *  (`FairwayMessages` — `if (!teamId) return <EmptyState .../>`), so there is
 *  nothing useful to warm without one. */
const MESSAGES_ROUTE = '/golf/dashboard/messages';

/** One prewarm per (viewer, active team) per page load — the shell remounts
 *  more than once, and a team switch changes what the rail should warm. */
const primed = new Set<string>();

/** Test-only: this module-level Set otherwise survives across test files
 *  sharing a worker, silently skipping a `run()` a later test expects. */
export function __resetSurfacePrewarmForTests(): void {
  primed.clear();
}

/**
 * Warms the two surfaces the owner named as slow (2026-09-10) as soon as the
 * dashboard shell is idle, so the FIRST tap on Calendar or Messages is as
 * instant as a return visit:
 *
 *   • `router.prefetch` pulls each route's payload into the client router
 *     cache.
 *   • The conversation rail's full waterfall runs once in the background and
 *     lands in the session cache `useGolfConversations` reads on mount.
 *
 * Deferred to `requestIdleCallback` (timeout-bounded) so it never competes
 * with the dashboard's own first paint, and skipped under Save-Data.
 *
 * @param teamId The viewer's active team (`useGolfUser().teamId`), if any.
 *   Messages-specific work (route prefetch + conversation rail fetch) is
 *   skipped without one — the surface is functionally inaccessible, and
 *   prefetching would also warm the WRONG team's rail into the cache for a
 *   multi-team coach who has not resolved an active team yet. Calendar is
 *   always prefetched: it renders (degraded) for every signed-in user.
 */
export function useGolfSurfacePrewarm(userId: string | null | undefined, teamId?: string | null): void {
  const router = useRouter();

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const dedupeKey = `${userId}:${teamId ?? ''}`;
    if (primed.has(dedupeKey)) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      primed.add(dedupeKey);
      try {
        router.prefetch(CALENDAR_ROUTE);
      } catch {
        // Prefetch is an optimisation; a failure here must never surface.
      }
      if (!teamId) return;
      try {
        router.prefetch(MESSAGES_ROUTE);
      } catch {
        // Same.
      }
      // Captured before the dynamic import + fetch below: a sign-out mid-
      // flight must not write a stale rail back in. See client-resource-cache.
      const fetchEpoch = getCacheEpoch();
      void import('@/hooks/golf/use-golf-messages')
        .then(async ({ loadGolfConversationRail, conversationsCacheKey }) => {
          const cacheKey = conversationsCacheKey(userId, teamId);
          if (readCachedResource(cacheKey)) return;
          const result = await loadGolfConversationRail(createClient(), userId);
          if (cancelled || !result.ok) return;
          writeCachedResourceIfCurrent(cacheKey, result.rows, fetchEpoch);
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
  }, [userId, teamId, router]);
}
