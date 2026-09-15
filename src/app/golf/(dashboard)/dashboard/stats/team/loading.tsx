import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { fairwayScope } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';

/** Row count in the board-rows skeleton — a reasonable mid-size roster, not
 *  tied to any real fetch (the actual count is unknown pre-hydration). */
const SKELETON_ROW_COUNT = 6;

/**
 * Route-level loading state for the coach Team Stats overview
 * (/dashboard/stats/team).
 *
 * Mirrors `TeamStatsBoard`'s facelift composition (fairway-facelift
 * screens/team-stats.md), in the same order, inside the same
 * `fairwayScope(...)` → `max-w-[1536px]` column, so the skeleton→content
 * handoff is a quiet fade, not a layout jump:
 *   masthead (primary action + Export icon + overflow-menu icon)
 *   → header StatMatrix (4-up desktop / 2×2 phone — standalone, NOT inside
 *   the board anymore)
 *   → the player MatrixBoard (header row + N ranked rows only — no internal
 *   KPI band; that band moved out to the StatMatrix above it)
 *   → ONE analysis Bento: tornado hero (2×2), fundamentals rails (2×1),
 *   putts-by-distance (1×1), approach proximity (1×1) as a single gapless
 *   matte sheet with hairline seams — not four separate cards.
 *
 * The h1 is real static text (matching `<ViewHeader title="Team Stats" />`),
 * not a `<Skeleton>` block — no eyebrow above it, since ViewHeader no longer
 * renders one here (it would just repeat the title verbatim; facelift
 * REVIEW.md "Team stats, phone"). The description needs the fetched roster/
 * team name, so it stays a Skeleton.
 *
 * Board row shape verified against the module kit: `RankCell` (Tee/App/
 * Shrt/Putt/Scor) is a `rounded-fw-sm` badge, NOT a circle (RankCell.tsx:
 * 24-29); Composite is a leading number + a linear `Meter size="sm"` bar,
 * not a ring (TeamStatsBoard.tsx); the "who" cell is name + subtitle text
 * with no avatar. Scor/Composite/Trend/Signal hide below 940px exactly like
 * MatrixBoard's own columns (MatrixBoard.tsx:29, `HIDE_ON_MOBILE`).
 */
export default function TeamStatsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div role="status" aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <span className="sr-only">Loading team stats…</span>

        {/* ── MASTHEAD: ViewHeader — eyebrow · title · description · one
              primary action · Export icon (sm+) · overflow-menu icon ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="min-w-0 font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">Team Stats</h1>
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Skeleton className="hidden h-9 w-9 rounded-fw-md sm:block" />
            <Skeleton className="h-9 w-9 rounded-fw-md" />
            <Skeleton className="h-9 w-40 rounded-fw-md" />
          </div>
        </div>

        {/* ── HEADER STAT MATRIX — 4-up desktop / 2×2 phone, standalone
              above the board (spec CONTAINERS TO REMOVE #2). ── */}
        <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-fw-md bg-surface-sunken min-[940px]:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5 px-3 py-3">
              <Skeleton className="mx-auto h-6 w-16" />
              <Skeleton className="mx-auto h-2.5 w-16" />
            </div>
          ))}
        </div>

        {/* ── ROSTER BOARD (dominant object) — header row + N ranked rows,
              no internal KPI band (spec §5.2 — board first). ── */}
        <section className="mt-6">
          <Skeleton className="mb-3 h-2.5 w-80 max-w-full" />
          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
            {/* Header row — Player/Tee/App/Shrt/Putt visible at every width, Scor/
                Composite/Trend/Signal hidden below 940px, matching MatrixBoard's
                own `COLUMNS` + `HIDE_ON_MOBILE` (MatrixBoard.tsx:29,120-136). */}
            <div className="flex items-center gap-4 border-b border-border-subtle px-5 py-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-8 flex-shrink-0" />
              ))}
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`d-${i}`} className="hidden h-2.5 w-8 flex-shrink-0 min-[940px]:block" />
              ))}
            </div>

            {/* Board rows. The "who" cell is name + subtitle only — no avatar.
                Tee/App/Shrt/Putt/Scor are `RankCell`, a rounded-fw-sm badge
                (RankCell.tsx:24-29). Composite is a leading number + a
                linear `Meter size="sm"` bar (TeamStatsBoard.tsx), not a
                ring — a bare arc read as unreadable noise at 1440px
                (facelift REVIEW.md "Team stats, desktop"). Scor/Composite/
                Trend/Signal hide below 940px like the real columns
                (MatrixBoard.tsx:29). */}
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <div key={i} className={cn('flex items-center justify-between gap-4 px-5 py-2.5', i < SKELETON_ROW_COUNT - 1 && 'border-b border-border-subtle')}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-[26px] w-[34px]" />
                  ))}
                  <Skeleton className="hidden h-[26px] w-[34px] min-[940px]:block" />
                  <div className="hidden items-center gap-2 min-[940px]:flex">
                    <Skeleton className="h-3 w-4" />
                    <Skeleton className="h-1.5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="hidden h-6 w-16 min-[940px]:block" />
                  <Skeleton className="hidden h-6 w-20 rounded-full min-[940px]:block" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ANALYSIS BENTO — ONE gapless matte sheet (spec CONTAINERS TO
              REMOVE #3, #4): tornado hero (2×2), fundamentals rails (2×1),
              putts-by-distance (1×1), approach proximity (1×1). Hairline
              seams via the shared border color showing through `gap-px`,
              matching `Bento`'s own chrome — not four separate cards. ── */}
        <section className="mt-10">
          <div className="grid grid-flow-dense grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle [box-shadow:var(--fw-shadow-card)] [--fw-cell-h:7.375rem] auto-rows-[minmax(7.375rem,auto)] sm:grid-cols-2 min-[940px]:grid-cols-4">
            {/* Tornado hero — 2 cols × 2 rows */}
            <div className="col-span-1 row-span-1 space-y-4 bg-surface px-[18px] py-4 sm:col-span-2 sm:row-span-2">
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-4 w-44" />
              <div className="space-y-3 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-24 flex-shrink-0" />
                    <Skeleton className="h-5 flex-1" />
                  </div>
                ))}
              </div>
            </div>

            {/* Fundamentals rails — 2 cols × 1 row */}
            <div className="col-span-1 space-y-4 bg-surface px-[18px] py-4 sm:col-span-2">
              <Skeleton className="h-2.5 w-24" />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-2.5 w-16 flex-shrink-0" />
                      <Skeleton className="h-2 flex-1 rounded-full" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </div>
            </div>

            {/* Putts-by-distance — 1×1 */}
            <div className="col-span-1 space-y-3 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-28 w-full rounded-fw-md" />
            </div>

            {/* Approach proximity — 1×1 */}
            <div className="col-span-1 space-y-3 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-28 w-full rounded-fw-md" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
