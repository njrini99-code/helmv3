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
 *      DayScheduleSwipe; coach: the Today panel — home.v2.md §4); a
 *      ranked-list shape (KPI band + rows) on the right, standing in for
 *      coach's "Who needs attention" board (a MatrixBoard) and, as an
 *      accepted mismatch, for player's own KPI row + trend chart (see the
 *      DEVIATION note below). The 132px schedule body height is
 *      DayScheduleSwipe's own reserved min-height, so the real card lands on
 *      these pixels rather than near them.
 *   3. A full-width cockpit-shaped band (2026-09-10, home.v2.md §5) — a
 *      focal block + a two-panel flanking rail, standing in for the
 *      InstrumentCluster "Team performance" cockpit this pass promotes to
 *      its own full-width row below the operations row. Coach-only content;
 *      inserted here (rather than folded into row 1) precisely because it no
 *      longer lives in a half-width column.
 *   4. Two balanced content columns — a generic pair of matte Panel groups
 *      (one "chart/list" block + one row-list block per column) standing in
 *      for whatever the resolved role actually renders below (coach: Recent
 *      rounds / Activity — home.v2.md §6; player: genome / standing / recent
 *      rounds / focus areas). Neither role's real layout is reproduced
 *      exactly — that would require knowing the role before the page has
 *      resolved it — but the two-column, evenly-weighted shape reads as a
 *      calm placeholder for either outcome instead of visibly "coach-shaped"
 *      chrome flashing on a player's first load (or vice versa).
 *
 * DEVIATION (2026-09-10, home.v2.md §7 "Implementation plan"): row 1's right
 * column used to hold a 2×2 MetricCard tile grid + a chart-shaped block,
 * shape-matching BOTH coach's old "Team performance" panel AND player's KPI
 * row + trend chart at once (they happened to share a shape). Coach's panel
 * in that position is now a ranked-list shape (Who-needs-attention), so this
 * skeleton follows it — the player dashboard is untouched by this pass and
 * still renders a KPI-tile-grid + trend pairing in that exact spot, so this
 * change trades WHICH role's loading state mismatches, the same bounded
 * trade-off this file's design already accepts elsewhere (item 2 above).
 * Neither role's swap fully disappears; this shifts which one is left.
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

import { Skeleton } from '@/components/fairway';

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

      {/* ── 2 · Row 1 (7/5) — schedule band | ranked-list shape. Player
          mounts DayScheduleSwipe beside its KPI row + trend; coach mounts
          the Today panel beside the Who-needs-attention board (home.v2.md
          §4 — renamed/reshaped from "Team pulse", which itself replaced the
          coach-home.md "Team performance" panel that used to sit here).
          Both sit at the top of the page, so the placeholder has to match
          the asymmetric grid or first paint reshuffles on handoff. ────── */}
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

        {/* Ranked-list shape (2026-09-10, home.v2.md §4/§7) — a KPI band
            + several ranked rows, matching `MatrixBoard`'s own silhouette
            (Who-needs-attention) now that this position no longer holds a
            2×2 tile grid + chart on the coach side.

            KNOWN, ACCEPTED SWAP (same trade-off this file's doc already
            makes elsewhere — see the schedule-band note above): the
            player dashboard is untouched by this pass and still renders a
            KPI-tile-grid + trend pairing in this exact position, so this
            shape is now a deliberate mismatch for THAT role's loading
            state in exchange for matching the role this pass actually
            changed. This trades which role's swap happens; it does not
            remove one. */}
        <Panel className="flex flex-col overflow-hidden lg:col-span-5">
          <div className="grid grid-cols-3 gap-3 border-b border-border-subtle p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
              >
                <Skeleton circle className="h-6 w-6 shrink-0" />
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${58 - i * 8}%` }} />
                <Skeleton className="h-3.5 w-9" />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── NEW · Team performance cockpit band, full width (2026-09-10,
          home.v2.md §5) — stands in for the InstrumentCluster this pass
          promotes to its own full-width row: a focal block + a flanking
          rail of two, so the real cockpit lands close to these pixels
          instead of the KPI-tile-grid this position used to hold. Coach-
          only content; the player dashboard's own layout below this row is
          untouched, same generic "two balanced columns" shape as before. */}
      <div aria-hidden="true" className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_minmax(15rem,1fr)] lg:gap-6">
        <Panel className="flex flex-col gap-4 p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-40 w-full rounded-fw-md" />
        </Panel>
        <div className="flex flex-col gap-5 lg:gap-6">
          <Panel className="flex flex-col gap-3 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24" />
          </Panel>
          <Panel className="flex flex-col gap-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-24" />
          </Panel>
        </div>
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
