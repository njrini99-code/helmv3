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
 *   3. "Where the team is bleeding strokes" (`TeamBleedBoard`),
 *   4. "Team shot weaknesses" (`TeamShotWeaknesses`),
 *   5. the "Game pressure map" (`TeamSignalSummary`).
 *
 * Each card keeps its deep-green header with the real, static title: only
 * the data shimmers. The cards are container-query sized like the live ones
 * (`[container-type:inline-size]` and the same breakpoints), so the frame is
 * right at every width the dashboard rail leaves them.
 *
 * `loading.tsx` receives no search params, so a `?view=lab` or `?view=chat`
 * load also paints this frame first; Home is the default and the common case.
 */

/** segmented.tsx's TRACK_SUNKEN_SHADOW, copied: that module is a client
 *  module, and a plain value imported from one into this server file arrives
 *  as a client reference, not the string. */
const TRACK_SUNKEN_SHADOW =
  'inset 0 1px 3px oklch(0.18 0.01 60 / 0.10), inset 0 1px 0 oklch(0.18 0.01 60 / 0.04)';

function PlinthCard({ title, readout, children }: { title: string; readout?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft [container-type:inline-size]">
      <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <p className="min-w-0 font-fw-sans text-h3 font-semibold text-text-primary">{title}</p>
        {readout}
      </div>
      {children}
    </div>
  );
}

function BleedBoardSkeleton() {
  return (
    <PlinthCard
      title="Where the team is bleeding strokes"
      readout={
        <div className="flex shrink-0 items-center gap-2.5" aria-hidden="true">
          {/* The health ring's track, drawn the way HealthRing draws it. */}
          <span className="h-10 w-10 rounded-full border-4 border-text-primary/20" />
          <span className="flex flex-col gap-1">
            <span className="h-5 w-7 rounded-fw-sm bg-text-primary/15" />
            <span className="h-3 w-16 rounded-fw-sm bg-text-primary/10" />
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 divide-y divide-border-subtle [@container(min-width:1100px)]:grid-cols-5 [@container(min-width:1100px)]:divide-x [@container(min-width:1100px)]:divide-y-0">
        {[0, 1, 2, 3, 4].map((area) => (
          <div
            key={area}
            className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:p-5 [@container(min-width:600px)]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] [@container(min-width:600px)]:gap-8 [@container(min-width:1100px)]:flex [@container(min-width:1100px)]:flex-col [@container(min-width:1100px)]:gap-4"
          >
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-36 max-w-full" />
              </div>
              <Skeleton className="h-8 w-16" />
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-1.5 flex-1 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2 border-t border-border-subtle pt-3 [@container(min-width:600px)]:border-t-0 [@container(min-width:600px)]:pt-0 [@container(min-width:1100px)]:border-t [@container(min-width:1100px)]:pt-3">
              <Skeleton className="h-3 w-36" />
              <div className="grid grid-cols-1 gap-1 [@container(min-width:820px)]:grid-cols-3 [@container(min-width:820px)]:gap-x-5 [@container(min-width:1100px)]:grid-cols-1">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex min-h-[36px] items-center gap-2.5">
                    <Skeleton circle className="h-6 w-6 shrink-0" />
                    <Skeleton className="h-3.5 flex-1" />
                    <Skeleton className="h-3.5 w-10 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border-subtle px-4 py-3 sm:px-5">
        <Skeleton className="h-3 w-full max-w-xl" />
      </div>
    </PlinthCard>
  );
}

function ShotWeaknessesSkeleton() {
  return (
    <PlinthCard
      title="Team shot weaknesses"
      readout={<span className="shrink-0 font-fw-sans text-caption text-text-secondary">Last 90 days</span>}
    >
      <div className="grid grid-cols-1 [@container(min-width:880px)]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] [@container(min-width:880px)]:divide-x [@container(min-width:880px)]:divide-border-subtle">
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex flex-col divide-y divide-border-subtle">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                <Skeleton circle className="mt-0.5 h-6 w-6 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 border-t border-border-subtle p-4 sm:p-5 [@container(min-width:880px)]:border-t-0">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((zone) => (
              <div key={zone} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border-subtle px-4 py-3 sm:px-5">
        <Skeleton className="h-3 w-full max-w-2xl" />
      </div>
    </PlinthCard>
  );
}

function PressureMapSkeleton() {
  return (
    <PlinthCard
      title="Game pressure map"
      readout={
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-[26px] w-16 rounded-full border border-border-subtle" />
          <span className="h-[26px] w-28 rounded-full border border-border-subtle" />
        </div>
      }
    >
      <div className="grid grid-cols-1 [@container(min-width:760px)]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] [@container(min-width:760px)]:divide-x [@container(min-width:760px)]:divide-border-subtle">
        <div className="flex flex-col gap-2 border-b border-border-subtle p-4 sm:p-5 [@container(min-width:760px)]:border-b-0">
          <Skeleton className="h-4 w-3/4" />
          <div className="mx-auto grid aspect-[280/250] w-full max-w-[22rem] place-items-center">
            <Skeleton circle className="aspect-square h-[72%]" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 p-4 sm:p-5">
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-1 gap-x-6 [@container(min-width:1080px)]:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex min-h-[56px] items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
                <Skeleton circle className="h-6 w-6 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle">
        {[0, 1, 2].map((metric) => (
          <div key={metric} className="flex min-w-0 flex-col gap-1.5 px-3 py-4 sm:px-5">
            <Skeleton className="h-3 w-20 max-w-full" />
            <Skeleton className="h-8 w-10" />
          </div>
        ))}
      </div>
    </PlinthCard>
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

          <BleedBoardSkeleton />
          <ShotWeaknessesSkeleton />
          <PressureMapSkeleton />
        </div>
      </div>
    </div>
  );
}
