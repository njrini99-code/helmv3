'use client';

import { useEffect, useRef } from 'react';
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

export function useSequencedNavigation({
  armed,
  destinationRef,
  fadeAtMs,
  navigateAtMs,
  failsafeAtMs,
  onFade,
}: SequencedNavigationOptions): void {
  const router = useRouter();
  const hasArmedRef = useRef(false);
  const hasNavigatedRef = useRef(false);

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

    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(navId);
      window.clearTimeout(failsafeId);
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
}
