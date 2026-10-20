'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** The custom property toasts read (ui.css, shell.css) to sit above a Messages composer, not on it. */
export const COMPOSER_INSET_VAR = '--ch-ms-comp-h';

/** Every composer on screen, in the order they mounted: the newest decides, so a screen leaving can't clear a live one. */
const live: Array<{ el: HTMLElement; root: HTMLElement }> = [];

function apply() {
  for (const c of live) c.root.style.removeProperty(COMPOSER_INSET_VAR);
  const top = live.at(-1);
  // The border box: on the phone the footer's padding carries the home-indicator inset.
  if (top) top.root.style.setProperty(COMPOSER_INSET_VAR, `${Math.round(top.el.getBoundingClientRect().height)}px`);
}

/**
 * Measures a composer footer while it is mounted and hands its height to the toast stack on its own `.ch-root` (an
 * error boundary can render a second one): a toast lifts as the composer grows, and drops back when it leaves.
 */
export function useComposerInset(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.closest<HTMLElement>('.ch-root');
    if (!el || !root) return;
    const entry = { el, root };
    live.push(entry);
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      live.splice(live.indexOf(entry), 1);
      root.style.removeProperty(COMPOSER_INSET_VAR);
      apply();
    };
  }, [ref]);
}
