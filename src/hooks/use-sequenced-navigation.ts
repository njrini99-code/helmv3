'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Drive a two-step transition animation and navigate when it completes:
 *
 *   armed === true    → schedule fade-out  at `fadeAtMs`
 *                     → schedule navigate  at `navigateAtMs` (router.replace)
 *                     → schedule failsafe  at `failsafeAtMs` (hard window.location.replace)
 *
 * Timers persist across state changes because they're armed once via a ref
 * rather than tied to effect cleanup — this is the fix for the welcome-page
 * bug where setting `leaving = true` previously cancelled the pending nav.
 *
 * The destination is read via a ref so the caller can mutate it after arming
 * (e.g. the welcome page decides admin vs player destination after
 * identity load, which happens at the same moment it arms this hook).
 */
export interface SequencedNavigationOptions {
  /** Arm the sequence. Usually tracks `ready && !!identity`. */
  armed: boolean;
  /** Ref whose `.current` holds the destination path at navigation time. */
  destinationRef: React.MutableRefObject<string>;
  /** ms from arming when the fade-out state should flip. */
  fadeAtMs: number;
  /** ms from arming when router.replace should fire. */
  navigateAtMs: number;
  /** ms from arming when the hard window.location.replace failsafe fires. */
  failsafeAtMs: number;
  /** Called when fade should begin. */
  onFade: () => void;
}

/**
 * Returned by the hook so a caller that navigates on its OWN (a Skip button)
 * can stand the sequence down.
 *
 * Without this, skipping left the armed failsafe running: it fires
 * `window.location.replace` — a HARD navigation — some seconds later, on
 * whatever page the user has since reached. That was survivable while the hook
 * was only armed after identity resolved, because a fast skip usually beat the
 * arming. It is not survivable now that the sequence arms at mount, which is
 * the whole point of the hang fix. Skipping has to be able to cancel.
 */
export type SequencedNavigationControls = { cancel: () => void };

export function useSequencedNavigation({
  armed,
  destinationRef,
  fadeAtMs,
  navigateAtMs,
  failsafeAtMs,
  onFade,
}: SequencedNavigationOptions): SequencedNavigationControls {
  const router = useRouter();
  const hasNavigatedRef = useRef(false);
  // Timer ids kept on a ref so `cancel()` can reach them from outside the
  // effect that created them.
  const timerIdsRef = useRef<number[]>([]);

  /**
   * The volatile inputs live on refs so the arming effect can depend on
   * `armed` ALONE.
   *
   * This is load-bearing, not tidiness. Anything in that effect's dependency
   * array re-runs it, its cleanup unconditionally clears all three timers, and
   * an "arm only once" guard then refused to reschedule them — so a SINGLE
   * benign re-render permanently killed the sequence. Captured live on the
   * welcome page:
   *
   *   +2997ms  effect run; armed=true hasArmed=false
   *   +2998ms  scheduled {fade 1650, nav 1900, failsafe 4500}
   *   +3002ms  CLEANUP - clearing all timers        <- effect re-ran 4ms later
   *   +3003ms  EARLY RETURN - nothing scheduled     <- guard blocks rescheduling
   *
   * Net: zero live timers. No fade, no navigate, and the failsafe that exists
   * precisely for this was cleared along with the rest, so the interstitial
   * hung indefinitely and only the Skip button worked. `router` from
   * `useRouter()` is the dep that changed identity here, but the specific
   * culprit is not the point — the effect must be immune to ALL of them.
   */
  const onFadeRef = useRef(onFade);
  const routerRef = useRef(router);
  const timingRef = useRef({ fadeAtMs, navigateAtMs, failsafeAtMs });
  useEffect(() => {
    onFadeRef.current = onFade;
    routerRef.current = router;
    timingRef.current = { fadeAtMs, navigateAtMs, failsafeAtMs };
  });

  const cancel = useCallback(() => {
    // Claim the navigation so neither the scheduled `router.replace` nor the
    // hard `window.location.replace` failsafe can also fire.
    hasNavigatedRef.current = true;
    timerIdsRef.current.forEach((id) => window.clearTimeout(id));
    timerIdsRef.current = [];
  }, []);

  useEffect(() => {
    if (!armed) return;

    // NOTE: no `hasArmedRef` guard. It was what turned a re-run into a
    // permanent dead state, and with the dependency array narrowed to `armed`
    // it is also unnecessary: the effect no longer re-runs on re-render. Its
    // absence is additionally what makes this correct under React StrictMode,
    // whose dev-mode mount -> cleanup -> mount cycle would otherwise clear the
    // timers and then decline to reschedule them.
    const { fadeAtMs: fadeAt, navigateAtMs: navAt, failsafeAtMs: failsafeAt } = timingRef.current;

    const fadeId = window.setTimeout(() => onFadeRef.current(), fadeAt);

    const navId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      routerRef.current.replace(destinationRef.current);
    }, navAt);

    const failsafeId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      if (typeof window !== 'undefined') {
        window.location.replace(destinationRef.current);
      }
    }, failsafeAt);

    timerIdsRef.current = [fadeId, navId, failsafeId];

    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(navId);
      window.clearTimeout(failsafeId);
      timerIdsRef.current = [];
    };
    // `destinationRef` is a ref (stable identity); every other input is read
    // through a ref above precisely so it cannot land here.
  }, [armed, destinationRef]);

  // Prefetch destination once armed, so the onward push is instant.
  //
  // This warms the destination only as far as its nearest loading boundary, and
  // that is DELIBERATE — do not "upgrade" it to a full prefetch.
  //
  // `router.prefetch(href)` with no options is `PrefetchKind.AUTO`, which for a
  // route without per-segment prefetching degrades to
  // `FetchStrategy.LoadingBoundary`. Reaching past that would need
  // `PrefetchKind.FULL`, and the tempting conclusion is that this is a one-line
  // omission. It is not, because of what happens on the OTHER side:
  //
  //   • the golf dashboard is `export const dynamic = 'force-dynamic'`
  //   • Next's `experimental.staleTimes.dynamic` defaults to 0
  //     (node_modules/next/dist/server/config-shared.js), and next.config.mjs
  //     does not override it
  //
  // so a full prefetch would be cached with a stale time of zero, be stale the
  // instant it landed, and get re-fetched from scratch on navigation anyway.
  // The only thing gained would be a second complete server render of the
  // dashboard — roughly a dozen extra DB round trips per sign-in — thrown away.
  //
  // Making a full prefetch actually pay off means raising
  // `experimental.staleTimes.dynamic` app-wide, which trades data freshness on
  // every dynamic route in every product for this one hand-off. That is a
  // product decision, not a hook detail.
  useEffect(() => {
    if (!armed) return;
    try {
      router.prefetch(destinationRef.current);
    } catch {
      // prefetch is best-effort
    }
  }, [armed, destinationRef, router]);

  return { cancel };
}
