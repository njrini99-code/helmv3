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
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoProps {
  children: ReactNode;
  className?: string;
}

/**
 * The gapless bento shell. Compose with `BentoCell` children — the 1px gap
 * shows the shared border color as hairline seams between cells.
 */
export function Bento({ children, className }: BentoProps) {
  return (
    <div
      data-slot="bento"
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle [box-shadow:var(--fw-shadow-card)]',
        'auto-rows-[minmax(7.375rem,auto)]',
        'lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
