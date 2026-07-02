'use client';

import { type ReactNode } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScrollProgress } from './useScrollProgress';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export interface PinnedScrubProps {
  /**
   * Total scroll height (as vh) driving the scrub — the spec's M3 uses
   * ~250vh (docs/LANDING_ENTRY_WORLD_DESIGN.md M3). Default 250.
   */
  heightVh?: number;
  /** Classes on the tall outer spacer. */
  className?: string;
  /** Classes on the `position: sticky` inner viewport. */
  innerClassName?: string;
  /**
   * Render-prop — receives the 0→1 scrub progress as a `MotionValue` so
   * children stay transform/opacity-only consumers (feed straight into
   * `useTransform`). Under `prefers-reduced-motion`, this receives a
   * static `MotionValue` pinned at `1` (final state) and the section
   * renders unpinned/unscrubbed — see the component doc below.
   */
  children: (progress: MotionValue<number>) => ReactNode;
}

/**
 * `height: Nvh` outer spacer + `position: sticky` inner viewport — the
 * Motion-native pinned-scrub primitive (docs/redesign/.../
 * 03_apple_scroll_playbook.md §2b / §3i). No GSAP needed for the common
 * case: `useScrollProgress`'s `['start start', 'end end']` window scrubs
 * `children(progress)` for the full pinned duration.
 *
 * `prefers-reduced-motion`: renders the section as a normal (non-pinned,
 * non-tall) `100dvh` block and calls `children` with a MotionValue frozen
 * at `1` — so a scrub sequence's "final state" (all screens landed, full
 * lights on, etc.) renders once, statically, with zero motion. This is
 * the primitive-level half of the CLAUDE.md motion rule; the moment
 * consuming `PinnedScrub` should design its `children` render so `progress
 * === 1` reads as a complete, coherent frame — not a mid-scrub glitch.
 */
export function PinnedScrub({ heightVh = 250, className, innerClassName, children }: PinnedScrubProps) {
  const reduced = usePrefersReducedMotion();
  const { ref, progress } = useScrollProgress<HTMLDivElement>({
    offset: ['start start', 'end end'],
    smooth: false,
  });
  const staticProgress = useMotionValue(1);

  if (reduced) {
    return (
      <div className={cn('relative', className)}>
        <div className={cn('relative h-[100dvh]', innerClassName)}>{children(staticProgress)}</div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ height: `${heightVh}vh` }} className={cn('relative', className)}>
      <div className={cn('sticky top-0 h-[100dvh] overflow-hidden', innerClassName)}>
        {children(progress)}
      </div>
    </div>
  );
}
