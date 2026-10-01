'use client';

import { useEffect, useRef, ViewTransition, type ReactNode } from 'react';
import { useChPress } from '../lib/press';
import { useChReducedMotion } from '../lib/reduced-motion';
import { markAppRunning, RouteScope } from '../lib/session-state';

/**
 * The page frame. Each page mounts fresh on navigation (keyed by route), so
 * its sections rise in once on first paint (`.ch-reveal`, D-64) and a refresh
 * with new data never replays it. Resets the canvas scroll so a new page never
 * opens halfway down (CH-1904), and mounts the press for every tappable.
 *
 * A navigation crossfades the page (owner 2026-10-01: a quick crossfade, never a slide): React's `<ViewTransition>`
 * keyed by route makes the old page and the new one an exit/enter pair, and `.ch-page`
 * (shell.css) fades them; the sidebar, top bar and tab bar are anchored and never move. Navigations are transitions,
 * so this runs on every in-app route change and on nothing else (a refresh or a Suspense reveal keeps the reveal
 * below). Reduced motion and Settings › Animations off render without it: the page swaps at once.
 */
/** The longest reveal: the last of ten steps' delay plus the rise itself, with room to spare (base.css). */
const REVEAL_MS = 1200;

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

  // The reveal plays once per page (F-55): once the page itself (not its skeleton) is on screen and the stagger has
  // had time to finish, the frame is marked and the CSS stops matching, so a transition's aria-busy never replays it.
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    el.removeAttribute('data-revealed');
    let timer: number | undefined;
    const settled = () => {
      const page = el.firstElementChild;
      return !!page && page.getAttribute('aria-busy') !== 'true';
    };
    const arm = () => {
      if (timer !== undefined || !settled()) return;
      timer = window.setTimeout(() => el.setAttribute('data-revealed', ''), REVEAL_MS);
      observer?.disconnect();
    };
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(arm);
    observer?.observe(el, { childList: true, subtree: false, attributes: true, attributeFilter: ['aria-busy'] });
    if (el.firstElementChild) observer?.observe(el.firstElementChild, { attributes: true, attributeFilter: ['aria-busy'] });
    arm();
    return () => {
      observer?.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [routeKey]);

  const page = (
    <div key={reduced ? routeKey : undefined} ref={frame} id="ch-content" tabIndex={-1} className="ch-frame-route ch-reveal">
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
