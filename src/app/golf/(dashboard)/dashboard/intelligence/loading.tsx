import type { ReactNode } from 'react';
import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for CoachHelm (/dashboard/intelligence).
 *
 * The page opens on Home (`TriageDesk`, `?view=home`), so this is Home's
 * shape, top to bottom in the live DOM order, so nothing above the fold moves
 * when the data lands:
 *
 *   1. the Home · The Lab · Chat toggle (`ViewSwitch`: a 54px sunken track,
 *      full width on a phone),
 *   2. the greeting (h1 + status line) with the last-scan time and Scan team
 *      on its right,
 *   3. Team intelligence (`intel/TeamIntelligence`): filters, four theme
 *      cards, the cause visual and spotlight, and who is contributing.
 *
 * Container-query sized with the live breakpoints, so the frame is right at
 * every width the dashboard rail leaves it.
 *
 * `loading.tsx` receives no search params, so a `?view=lab` or `?view=chat`
 * load also paints this frame first; Home is the default and the common case.
 */

/** segmented.tsx's TRACK_SUNKEN_SHADOW, copied: that module is a client
 *  module, and a plain value imported from one into this server file arrives
 *  as a client reference, not the string. */
const TRACK_SUNKEN_SHADOW =
  'inset 0 1px 3px oklch(0.18 0.01 60 / 0.10), inset 0 1px 0 oklch(0.18 0.01 60 / 0.04)';

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`flex min-w-0 flex-col rounded-card border border-border-subtle bg-surface ${className ?? ''}`}>{children}</div>;
}

/** Team intelligence (`intel/TeamIntelligence`): the filter row, four theme
 *  cards, then the cause visual + spotlight beside who is contributing. */
function TeamIntelligenceSkeleton() {
  return (
    <div className="flex flex-col gap-5 [container-type:inline-size]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-[26rem] max-w-full rounded-fw-md sm:h-10" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-44 rounded-fw-md sm:h-10" />
          <Skeleton className="h-11 w-52 rounded-fw-md sm:h-10" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 [@container(min-width:720px)]:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Card key={card} className="gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 [@container(min-width:1000px)]:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-48" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="aspect-[4/3] w-full" />
            <Skeleton className="h-3 w-full rounded-full" />
          </Card>
          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <Skeleton circle className="size-[76px] shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-40 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((tile) => (
                <Skeleton key={tile} className="h-[92px] rounded-fw-md" />
              ))}
            </div>
          </Card>
        </div>
        <Card className="gap-2 p-3 sm:p-4">
          <div className="space-y-1.5 px-1 pb-2 pt-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-[72px] rounded-fw-md" />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center gap-3 border-t border-border-subtle px-2 py-3 first:border-t-0">
              <Skeleton circle className="size-12 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-4 w-10 shrink-0" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div aria-busy="true" className="flex flex-col gap-6">
          {/* A11Y-02: the live region is only this line, not the whole skeleton (Skeleton is aria-hidden). */}
          <span role="status" aria-live="polite" className="sr-only">
            Loading CoachHelm…
          </span>

          {/* The toggle is static chrome, so it paints as it will look, Home
              selected: the same sunken track, solid green pill and cream
              label as ViewSwitch (segmented.tsx), inert until the page lands. */}
          <div className="flex items-center" aria-hidden="true">
            <div
              className="flex h-[54px] w-full items-stretch gap-1 rounded-fw-sm border border-border-control bg-surface-sunken p-1 sm:w-auto"
              style={{ boxShadow: TRACK_SUNKEN_SHADOW }}
            >
              {['Home', 'The Lab', 'Chat'].map((label, index) => (
                <span
                  key={label}
                  className={
                    index === 0
                      ? 'flex flex-1 items-center justify-center rounded-fw-sm border border-accent-fill-hover bg-accent-fill px-5 font-fw-sans text-body-sm font-semibold text-text-on-accent-fill shadow-flat dark:border-accent-500 dark:bg-accent-wash dark:text-accent-ink sm:flex-none'
                      : 'flex flex-1 items-center justify-center px-5 font-fw-sans text-body-sm font-medium text-text-secondary dark:text-text-primary sm:flex-none'
                  }
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* The greeting, with the last-scan time and Scan team beside it. */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-9 w-64 max-w-full" />
              <Skeleton className="mt-2 h-4 w-80 max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          </div>

          <TeamIntelligenceSkeleton />
        </div>
      </div>
    </div>
  );
}
