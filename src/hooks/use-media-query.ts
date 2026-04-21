'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns `true` if the given media query currently matches, `false` otherwise.
 *
 * Uses `useSyncExternalStore` so that on the very first client render after
 * hydration the hook can read the correct value synchronously from
 * `window.matchMedia(...)` — avoiding the "render wrong → effect → re-render
 * right" double-mount pattern of the old `useState(false) + useEffect` impl.
 *
 * The server snapshot is `false` (mobile-first), which matches the previous
 * hook's SSR behavior so callers that relied on mobile-first rendering under
 * SSR keep working. Signature is identical to the previous implementation:
 * `(query: string) => boolean`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false, // server snapshot — mobile-first, matches native iOS target
  );
}
