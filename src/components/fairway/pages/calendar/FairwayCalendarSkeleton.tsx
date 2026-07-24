/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarSkeleton (P235)
 * ----------------------------------------------------------------------------
 * The loading placeholder for the FAIRWAY calendar route. It mirrors the real
 * first paint of {@link FairwayCalendar} in its default AGENDA view — a hero
 * plinth (eyebrow + month title + nav cluster), a 7-pill day strip, the
 * Segmented view toggle + "Add to phone" row, and a short stack of agenda-card
 * skeletons — all in Fairway design tokens.
 *
 * WHY: the legacy `CalendarSkeleton` draws a 7am–6pm WEEK time-grid in the
 * legacy cream/warm palette. The live Fairway page never renders a week
 * time-grid on first paint (it defaults to Agenda), so that skeleton caused a
 * palette flip + layout shift when the real surface mounted. This token-true
 * skeleton matches the agenda first paint, so there's no CLS or palette flip.
 *
 * Pure presentation — no data, no interactivity. Marked `aria-busy` via the
 * group wrapper so assistive tech announces the loading state once.
 * ========================================================================== */

import { Surface, Skeleton } from '@/components/fairway';

export function FairwayCalendarSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-2 md:gap-6 md:px-6"
    >
      <span className="sr-only">Loading calendar…</span>

      {/* ── Hero plinth — mirrors FairwayCalendarHero (Surface shadow + lg pad) ── */}
      <Surface elevation="shadow" padding="lg" className="bg-surface">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
          {/* Title column: eyebrow · month title · status line */}
          <div className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-44" />
          </div>
          {/* Action cluster: prev · today · next · primary */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-fw-md" />
            <Skeleton className="h-10 w-16 rounded-fw-md" />
            <Skeleton className="h-10 w-10 rounded-fw-md" />
            <Skeleton className="ml-1 h-10 w-28 rounded-fw-md" />
          </div>
        </div>

        {/* Day strip — seven day pills beneath the title */}
        <div className="mt-6 grid grid-cols-7 gap-2 md:mt-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-fw-md" />
          ))}
        </div>
      </Surface>

      {/* ── View toggle row + "Add to phone" ──────────────────────────────────── */}
      {/* Shape-matches the real row's stack-then-row breakpoint (see
          FairwayCalendar.tsx) so there's no CLS when the real controls
          mount. */}
      <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Skeleton className="h-11 w-full min-w-0 rounded-fw-md sm:w-auto sm:flex-1" />
        <Skeleton className="h-9 w-32 rounded-fw-md" />
      </div>

      {/* ── Agenda body — a few day-grouped event-card skeletons ──────────────── */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-24" />
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((__, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-fw-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-fw-sm" />
                </div>
              ))}
            </Surface>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FairwayCalendarSkeleton;
