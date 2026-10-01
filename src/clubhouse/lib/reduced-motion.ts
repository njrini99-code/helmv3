'use client';

import { useSyncExternalStore } from 'react';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Hydration-safe reduced-motion read. The server snapshot is `false` and the
 * client reads the real media query, so the first client render matches the
 * server and nothing flips mid-hydration (framer's useReducedMotion returns
 * null before hydration, which is the #418 class).
 */
export function useChReducedMotion(): boolean {
  const os = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  // Settings > Preferences > Animations (stored on this device). Its server
  // snapshot is the default (on), so hydration never flips.
  const { showAnimations } = useAppearancePreferences();
  return os || !showAnimations;
}
