'use client';

/**
 * Keep an in-page anchor (`/settings/team#reminders`) in view while the page
 * above it settles.
 *
 * The Team page's panels each load on their own and grow past their loading
 * cards when they resolve, so a single scroll-to-hash on arrival lands short:
 * "Event reminders" is on screen at first paint, then Scoring & format loads
 * above it and pushes it down. This re-applies the scroll whenever the
 * container resizes, for a short settling window, and stops for good the
 * moment the reader scrolls, taps or types, so it never fights them.
 *
 * Instant scrolls only (no smooth behaviour), so there is no motion to gate.
 */

import { useEffect, type RefObject } from 'react';

const SETTLE_WINDOW_MS = 2500;

export function useSettleToHash(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    const container = containerRef.current;
    if (!id || !container) return;

    let active = true;
    const align = () => {
      if (!active) return;
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    const stop = () => {
      active = false;
    };

    align();
    const observer = new ResizeObserver(align);
    observer.observe(container);
    const timer = window.setTimeout(stop, SETTLE_WINDOW_MS);
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((type) => window.addEventListener(type, stop, { passive: true, once: true }));

    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(timer);
      events.forEach((type) => window.removeEventListener(type, stop));
    };
  }, [containerRef]);
}
