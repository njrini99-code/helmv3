/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarSkeleton (P235)
 * ----------------------------------------------------------------------------
 * The loading placeholder for the FAIRWAY calendar route. It mirrors the real
 * first paint of {@link FairwayCalendar} in its default AGENDA view — the
 * masthead, the coach's hairline people row, and ONE matte stage holding a
 * short stack of day sections (a heading seam, then time-column rows) — all
 * in Fairway design tokens.
 *
 * WHY: the legacy `CalendarSkeleton` draws a 7am–6pm WEEK time-grid in the
 * legacy cream/warm palette. The live Fairway page never renders a week
 * time-grid on first paint (it defaults to Agenda), so that skeleton caused a
 * palette flip + layout shift when the real surface mounted. This token-true
 * skeleton matches the agenda first paint — one hairline people row, one
 * matte stage of three hairline-divided day sections — so there's no CLS or
 * palette flip.
 *
 * MASTHEAD: two shapes, matching FairwayCalendarHero (phone, `md:hidden`,
 * matte two-line bar) and FairwayCalendarToolbar (desktop, `md:flex`, one
 * sticky-frost row: leading title cluster, view switcher, primary action) —
 * the same breakpoint split as the real masthead pair in FairwayCalendar.tsx,
 * so the skeleton never shows the wrong shape at either width and there's no
 * reflow when the real masthead mounts in its place.
 *
 * Pure presentation — no data, no interactivity. Marked `aria-busy` via the
 * group wrapper so assistive tech announces the loading state once.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway';

export function FairwayCalendarSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pb-6 md:gap-5 md:px-6"
    >
      <span className="sr-only">Loading calendar…</span>

      {/* ── Phone masthead — mirrors FairwayCalendarHero: title row, then the
          full-width switcher (`md:hidden`, matte). ──────────────────────── */}
      <div className="-mx-4 border-b border-border-subtle px-4 pb-2.5 pt-2 md:hidden">
        <div className="flex min-h-11 items-center gap-2">
          <Skeleton className="h-7 w-44 rounded-fw-sm" />
          <span className="flex-1" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-11 w-full rounded-fw-sm" />
        </div>
      </div>

      {/* ── Desktop masthead — mirrors FairwayCalendarToolbar: ONE sticky-
          frost Toolbar row (leading title cluster · view switcher · primary
          action), `hidden` below md, `md:flex` from md up. ────────────────── */}
      <div className="hidden min-h-[60px] items-center gap-3 rounded-card border border-border-subtle bg-surface px-3 py-2 md:flex">
        <div className="flex shrink-0 items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-fw-sm" />
        </div>
        <Skeleton className="h-8 w-56 rounded-full" />
        <span className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-fw-sm" />
        <Skeleton className="h-8 w-28 rounded-fw-sm" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      {/* ── People row — mirrors FairwayCalendarMemberRail's hairline row ── */}
      <div className="flex min-h-11 items-center gap-3 border-b border-border-subtle">
        <div className="flex -space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-full ring-2 ring-canvas" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-9 w-24 rounded-fw-sm" />
      </div>

      {/* ── Agenda body — ONE matte stage, day headings as hairline seams ── */}
      <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className={group > 0 ? 'border-t border-border-subtle' : undefined}>
            <div className="flex items-baseline gap-2 border-b border-border-subtle bg-surface px-3 py-1.5 md:px-4">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-12" />
            </div>
            {Array.from({ length: group === 1 ? 1 : 2 }).map((__, row) => (
              <div
                key={row}
                className={
                  row > 0
                    ? 'flex items-stretch gap-3 border-t border-border-subtle px-3 py-2.5 md:gap-4 md:px-4 md:py-3'
                    : 'flex items-stretch gap-3 px-3 py-2.5 md:gap-4 md:px-4 md:py-3'
                }
              >
                <div className="flex w-[60px] shrink-0 flex-col justify-center gap-1.5 md:w-[72px]">
                  <Skeleton className="h-4 w-11" />
                  <Skeleton className="h-3 w-9" />
                </div>
                <span aria-hidden className="w-px self-stretch bg-border-subtle" />
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-0.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
