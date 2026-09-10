'use client';

/**
 * ============================================================================
 * Fairway · ScrollArea — the scroll container for queues, rails and panels
 * ----------------------------------------------------------------------------
 * Pure CSS/DOM (no library, no virtualization): a `overflow-auto` viewport
 * with a compact desktop scrollbar (scroll-area.module.css), the shared
 * `useScrollFade` edge treatment (brief §2 — "content bleeds to transparent,
 * never a hard cut at a hidden scrollbar"), an optional sticky header slot,
 * and mobile-correct momentum/overscroll behavior.
 *
 *   <ScrollArea orientation="vertical" stickyHeader={<Header />}>
 *     {rows}
 *   </ScrollArea>
 *
 * Canvas by default — no border/shadow/radius of its own; the consumer's
 * surrounding Surface/Inset/panel owns the chrome. `edgeFade` paints ONLY the
 * edges that currently hide content (recomputed on scroll/resize/content
 * change via useScrollFade's ResizeObserver + scroll listener).
 * ========================================================================== */

import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';
import { useComposedRefs } from '@radix-ui/react-compose-refs';
import { cn } from '@/lib/utils';
import { useScrollFade, type ScrollFadeAxis } from '@/lib/fairway/use-scroll-fade';
import styles from './scroll-area.module.css';

export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Scroll axis/axes. Default `vertical`. */
  orientation?: ScrollAreaOrientation;
  /** Paint fades at the scrolled edges. Default `true`. */
  edgeFade?: boolean;
  /**
   * A slot pinned above the scrolling viewport (not part of the scroll
   * region) — a panel/rail title, a compact filter row. Optional.
   */
  stickyHeader?: ReactNode;
  /** Content of the scrolling viewport. */
  children?: ReactNode;
  /** Extra classes on the outer wrapper (header + viewport). */
  className?: string;
  /** Extra classes on the scrolling viewport itself. */
  viewportClassName?: string;
  'data-slot'?: string;
}

const OVERFLOW_CLASS: Record<ScrollAreaOrientation, string> = {
  vertical: 'overflow-y-auto overflow-x-hidden',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    orientation = 'vertical',
    edgeFade = true,
    stickyHeader,
    children,
    className,
    viewportClassName,
    'data-slot': dataSlot = 'fw-scroll-area',
    ...props
  },
  ref,
) {
  // `both` fades the vertical axis — the dominant orientation for a workspace
  // panel — since useScrollFade tracks one axis at a time.
  const fadeAxis: ScrollFadeAxis = orientation === 'horizontal' ? 'x' : 'y';
  const { ref: fadeRef, fadeStyle } = useScrollFade<HTMLDivElement>(fadeAxis);
  const composedRef = useComposedRefs(ref, fadeRef);

  return (
    <div data-slot={dataSlot} className={cn('flex min-h-0 flex-col', className)}>
      {stickyHeader ? (
        <div data-slot="fw-scroll-area-header" className="flex-shrink-0">
          {stickyHeader}
        </div>
      ) : null}
      <div
        ref={composedRef}
        data-slot="fw-scroll-area-viewport"
        style={{
          ...(edgeFade ? fadeStyle : undefined),
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
        className={cn('min-h-0 min-w-0 flex-1', OVERFLOW_CLASS[orientation], styles.viewport, viewportClassName)}
        {...props}
      >
        {children}
      </div>
    </div>
  );
});
