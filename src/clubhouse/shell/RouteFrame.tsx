'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useChPress } from '../lib/press';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * The page frame. Each page mounts fresh on navigation (keyed by route), so
 * its sections rise in once on first paint (`.ch-reveal`, D-64) and a refresh
 * with new data never replays it. Resets the canvas scroll so a new page never
 * opens halfway down (CH-1904), and mounts the press for every tappable.
 */
/** The longest reveal: the last of ten steps' delay plus the rise itself, with room to spare (base.css). */
const REVEAL_MS = 1200;

export function RouteFrame({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  useChPress(!reduced);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById('ch-canvas')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
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

  return (
    <div key={routeKey} ref={frame} id="ch-content" tabIndex={-1} className="ch-frame-route ch-reveal">
      {children}
    </div>
  );
}
