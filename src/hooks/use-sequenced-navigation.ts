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
  const hasArmedRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  // Timer ids kept on a ref so `cancel()` can reach them from outside the
  // effect that created them.
  const timerIdsRef = useRef<number[]>([]);

  const cancel = useCallback(() => {
    // Claim the navigation so neither the scheduled `router.replace` nor the
    // hard `window.location.replace` failsafe can also fire.
    hasNavigatedRef.current = true;
    timerIdsRef.current.forEach((id) => window.clearTimeout(id));
    timerIdsRef.current = [];
  }, []);

  useEffect(() => {
    if (!armed || hasArmedRef.current) return;
    hasArmedRef.current = true;

    const fadeId = window.setTimeout(onFade, fadeAtMs);

    const navId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      router.replace(destinationRef.current);
    }, navigateAtMs);

    const failsafeId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      if (typeof window !== 'undefined') {
        window.location.replace(destinationRef.current);
      }
    }, failsafeAtMs);

    timerIdsRef.current = [fadeId, navId, failsafeId];

    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(navId);
      window.clearTimeout(failsafeId);
      timerIdsRef.current = [];
    };
  }, [armed, destinationRef, fadeAtMs, navigateAtMs, failsafeAtMs, onFade, router]);

  // Prefetch destination once armed, so the onward push is instant.
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
