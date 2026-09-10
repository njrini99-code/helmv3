'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayDashboardSkeleton  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * Shared `loading.tsx` shell for BOTH `/golf/dashboard` roles. Role isn't known
 * until the async page component resolves `getGolfSessionProfile()` server-side
 * (see session.ts), so this skeleton renders before the coach/player fork and
 * must not commit to either FairwayCoachDashboard's or FairwayPlayerDashboard's
 * exact section list.
 *
 * Composition (deliberately GENERIC, not a section-by-section mirror):
 *   1. Masthead — ViewHeader-shaped: eyebrow + Fraunces title + description +
 *      the promoted action cluster. Both dashboards render a ViewHeader here,
 *      so this part IS a safe shape-match for either role.
 *   2. Row 1 (7/5 asymmetric grid) — a schedule band on the left standing in
 *      for the schedule block BOTH roles render first (player:
 *      DayScheduleSwipe; coach: the merged Today panel — coach-home.md); a
 *      KPI-shaped 2×2 tile grid + chart-shaped block on the right, standing
 *      in for coach's "Team performance" panel (window Segmented + StatMatrix
 *      + Performance Trend, now ONE panel per the facelift) and for player's
 *      KPI row + trend chart. The 132px schedule body height is
 *      DayScheduleSwipe's own reserved min-height, so the real card lands on
 *      these pixels rather than near them.
 *
 *      DEVIATION (facelift pass, coach-home.md): this row used to be TWO
 *      full-width, stacked regions — a schedule band, then a separate
 *      full-width 4-up KPI grid. The facelift recomposed the coach dashboard's
 *      top-of-page into a 7/5 grid (Today | Team performance), so a
 *      full-width KPI row is now a real coach-first-paint mismatch. Player's
 *      dashboard is untouched by this pass and still renders its KPI row
 *      full-width above its own chart — moving the KPI shell into a 5-col
 *      right rail is a deliberate, bounded mismatch for THAT role's loading
 *      state (same tile count, narrower band) in exchange for matching the
 *      role this pass actually changed. Neither role's swap fully
 *      disappears; this shifts which one is left.
 *   3. Two balanced content columns — a generic pair of matte Panel groups
 *      (one "chart/list" block + one row-list block per column) standing in
 *      for whatever the resolved role actually renders below row 1 (coach:
 *      Team pulse board / Latest, then Recent Rounds — coach-home.md; player:
 *      genome / standing / recent rounds / focus areas). Neither role's real
 *      layout is reproduced exactly — that would require knowing the role
 *      before the page has resolved it — but the two-column, evenly-weighted
 *      shape reads as a calm placeholder for either outcome instead of
 *      visibly "coach-shaped" chrome flashing on a player's first load (or
 *      vice versa).
 *
 * Previously (pre-2026-07-22) this skeleton mirrored FairwayCoachDashboard's
 * exact 7-region layout 1:1, including a `<InsightCard variant="hero" loading>`
 * slot for the coach "CoachHelm signal" hero. That hero was removed from
 * FairwayCoachDashboard (coach-signal.ts is now dead code, deleted) — the old
 * skeleton kept reserving its space, so first paint on the coach dashboard
 * shifted once the real (hero-less) page took over. This rewrite drops that
 * slot, and the rest of the coach-only section mirroring, in the same pass.
 *
 * Tokens only (bg-canvas / bg-surface / border-border-subtle / rounded-card),
 * Skeleton primitives for the shimmer (banned: spinners, arbitrary hex). The
 * whole group carries the loading a11y contract via the Skeleton groups.
 * ========================================================================== */

import { Skeleton, MetricCard } from '@/components/fairway';

/** A matte Fairway Surface-shaped block (border elevation, rounded-card). */
function Panel({
  className,
  children,
  ...rest
}: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`rounded-card border border-border-subtle bg-surface ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function FairwayDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-5 py-8 md:gap-10 md:px-8 md:py-10"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* ── 1 · Masthead — ViewHeader PLINTH silhouette (shared by both roles)
          Every class here is copied from what ViewHeader actually renders with
          `plinth` at default size, so the real header lands on exactly these
          pixels rather than near them:
            plinth band   `rounded-fw-lg bg-surface-tint px-8 py-7` + `gap-4`
            masthead row  `flex flex-col gap-5 sm:flex-row sm:items-start
                           sm:justify-between`
            title column  `flex min-w-0 flex-col gap-1.5`
          The plinth is rendered as a REAL tinted band, not a shimmer block:
          `bg-surface-tint` is chrome the resolved header keeps, so painting it
          here means the band is simply already there when the text arrives. */}
      <div className="flex w-full flex-col gap-4 rounded-fw-lg bg-surface-tint px-6 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* eyebrow → title → description, on the header's own 1.5 rhythm */}
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
            {/* meta row — the opener's fact chips */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>
      </div>

      {/* ── 2 · Row 1 (7/5) — schedule band | KPI + chart. Player mounts
          DayScheduleSwipe beside its KPI row + trend; coach mounts the merged
          Today panel beside the Team performance panel (window Segmented +
          StatMatrix + Performance Trend, coach-home.md). Both sit at the top
          of the page, so the placeholder has to match the asymmetric grid or
          first paint reshuffles on handoff. ─────────────────────────────── */}
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Schedule band — day-chip strip + a body reserved at
            DayScheduleSwipe's own min-h-[132px] (~2 event rows), so the real
            card lands on these pixels rather than near them. */}
        <Panel className="flex flex-col gap-4 p-4 md:p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-12 flex-1 rounded-fw-sm" />
            ))}
          </div>
          <div className="flex min-h-[132px] flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-fw-md bg-surface-sunken px-3 py-3">
                <Skeleton circle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${68 - i * 16}%` }} />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* KPI + chart — a neutral 2×2 MetricCard `loading` grid (both roles
            render four tiles here — coach: Scoring Avg / GIR / Putts /
            Rounds; player: Scoring avg / GIR / Putts / Handicap — same tile
            COUNT either way, see file doc) plus a chart-shaped block beneath,
            matching coach's Team performance panel and player's KPI+trend
            pairing.

            KNOWN, ACCEPTED SWAP: a player with zero rounds played renders no
            KPI grid at all (FairwayPlayerDashboard's cold-start branch), so
            for that one account state these four shells are never fulfilled.
            The skeleton cannot tell — role AND round count are both
            server-resolved after this renders — and dropping the grid would
            trade one account state's swap for every other account's. Keeping
            it is the deliberate choice. */}
        <Panel className="flex flex-col gap-4 p-4 md:p-5 lg:col-span-5">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <Skeleton className="h-40 w-full rounded-fw-md" />
        </Panel>
      </div>

      {/* ── 3 · Two balanced content columns — generic, role-agnostic panel
          groups (see file doc for why this isn't a coach- or player-specific
          section mirror) ──────────────────────────────────────────────────── */}
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Panel className="flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-44 w-full rounded-fw-md" />
          </Panel>
          <Panel className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-fw-md bg-surface-sunken px-4 py-3"
              >
                <Skeleton circle className="h-8 w-8" />
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${62 - i * 10}%` }} />
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel className="flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-44 w-full rounded-fw-md" />
          </Panel>
          <Panel className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-fw-md px-3 py-2.5">
                <Skeleton circle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 - i * 15}%` }} />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
