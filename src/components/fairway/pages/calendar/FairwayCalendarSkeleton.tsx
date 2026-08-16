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
          {/* Title column: eyebrow · month title · status line (gap-2, matching
              FairwayCalendarHero's title column — was gap-3). */}
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-44" />
          </div>

          {/* Action cluster — DESKTOP (md+): prev · today · next · primary,
              one row (mirrors FairwayCalendarHero's `hidden md:flex` row). */}
          <div className="hidden flex-shrink-0 items-center gap-2 md:flex">
            <Skeleton className="h-11 w-11 rounded-fw-md" />
            <Skeleton className="h-11 w-16 rounded-fw-md" />
            <Skeleton className="h-11 w-11 rounded-fw-md" />
            <Skeleton className="ml-1 h-11 w-28 rounded-fw-md" />
          </div>

          {/* Action cluster — PHONE ONLY: centered prev/today/next row, then a
              full-width primary CTA below (mirrors FairwayCalendarHero's
              `md:hidden` two-row layout — the real hero hand-composes this
              because the single-row shape overflows at ~390px). */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="grid grid-cols-3 items-center">
              <Skeleton className="h-11 w-11 justify-self-start rounded-fw-md" />
              <Skeleton className="h-9 w-14 justify-self-center rounded-fw-md" />
              <Skeleton className="h-11 w-11 justify-self-end rounded-fw-md" />
            </div>
            <Skeleton className="h-11 w-full rounded-fw-md" />
          </div>
        </div>

        {/* Day strip — seven day pills beneath the title (min-h-[78px]/[88px]
            + gap-1.5/2.5, matching FairwayDayStrip's real pill sizing — was a
            flat h-16/gap-2 that undershot both breakpoints). */}
        <div className="mt-6 grid grid-cols-7 gap-1.5 md:mt-8 md:gap-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[78px] w-full rounded-card md:h-[88px]" />
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

      {/* ── Agenda body — day-grouped event-card skeletons ─────────────────────
          Matches FairwayAgendaView's real composition: `gap-7` between day
          sections (was gap-4), a day header with an eyebrow label + hairline
          rule + count (was a bare label), and each event as its OWN bordered
          card (was one shared Surface wrapping avatar-led rows — the real
          FairwayEventCard has no avatar and no shared wrapper). */}
      <div className="flex flex-col gap-7">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="flex flex-col gap-2.5">
            <div className="mb-3 flex items-center gap-3">
              <Skeleton className="h-3 w-24" />
              <span aria-hidden className="h-px flex-1 bg-border-subtle" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 2 }).map((__, row) => (
                <div
                  key={row}
                  className="flex min-h-[64px] items-stretch gap-4 rounded-card border border-border-subtle bg-surface p-4"
                >
                  <div className="flex w-[68px] flex-shrink-0 flex-col justify-center gap-1.5 md:w-[84px]">
                    <Skeleton className="h-3.5 w-10" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-4 w-16 rounded-fw-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
