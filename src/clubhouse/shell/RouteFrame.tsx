'use client';

import { m } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { CH_ROUTE } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * Route transition: a 220ms fade with a 6px settle on navigation, and nothing
 * on first paint (data is final on mount). Resets the canvas scroll so a new
 * page never opens halfway down.
 */
export function RouteFrame({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
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
    <m.div
      key={routeKey}
      id="ch-content"
      tabIndex={-1}
      className="ch-route"
      initial={first.current || reduced ? false : CH_ROUTE.initial}
      animate={CH_ROUTE.animate}
      transition={CH_ROUTE.transition}
    >
      {children}
    </m.div>
  );
}
