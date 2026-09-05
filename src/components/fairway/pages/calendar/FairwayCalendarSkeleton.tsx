/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarSkeleton (P235, reshaped for S1)
 * ----------------------------------------------------------------------------
 * The loading placeholder for the FAIRWAY calendar route. It mirrors the real
 * first paint of {@link FairwayCalendar} in its default AGENDA view — the
 * masthead band (month title + overflow + the sunken week track), the one meta
 * line + view-toggle row, and a short stack of agenda-card skeletons — all in
 * Fairway design tokens.
 *
 * WHY THE SHAPE MATTERS, TWICE OVER.
 *
 * Round one: the legacy `CalendarSkeleton` drew a 7am–6pm WEEK time-grid in the
 * legacy cream/warm palette. The live Fairway page never renders a week
 * time-grid on first paint (it defaults to Agenda), so that skeleton caused a
 * palette flip + layout shift when the real surface mounted.
 *
 * Round two (S1): this file then drew the RETIRED hero — a `Surface
 * padding="lg"` plinth with an eyebrow, a 32px title, a status line, a
 * prev/Today/next cluster, a full-width CTA and 78/88px day pills. Left alone
 * it would have flashed the old hero on every navigation to the calendar and
 * then collapsed ~200px when the real masthead mounted — the exact trap the
 * rebuild brief calls out in §6. A skeleton that outlives the layout it copies
 * is worse than no skeleton: it advertises the old design one paint at a time.
 *
 * This file is used in THREE places (route `loading.tsx`, page.tsx's
 * `dynamic()` fallback, and page.tsx's interior `<Suspense>`), so it is the
 * single place that shape has to be right.
 *
 * Pure presentation — no data, no interactivity. Marked `aria-busy` via the
 * group wrapper so assistive tech announces the loading state once.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway';
import { SEGMENTED_TRACK_SUNKEN_SHADOW } from '@/components/fairway/controls';

export function FairwayCalendarSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 pb-2 pt-2 md:gap-4 md:px-6"
    >
      <span className="sr-only">Loading calendar…</span>

      {/* ── Masthead band — mirrors FairwayCalendarMasthead exactly: the same
          full-bleed negative gutter, the same bg-elevated plane, the same
          bottom hairline, the same paddings. ─────────────────────────────── */}
      <div className="-mx-4 border-b border-border-subtle bg-elevated px-4 pb-2.5 pt-1 md:-mx-6 md:px-6 md:pb-3">
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          {/* Month + year title with its picker chevron. */}
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          {/* The one trailing overflow control (IconButton size="sm"). */}
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>

        {/* The week track — ONE sunken well, seven cells inside it, not seven
            separate tiles. Painted for real (bg + the shared sunken shadow)
            rather than skeleton-greyed, because the track itself is chrome that
            does not depend on data: it is already correct on the first paint. */}
        <div
          className="mt-1 grid grid-cols-7 gap-0.5 rounded-full bg-surface-sunken p-1"
          style={{ boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[44px] flex-col items-center justify-center gap-[3px] px-0.5 py-1.5"
            >
              <Skeleton className="h-2 w-6" />
              <Skeleton className="h-3 w-4" />
              <span className="h-[3px]" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Meta line + view toggle, sharing one row ───────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        {/* Segmented size="lg", intrinsic width — narrower below `sm` where the
            labels abbreviate to D / W / M (see FairwayCalendar's VIEW_OPTIONS). */}
        <Skeleton className="h-11 w-[232px] flex-shrink-0 rounded-fw-sm sm:w-[308px]" />
      </div>

      {/* ── Agenda body — day-grouped event-card skeletons ─────────────────────
          Matches FairwayAgendaView's real composition: `gap-7` between day
          sections, a day header with an eyebrow label + hairline rule + count,
          and each event as its OWN bordered card. */}
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
