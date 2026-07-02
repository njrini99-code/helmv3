'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ReactLenis } from 'lenis/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import 'lenis/dist/lenis.css';

export interface LenisRootProps {
  children: ReactNode;
}

/**
 * The First Light landing root provider: the ONE Lenis instance
 * (docs/LANDING_ENTRY_WORLD_DESIGN.md decision #5) PLUS the ONE
 * `LazyMotion` feature bundle every moment's `m.*` components need.
 *
 * `lerp: 0.09` sits in the spec's 0.08–0.1 sweet spot — the "weighted
 * buttery glide." Disabled entirely (native scroll) on:
 *   - `prefers-reduced-motion: reduce`
 *   - coarse-pointer / touch devices (native momentum is already excellent
 *     and battery-friendly — see docs/redesign/.../03_apple_scroll_playbook.md §1.4)
 *
 * IMPORTANT — single-instance contract: mount this ONCE, at the landing
 * page root (`src/app/page.tsx`). Never nest a second Lenis instance (or
 * `useSmoothScroll` / `SmoothScroll`, the dashboard's separate hook) inside
 * a subtree this wraps — two competing Lenis instances fight over the same
 * scroll container and both feel broken. `useScrollProgress` /
 * `PinnedScrub` below read the real `window.scrollY` Lenis writes, so they
 * "just work" underneath this provider without any additional wiring.
 *
 * IMPORTANT — `LazyMotion` contract: every moment in this scaffold uses
 * framer-motion's lightweight `m.*` components (not `motion.*`) — per the
 * repo's own convention (see `src/app/golf/admin/_motion-provider.tsx`),
 * `m.*` silently no-ops every animation prop (`whileInView`, `animate`,
 * etc.) without a `LazyMotion` ancestor. This provider is that ancestor
 * for the whole landing tree — don't add a second, competing
 * `LazyMotion` inside an individual moment.
 */
export function LenisRoot({ children }: LenisRootProps) {
  // Resolve on the client only — SSR/first paint always renders native
  // scroll so there's no possibility of a Lenis flash-then-teardown.
  const [lenisEnabled, setLenisEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    setLenisEnabled(!reduced && !coarsePointer);
  }, []);

  const content = lenisEnabled ? (
    <ReactLenis
      root
      options={{
        lerp: 0.09,
        smoothWheel: true,
        syncTouch: false,
        touchMultiplier: 1,
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  ) : (
    children
  );

  return (
    <LazyMotion features={domAnimation} strict>
      {content}
    </LazyMotion>
  );
}
