/**
 * ============================================================================
 * FairwayTasksSkeleton — the tasks field sheet's first paint
 * ----------------------------------------------------------------------------
 * Shape-matches FairwayTasks' composition: bare masthead, ONE Surface holding
 * the stage (readouts band above the field below `xl`, a rail beside it at
 * `xl`), the three-column ledger row, then the table.
 *
 * ONE component, TWO call sites. The route's Suspense fallback (loading.tsx)
 * covers the gap until the 'use client' page mounts; the page's own loading
 * branch then covers the gap until useTaskRealtime resolves. They used to be
 * two hand-maintained copies of the same markup, which is exactly how a
 * skeleton drifts into advertising a layout the page no longer has.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';
import { cn } from '@/lib/utils';

export function FairwayTasksSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8"
    >
      <span className="sr-only">Loading tasks…</span>

      {/* Masthead — eyebrow row with the actions, display title, verdict,
          facts line. Bare on the canvas, no plinth. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <Skeleton className="h-3 w-14" />
        <div className="flex flex-shrink-0 items-center gap-2">
          <Skeleton className="h-10 w-32 rounded-fw-md" />
          <Skeleton circle className="h-9 w-9" />
        </div>
      </div>
      <Skeleton className="mt-2 h-10 w-64 max-w-full" />
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-5 w-full max-w-[42ch]" />
        <Skeleton className="h-5 w-full max-w-[32ch]" />
      </div>
      <Skeleton className="mt-3 h-3 w-40" />

      {/* The stage — the one Surface. */}
      <Surface elevation="shadow" padding="none" className="mt-10 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="min-w-0 p-4 md:p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-1.5 h-6 w-40" />
            <Skeleton className="mt-2 h-3.5 w-full max-w-[52ch]" />
            <div className="mt-6 flex flex-col border-t border-border-strong">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-b border-border-subtle py-2 md:grid-cols-[13rem_minmax(0,1fr)_2.75rem_5rem] md:py-1"
                >
                  <div className="flex min-w-0 items-center gap-2.5 md:order-1">
                    <Skeleton circle className="h-6 w-6 shrink-0" />
                    <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 - (i % 3) * 12}%` }} />
                  </div>
                  <Skeleton className="h-3.5 w-6 justify-self-end md:order-3" />
                  <Skeleton className="h-3.5 w-12 justify-self-end md:order-4" />
                  <div className="col-span-3 h-11 md:order-2 md:col-span-1" />
                </div>
              ))}
            </div>
          </div>
          <div className="order-first border-b border-border-subtle p-4 md:p-6 xl:order-none xl:border-b-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4 md:gap-x-8 xl:flex xl:h-full xl:grid-cols-none xl:flex-col xl:justify-between xl:divide-y xl:divide-border-subtle">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-w-0 flex-col gap-1.5 py-2 xl:py-3.5 xl:first:pt-0 xl:last:pb-0">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Surface>

      {/* The ledger row — three bare columns of hairline rows. */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        {[
          'xl:col-span-5 xl:pr-8',
          'xl:col-span-3 xl:px-8',
          'md:col-span-2 xl:col-span-4 xl:pl-8',
        ].map((span, col) => (
          <div key={span} className={cn('flex min-w-0 flex-col gap-3', span)}>
            <Skeleton className="h-3 w-24" />
            <div className="flex flex-col">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
                  <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${72 - ((i + col) % 3) * 10}%` }} />
                  <Skeleton className="h-3 w-8 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The table — section head over the green ruling, control row, rows. */}
      <div className="mt-12">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-2.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-6" />
          </div>
          <div aria-hidden="true" className="h-px w-full bg-accent-300" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 min-w-[12rem] flex-1 rounded-fw-md md:max-w-sm" />
          <Skeleton className="h-9 w-48 rounded-fw-sm" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="mt-4 flex flex-col border-b border-border-strong pb-2">
          <Skeleton className="h-3 w-full max-w-[14rem]" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-3">
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - (i % 3) * 8}%` }} />
            <Skeleton className="hidden h-3.5 w-10 flex-shrink-0 md:block" />
            <Skeleton className="h-3.5 w-14 flex-shrink-0" />
            <Skeleton className="hidden h-3.5 w-20 flex-shrink-0 md:block" />
            <Skeleton className="hidden h-6 w-6 flex-shrink-0 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
