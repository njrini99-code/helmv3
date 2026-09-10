'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayDashboardSkeleton  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * Shared `loading.tsx` shell for BOTH `/golf/dashboard` roles (and, via
 * `golf/loading.tsx` → `FairwayShellSkeleton`, several other routes' parent
 * boundary too). Role isn't known until the async page component resolves
 * `getGolfSessionProfile()` server-side (see session.ts), so this skeleton
 * renders before the coach/player fork and must not commit to either
 * `FairwayCoachDashboard`'s or `FairwayPlayerDashboard`'s exact section list.
 *
 * 2026-09-10: BOTH dashboards now have their own v2 composition
 * (`docs/design/fairway-facelift/screens/home.v2.md` for coach,
 * `player-home.v2.md` for player) and, critically, they put DIFFERENT SHAPES
 * in the SAME grid slots — one role's chart-shaped column is the other role's
 * schedule-list column, one role's tall cockpit is the other role's flat KPI
 * strip. No single generic silhouette can match both at once, so every
 * section below deliberately picks ONE role's real shape and documents which
 * role's mismatch it accepts — the same trade-off this file made before
 * (2026-07-22), now applied consistently across the whole page rather than
 * only row 1.
 *
 * Composition, and which role each section favors:
 *   1. Masthead — ViewHeader-shaped (shared, unchanged): eyebrow + title +
 *      description + the promoted action cluster. Identical geometry on both
 *      dashboards; no swap needed.
 *   2. Verdict line (home.v2.md §2) — COACH-FAVORED: one bare text-shaped
 *      bar, no card. The coach page's real one-sentence verdict lands here.
 *      Player's stage carries its own verdict sentence, but INSIDE the
 *      Ribbon panel in row 1 below, not as a standalone line at this
 *      position — a single line collapsing on handoff is the accepted,
 *      minor cost.
 *   3. Toolbar (home.v2.md §3) — COACH-FAVORED: a bare row (one bottom
 *      hairline, matching `Toolbar`'s own bare-frame-at-rest chrome) with
 *      one right-pinned pill, standing in for the sticky Segmented/Menu
 *      window control (always rendered; the leading signals pill is
 *      conditional, so it is not reserved). Player has no toolbar at this
 *      position at all — same accepted, minor cost.
 *   4. Row 1 (7/5) — PLAYER-FAVORED (this reverses which role this exact
 *      slot favored before player's own v2 pass landed): the LEFT 7-col is
 *      a `SectionTitle` bar-pair above a flat (`depth="base"`) Panel
 *      standing in for `PlayerStage`'s `Ribbon` — a header line (the
 *      verdict sentence `Ribbon` renders as its own bezel header), a
 *      below-placed value + delta readout line, then the 180px plot at
 *      `Ribbon`'s own fixed `height={180}`, so the real chart lands on
 *      these pixels rather than near them. The RIGHT 5-col stacks a
 *      Surface-shaped schedule card — `DayScheduleSwipe`'s own header row,
 *      day-switcher row, 7-day chip rail, and two reserved event rows —
 *      above a bare "Needs you" seam-row group (`TodayTasks`). Coach's real
 *      content here — Today (bare seam rows + a new `AgendaStrip` hour
 *      rail) beside Who-needs-attention (a `MatrixBoard`) — now takes the
 *      mismatch this slot used to spare it: its schedule-shaped left column
 *      becomes a chart, its ranked-list-shaped right column becomes a
 *      schedule. Trading which role's swap happens, not removing one.
 *   5. Full-width band — PLAYER-FAVORED: one bordered `StatMatrix`-shaped
 *      KPI strip (2-up on a phone, 4-across from `sm`, `columns={4}` per the
 *      real page's own call) — flat, no chart, no rail, "at every width"
 *      per the real component's own contract. Coach's real content here (a
 *      full `InstrumentCluster`: a focal accent bezel + benchmarked chart, a
 *      2-panel flanking rail, and a 3-cell tertiary foot row) is
 *      considerably taller than this strip; that height jump on handoff is
 *      the accepted coach-side cost of favoring player's flatter shape.
 *   6. Ledger row (8/4, home.v2.md §6) — COACH-FAVORED: a bordered Panel (a
 *      bar-strip band + row list, standing in for the sign-colored
 *      `TickerStrip` + Recent Rounds list) beside a BARE seam-row list
 *      (Activity / `NotificationsLatestModule frame="bare"`). Player's real
 *      pair here (`SgFacetsPanel` + `RecentRoundsList`, both bordered
 *      `Surface`s, evenly split at `md:grid-cols-2`) mismatches this slot
 *      twice over — the proportion (8/4 vs 6/6) and the right column's
 *      chrome (bare here, bordered for real) — the accepted player-side cost
 *      of favoring coach's own ledger row, balancing the player-favored swap
 *      spent in row 1 above.
 *
 * Previously (pre-2026-07-22) this skeleton mirrored FairwayCoachDashboard's
 * exact 7-region layout 1:1, including a `<InsightCard variant="hero" loading>`
 * slot for the coach "CoachHelm signal" hero that no longer exists. That
 * 1:1-mirror approach is exactly what this file has moved away from since —
 * a shared pre-role skeleton cannot mirror two now-divergent layouts at once,
 * so it stopped trying and started documenting its trade-offs instead.
 *
 * Tokens only (bg-canvas / bg-surface / border-border-subtle / rounded-card),
 * Skeleton primitives for the shimmer (banned: spinners, arbitrary hex, and
 * any real copy — shapes only, no text). The whole group carries the loading
 * a11y contract via the Skeleton groups.
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

      {/* ── 2 · Verdict line (home.v2.md §2) — bare text, no card. Coach-
          favored; see file doc for the player-side trade. ──────────────── */}
      <div aria-hidden="true">
        <Skeleton className="h-6 w-2/3 max-w-md md:h-7" />
      </div>

      {/* ── 3 · Toolbar (home.v2.md §3) — bare row, one bottom hairline
          (matches `Toolbar`'s own bare-frame-at-rest chrome), one right-
          pinned pill standing in for the Segmented/Menu window control.
          Coach-favored; see file doc for the player-side trade. ────────── */}
      <div
        aria-hidden="true"
        className="flex min-h-[44px] items-center justify-end border-b border-border-subtle pb-2"
      >
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      {/* ── 4 · Row 1 (7/5) — PLAYER-FAVORED (see file doc). LEFT: SectionTitle
          + a Ribbon-shaped flat panel (header line, below-readout, 180px
          plot). RIGHT: a schedule Surface (DayScheduleSwipe's own shape)
          above a bare "Needs you" seam-row group (TodayTasks). ─────────── */}
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT 7 — SectionTitle + Ribbon */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Panel className="flex flex-col gap-4 p-6">
            {/* header — Ribbon's own verdict-sentence bezel line */}
            <Skeleton className="h-5 w-3/4 max-w-sm" />
            {/* below-placed readout (value + delta), same order Ribbon uses */}
            <div className="flex items-baseline gap-3">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            {/* the plot itself — Ribbon's own fixed height={180} */}
            <Skeleton className="h-[180px] w-full rounded-fw-md" />
          </Panel>
        </div>

        {/* RIGHT 5 — schedule Surface + bare task rows */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <Panel className="flex flex-col gap-4 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-20" />
              <div className="flex items-center gap-1">
                <Skeleton circle className="h-7 w-7" />
                <Skeleton circle className="h-7 w-7" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-12 flex-1 rounded-fw-sm" />
              ))}
            </div>
            <div className="flex min-h-[88px] flex-col gap-2">
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

          {/* bare "Needs you" seam-row group — no card */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 rounded-fw-md bg-surface-sunken px-3 py-3">
                  <Skeleton circle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - i * 10}%` }} />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5 · Full-width band — PLAYER-FAVORED (see file doc): one flat
          StatMatrix-shaped KPI strip, 2-up on a phone / 4-across from `sm`,
          at every width — no chart, no rail. ───────────────────────────── */}
      <div aria-hidden="true">
        <Panel className="grid grid-cols-2 gap-y-5 p-4 sm:grid-cols-4 md:p-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 px-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </Panel>
      </div>

      {/* ── 6 · Ledger row (8/4, home.v2.md §6) — COACH-FAVORED (see file
          doc): a bordered Panel (bar-strip + row list) beside a bare list. */}
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel className="flex flex-col gap-4 p-4 md:p-5 lg:col-span-8">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          <div className="flex h-14 items-end gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t-fw-sm"
                style={{ height: `${40 + ((i * 5) % 4) * 15}%` }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton circle className="h-8 w-8 shrink-0" />
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - i * 8}%` }} />
                <Skeleton className="h-3.5 w-10" />
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-2 lg:col-span-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border-subtle px-1 py-3 last:border-b-0"
            >
              <Skeleton circle className="h-6 w-6 shrink-0" />
              <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${58 - i * 8}%` }} />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
