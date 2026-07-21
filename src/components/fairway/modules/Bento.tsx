'use client';

/**
 * ============================================================================
 * Fairway · modules · Bento — the gapless overview grid (mockup `.bento`)
 * ----------------------------------------------------------------------------
 * One bordered, radius-20, overflow-hidden container: a hairline-color
 * background shows through the 1px `gap-px` seams between cells, so the
 * whole thing reads as ONE surface with internal dividers rather than a
 * stack of separate cards. Cells opt into the whole-cell click target via
 * `BentoCell`'s own `onOpen` prop — `Bento` itself is a pure grid shell.
 *
 * Breakpoint: the 4-col collapse fires at `min-[940px]:` (not Tailwind's
 * `lg`) so the chassis shares ONE mobile threshold with the spine/stage
 * shell's own stacking breakpoint (see `StatsSpineStage`, the CoachHelm
 * homes) — the bento and the shell that hosts it go single-column together.
 *
 * `grid-flow-dense` trade-off: dense packing fills mid-grid holes left by
 * earlier cells, which is exactly what makes this "gapless" instead of
 * leaving ragged empty tracks. The conscious cost is that when a 2×2 cell
 * (`span=2 rows=2`) is NOT the first child, dense packing can pull a later,
 * smaller cell UP ahead of it to fill the hole — so visual order can diverge
 * from DOM/tab order for keyboard and screen-reader users. Every current
 * composition sidesteps this by authoring cells in visual-priority order
 * already (the 2×2, if present, goes first) — any NEW composition must do
 * the same, or drop `grid-flow-dense` for that instance.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoProps {
  children: ReactNode;
  className?: string;
  /** Render cells as distinct elevated cards instead of one gapless sheet. */
  separated?: boolean;
}

/**
 * The gapless bento shell. Compose with `BentoCell` children — the 1px gap
 * shows the shared border color as hairline seams between cells.
 */
export function Bento({ children, className, separated = false }: BentoProps) {
  return (
    <div
      data-slot="bento"
      className={cn(
        'grid grid-flow-dense grid-cols-2',
        separated
          ? 'gap-3 overflow-visible bg-transparent [&>[data-slot="bento-cell"]]:rounded-card [&>[data-slot="bento-cell"]]:border [&>[data-slot="bento-cell"]]:border-border-subtle [&>[data-slot="bento-cell"]]:shadow-soft [&>[data-slot="bento-cell"]]:transition-[transform,box-shadow,border-color] [&>[data-slot="bento-cell"]]:duration-200 [&>[data-slot="bento-cell"]]:hover:-translate-y-1 [&>[data-slot="bento-cell"]]:hover:shadow-raise [&>[data-slot="bento-cell"]]:motion-reduce:transform-none'
          : 'gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle [box-shadow:var(--fw-shadow-card)]',
        'auto-rows-[minmax(7.375rem,auto)]',
        'min-[940px]:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
