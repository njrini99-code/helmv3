'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Whether the device asked to save data or is offline: then nothing is fetched ahead of a tap. */
export function prefetchAllowed(nav: Navigator | undefined): boolean {
  if (!nav) return false;
  if (nav.onLine === false) return false;
  return (nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData !== true;
}

/**
 * Fetches the phone tabs' routes ahead of the first tap, once the shell has mounted and the main thread is idle
 * (native-feel audit 2026-10-08, P0-2). A default prefetch fetches a dynamic route as far as its loading boundary, so
 * a cold tab switch commits at once; the router cache (`experimental.staleTimes`, next.config.mjs) keeps a visited
 * tab for 30s, so a revisit renders from memory. Skipped with Data Saver on or offline. iOS Safari has no
 * requestIdleCallback, so it falls back to a short timeout. Next prefetches only in production builds.
 */
export function usePrefetchTabs(hrefs: readonly string[], current: string): void {
  const router = useRouter();
  const key = hrefs.join('|');
  useEffect(() => {
    if (!prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    const run = () => {
      for (const href of key.split('|')) if (href && href !== current) router.prefetch?.(href);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, 400);
    return () => window.clearTimeout(id);
    // Once per shell: a tab change must not prefetch again (`current` is read when it runs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);
}
