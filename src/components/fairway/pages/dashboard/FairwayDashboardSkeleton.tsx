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
 *   2. KPI row  — a neutral 2/4-up MetricCard `loading` grid. Both dashboards
 *      render exactly four MetricCard tiles in their KPI row (coach: Scoring
 *      Avg / GIR % / Putts / Roster; player: Scoring avg / GIR / Putts /
 *      Handicap) — same tile COUNT and shape either way.
 *   3. Two balanced content columns — a generic pair of matte Panel groups
 *      (one "chart/list" block + one row-list block per column) standing in
 *      for whatever the resolved role actually renders below the KPI row
 *      (coach: Today / Recent Rounds / Action Items / Team region; player:
 *      hero / trend / genome / standing / Today / recent rounds / focus
 *      areas). Neither role's real layout is reproduced exactly — that would
 *      require knowing the role before the page has resolved it — but the
 *      two-column, evenly-weighted shape reads as a calm placeholder for
 *      either outcome instead of visibly "coach-shaped" chrome flashing on a
 *      player's first load (or vice versa).
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
function Panel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-card border border-border-subtle bg-surface ${className ?? ''}`}>
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

      {/* ── 2 · KPI row — neutral 2/4-up MetricCard shells; both roles render
          exactly four tiles here (see file doc) ──────────────────────────── */}
      <div aria-hidden="true" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="" value={0} loading />
        <MetricCard label="" value={0} loading />
        <MetricCard label="" value={0} loading />
        <MetricCard label="" value={0} loading />
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
