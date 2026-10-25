'use client';

import { useSyncExternalStore } from 'react';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function useOsReduce(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * Hydration-safe reduced-motion read. The server snapshot is `false` and the
 * client reads the real media query, so the first client render matches the
 * server and nothing flips mid-hydration (framer's useReducedMotion returns
 * null before hydration, which is the #418 class). CH-1608: with it, nothing slides, scales or springs. Pages and
 * sheets still fade under the OS setting (useChMotionMode); Settings › Animations off makes everything instant.
 */
export function useChReducedMotion(): boolean {
  // Settings > Preferences > Animations (stored on this device). Its server
  // snapshot is the default (on), so hydration never flips.
  const { showAnimations } = useAppearancePreferences();
  return useOsReduce() || !showAnimations;
}

/**
 * How a page or a sheet comes and goes (owner decision 2, 2026-10-24, OQ-15): `full` slides and springs; `fade`, under
 * the OS Reduce Motion setting, swaps the slide for an opacity fade over the quick beat (180ms, `chFade`), as iOS does;
 * `off`, Settings › Animations off, is the kill switch and swaps at once. Only pages and sheets read it: everything
 * else stays instant under either (useChReducedMotion).
 */
export type ChMotionMode = 'full' | 'fade' | 'off';

export function useChMotionMode(): ChMotionMode {
  const { showAnimations } = useAppearancePreferences();
  const os = useOsReduce();
  return !showAnimations ? 'off' : os ? 'fade' : 'full';
}

/**
 * The same read outside React, from the DOM: Animations off marks <html> data-motion="off" (ThemeScript from the first
 * frame, then ClubhouseFrame), then the media query. Not a portaled layer's own data-motion: the phone's bell drop
 * carries "off" under Reduce Motion too.
 */
export function chMotionModeNow(): ChMotionMode {
  if (typeof window === 'undefined') return 'full';
  if (document.documentElement.getAttribute('data-motion') === 'off') return 'off';
  return window.matchMedia?.(QUERY).matches ? 'fade' : 'full';
}
