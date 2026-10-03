'use client';

import { useEffect, useRef, ViewTransition, type ReactNode } from 'react';
import { useChPress } from '../lib/press';
import { useChReducedMotion } from '../lib/reduced-motion';
import { markAppRunning, RouteScope } from '../lib/session-state';

/**
 * The page frame. Each page mounts fresh on navigation (keyed by route) and is shown as soon as it is ready: the
 * staggered first-paint reveal is retired (owner 2026-10-01, audit F01), so the crossfade below is the only entrance.
 * Resets the canvas scroll so a new page never opens halfway down (CH-1904), and mounts the press.
 *
 * A navigation crossfades the page (owner 2026-10-01: a quick crossfade, never a slide): React's `<ViewTransition>`
 * keyed by route makes the old page and the new one an exit/enter pair, and `.ch-page`
 * (shell.css) fades them; the sidebar, top bar and tab bar are anchored and never move. Navigations are transitions,
 * so this runs on every in-app route change and on nothing else. Reduced motion and Settings › Animations off render without it: the page swaps at once. CH-1601.
 */
/** Where each page was scrolled, by route and team, for Back and Forward (this tab only). */
const scrolled = new Map<string, { canvas: number; win: number }>();
/** Set by a Back or Forward (popstate); a navigation that starts within this long of one is a return. */
const RETURN_WINDOW_MS = 1500;
let poppedAt = 0;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (poppedAt = Date.now()));

/** Scrolls back to a saved place once the page is tall enough to hold it, or gives up after a second. */
function restoreScroll(to: { canvas: number; win: number }): () => void {
  const canvas = document.getElementById('ch-canvas');
  const until = Date.now() + 1000;
  let frame = 0;
  const step = () => {
    canvas?.scrollTo({ top: to.canvas });
    window.scrollTo({ top: to.win });
    const there = (!canvas || Math.abs(canvas.scrollTop - to.canvas) < 2) && Math.abs(window.scrollY - to.win) < 2;
    if (!there && Date.now() < until) frame = requestAnimationFrame(step);
  };
  step();
  return () => cancelAnimationFrame(frame);
}

export function RouteFrame({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  useChPress(!reduced);
  const first = useRef(true);
  useEffect(() => markAppRunning(), []);
  // A new page opens at the top (CH-1904); Back or Forward returns to where that page was left (PAGE_PERFORMANCE.md
  // rule 1). Positions are recorded as the coach scrolls, so leaving never has to read a page already swapped out.
  useEffect(() => {
    const canvas = document.getElementById('ch-canvas');
    const record = () => scrolled.set(routeKey, { canvas: canvas?.scrollTop ?? 0, win: window.scrollY });
    canvas?.addEventListener('scroll', record, { passive: true });
    window.addEventListener('scroll', record, { passive: true });
    let cancel: (() => void) | undefined;
    if (first.current) first.current = false;
    else {
      const saved = scrolled.get(routeKey);
      if (saved && Date.now() - poppedAt < RETURN_WINDOW_MS) cancel = restoreScroll(saved);
      else {
        canvas?.scrollTo({ top: 0 });
        window.scrollTo({ top: 0 });
      }
    }
    return () => {
      cancel?.();
      canvas?.removeEventListener('scroll', record);
      window.removeEventListener('scroll', record);
    };
  }, [routeKey]);

  const page = (
    <div key={reduced ? routeKey : undefined} id="ch-content" tabIndex={-1} className="ch-frame-route">
      <RouteScope value={routeKey}>{children}</RouteScope>
    </div>
  );
  if (reduced) return page;
  return (
    <ViewTransition key={routeKey} name="ch-page" enter="ch-page" exit="ch-page" share="ch-page" update="none" default="none">
      {page}
    </ViewTransition>
  );
}
