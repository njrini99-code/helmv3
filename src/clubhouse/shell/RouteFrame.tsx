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

  return (
    <div key={routeKey} id="ch-content" tabIndex={-1} className="ch-frame-route ch-reveal">
      {children}
    </div>
  );
}
