'use client';

import { useEffect, useRef } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { rankOrderChanged } from './model';

/** When the page (or any scroller in it) last scrolled. Module-level, like RouteFrame's popstate mark: one listener for the tab. */
let scrolledAt = -Infinity;
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => (scrolledAt = performance.now()), { capture: true, passive: true });
}
/** A scroll this recent means the reader's finger or wheel is still on the page: the rows don't move under it. */
const SCROLL_QUIET_MS = 300;

/**
 * Whether the board's rows slide to their new ranks on this render (P009-B1). Only when a re-read changed the ranked
 * order (`rankOrderChanged`, against the order last drawn), and never with reduced motion or Animations off, mid-scroll,
 * with a scorecard tray or a sheet open (`held`, or any dialog on the page). Nothing else on the board animates: the
 * plates take their new values at once (owner 2026-10-08: no digit rolling, no count-ups).
 *
 * The answer feeds each row's `<ViewTransition update>`: the slide rides the refresh's own transition, and a refresh
 * that changed no rank gives every row `update="none"`, so no view transition is started for it.
 */
export function useRankSlide(order: readonly string[], held: boolean): boolean {
  const reduced = useChReducedMotion();
  // The order last committed to the screen. A ref, not state: recording it must not draw the board again.
  const drawn = useRef<readonly string[] | null>(null);
  useEffect(() => {
    drawn.current = order;
  });
  const changed = rankOrderChanged(drawn.current, order);
  if (!changed || reduced || held) return false;
  // Only reached on a client re-render (the first render has no previous order), so the document is there to ask.
  if (performance.now() - scrolledAt < SCROLL_QUIET_MS) return false;
  return !document.querySelector("[role='dialog'], dialog[open]");
}
