'use client';

import { useEffect } from 'react';

/** The part of the Screen Wake Lock API this uses (a sentinel the browser can also release on its own). */
interface Sentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}
interface WakeLockApi {
  request: (type: 'screen') => Promise<Sentinel>;
}

/**
 * Keeps the screen on while the round's shot screen is up (wave 9, owner decision A): on the course the phone otherwise
 * locks between shots, so every shot starts with an unlock. It asks for a screen wake lock while the page is visible,
 * asks again when the page comes back (the browser drops the lock when the page is hidden) and lets it go on unmount.
 * Where the API is missing, or the browser refuses (low battery, a WebView without it), it does nothing and says
 * nothing: the screen locks as it always has.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return undefined;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api || typeof api.request !== 'function') return undefined;
    let sentinel: Sentinel | null = null;
    let asking = false;
    let gone = false;
    const letGo = (s: Sentinel) => {
      Promise.resolve()
        .then(() => s.release())
        .catch(() => {});
    };
    const ask = () => {
      if (gone || asking || (sentinel && !sentinel.released) || document.visibilityState !== 'visible') return;
      asking = true;
      let pending: Promise<Sentinel>;
      try {
        pending = api.request('screen');
      } catch {
        asking = false;
        return;
      }
      pending.then(
        (s) => {
          asking = false;
          // Unmounted while the request was out: let it go at once.
          if (gone) return letGo(s);
          sentinel = s;
          s.addEventListener('release', () => {
            if (sentinel === s) sentinel = null;
          });
        },
        () => {
          asking = false;
        },
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ask();
    };
    ask();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) letGo(sentinel);
      sentinel = null;
    };
  }, []);
}
