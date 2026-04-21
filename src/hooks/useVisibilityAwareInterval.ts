'use client';
import { useEffect, useRef } from 'react';

/**
 * setInterval that only fires when document.visibilityState === 'visible'.
 * Pauses on tab hide, resumes on tab show. Use for any polling hook that
 * shouldn't keep firing when the user isn't looking at the tab.
 *
 * @param callback   Function to invoke each tick. Stable or wrapped in useCallback recommended.
 * @param intervalMs Interval in ms. Pass `null` to pause entirely.
 */
export function useVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number | null,
): void {
  const savedCb = useRef(callback);

  useEffect(() => {
    savedCb.current = callback;
  }, [callback]);

  useEffect(() => {
    if (intervalMs === null) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => savedCb.current(), intervalMs);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
