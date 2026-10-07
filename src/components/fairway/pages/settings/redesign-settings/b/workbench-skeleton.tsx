'use client';

/**
 * TEMP redesign direction B (removed before ship) · first-load skeleton.
 *
 * Holds the exact layout the workbench paints into: the rail's two-line rows
 * on desktop, the switcher strip and its summary line on a phone, and the
 * pane's first two titled cards. Uses the same grid and gutters as the real
 * page so nothing jumps when data lands.
 */

import { Surface } from '@/components/fairway';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { cn } from '@/lib/utils';

/** Varied widths so the rail skeleton reads as text, not as a barcode. */
const RAIL_STATUS_WIDTHS = ['w-40', 'w-32', 'w-36', 'w-28', 'w-44'] as const;

export function WorkbenchSkeleton({ gridClassName }: { gridClassName: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading settings&hellip;</span>
      <div className={gridClassName}>
        <div className="hidden lg:flex lg:flex-col lg:gap-1">
          {RAIL_STATUS_WIDTHS.map((width) => (
            <div
              key={width}
              className="flex min-h-[64px] flex-col justify-center gap-2 px-3.5 py-2.5"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className={cn('h-3', width)} />
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="-mx-4 border-b border-border-subtle px-4 py-2 md:-mx-6 md:px-6 lg:hidden">
            <Skeleton className="h-[54px] w-full" />
          </div>
          <div className="flex flex-col gap-7 pt-4 lg:pt-0">
            <Skeleton className="ml-1 h-3 w-48 lg:hidden" />
            {[0, 1].map((card) => (
              <div key={card} className="flex flex-col gap-2.5">
                <Skeleton className="ml-1 h-4 w-36" />
                <Surface elevation="border" padding="md" className="flex flex-col gap-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </Surface>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
