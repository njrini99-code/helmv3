'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayDashboardSkeleton
 * ----------------------------------------------------------------------------
 * Shared `loading.tsx` shell for BOTH `/golf/dashboard` roles (and, via
 * `golf/loading.tsx`, several other routes' parent boundary). Role isn't
 * known until the async page resolves the session, so this paints the
 * field-sheet silhouette both homes now share
 * (docs/design/fairway-facelift/LANGUAGE.md): a bare masthead (eyebrow,
 * title, verdict, facts), one stage Surface with an instrument on the left
 * and readouts on the right, a three column ledger row, then a table.
 * Widths and vertical rhythm match FairwayCoachDashboard so the resolved
 * page lands on these pixels instead of reflowing past them.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway';

const ROW_WIDTHS = [72, 64, 80, 58, 70, 66, 76, 60];

export function FairwayDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col px-5 pt-6 pb-10 md:px-8 md:pt-8 md:pb-28"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* Masthead: eyebrow row with actions, title, verdict, facts. */}
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-56 max-w-full" />
          <div className="flex items-center gap-2">
            <Skeleton circle className="h-10 w-10" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-72 max-w-full md:h-11" />
        <Skeleton className="h-6 w-full max-w-[40rem] md:h-7" />
        <Skeleton className="mt-1 h-3.5 w-80 max-w-full" />
      </div>

      {/* The stage: header row, then instrument rows beside a readouts column. */}
      <div aria-hidden="true" className="mt-10 overflow-hidden rounded-card border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle px-5 py-4 md:px-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
          <Skeleton className="h-8 w-56 max-w-full rounded-full" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="order-2 flex flex-col px-5 py-4 md:px-6 md:py-5 xl:order-1">
            {ROW_WIDTHS.map((w, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-2 last:border-b-0 md:py-1.5">
                <Skeleton circle className="h-6 w-6 shrink-0" />
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <div className="relative h-8 flex-1">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
                </div>
                <Skeleton className="h-3.5 w-8 shrink-0" />
                <Skeleton className="h-3.5 shrink-0" style={{ width: `${w / 2}px` }} />
              </div>
            ))}
            <div className="mt-2 flex justify-between">
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          </div>
          <div className="order-1 grid grid-cols-2 gap-x-6 border-b border-border-subtle px-5 py-4 md:grid-cols-4 md:px-6 md:py-5 xl:order-2 xl:flex xl:grid-cols-none xl:flex-col xl:divide-y xl:divide-border-subtle xl:border-b-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 py-2 xl:py-3.5 xl:first:pt-0 xl:last:pb-0">
                <Skeleton className="h-2.5 w-20" />
                <div className="flex items-end justify-between gap-3">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger row: three bare columns. */}
      <div aria-hidden="true" className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        {/* Static class strings: Tailwind cannot extract an interpolated `xl:col-span-${n}`. */}
        {[
          'xl:col-span-5 xl:pr-8',
          'xl:col-span-3 xl:px-8',
          'md:col-span-2 xl:col-span-4 xl:pl-8',
        ].map((span, col) => (
          <div key={col} className={`flex flex-col gap-3 ${span}`}>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="h-px w-full bg-border-subtle" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${ROW_WIDTHS[(i + col) % ROW_WIDTHS.length] ?? 64}%` }} />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Table. */}
      <div aria-hidden="true" className="mt-12 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="h-px w-full bg-border-subtle" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border-subtle py-2.5">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${(ROW_WIDTHS[i % ROW_WIDTHS.length] ?? 64) / 2}%` }} />
            <Skeleton className="hidden h-3.5 w-32 md:block" />
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="h-3.5 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
