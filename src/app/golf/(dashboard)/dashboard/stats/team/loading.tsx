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
 * `TeamStatsBoard` replaced the per-player `InstrumentPanel` tile grid with
 * ONE `MatrixBoard` (spec §5.2 / §3.3 Matrix Board): a sticky KPI band, a
 * header row, then a ranked row per player — roster board FIRST, the team
 * Strokes Gained hero + leak maps demoted below it. This fallback mirrors
 * that exact order inside the same `fairwayScope(...)` → `max-w-[1536px]`
 * column `TeamStatsBoard` renders, so the skeleton→content handoff is a
 * quiet fade, not a layout jump.
 *
 * Eyebrow + h1 are real static text (matching `<ViewHeader eyebrow="Team
 * Stats" title="Team Stats" />`), not `<Skeleton>` blocks; the description
 * needs the fetched roster/team name, so it stays a Skeleton.
 */
export default function TeamStatsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading team stats…</span>

        {/* ── MASTHEAD: ViewHeader — eyebrow · title · description · secondary actions ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
              Team Stats
            </p>
            <h1 className="min-w-0 font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">
              Team Stats
            </h1>
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-40 rounded-fw-md" />
            <Skeleton className="h-9 w-9 rounded-fw-md" />
          </div>
        </div>

        {/* ── ROSTER BOARD — KPI band + header row + N ranked rows, matching
              MatrixBoard's own shape (spec §5.2 — board first). ── */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
            {/* KPI band — 2-col mobile / 4-col desktop, hairline dividers */}
            <div className="grid grid-cols-2 border-b border-border-subtle min-[940px]:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5 px-5 py-3.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>

            {/* Header row */}
            <div className="flex items-center gap-4 border-b border-border-subtle px-5 py-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-8 flex-shrink-0" />
              ))}
            </div>

            {/* Board rows */}
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between gap-4 px-5 py-2.5',
                  i < SKELETON_ROW_COUNT - 1 && 'border-b border-border-subtle',
                )}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Skeleton key={j} circle className="h-[26px] w-[26px]" />
                  ))}
                  <Skeleton circle className="h-9 w-9" />
                  <Skeleton className="hidden h-6 w-16 min-[940px]:block" />
                  <Skeleton className="hidden h-6 w-20 rounded-full min-[940px]:block" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TEAM STROKES GAINED — demoted below the board ── */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-card border border-border-subtle bg-surface p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-6 w-52" />
            <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-28 flex-shrink-0" />
                  <Skeleton className="h-6 flex-1" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-card border border-border-subtle bg-surface p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-4 w-32" />
            <Skeleton className="mt-3 h-12 w-28" />
            <Skeleton className="mt-4 h-3.5 w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-3/4" />
          </div>
        </div>

        {/* ── LEAK MAPS — demoted below the board ── */}
        <div className="mt-10">
          <Skeleton className="mb-4 h-6 w-56" />
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border-subtle bg-surface p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-5 w-48" />
                <Skeleton className="mt-1.5 h-3.5 w-40" />
                <Skeleton className="mt-6 h-40 w-full rounded-fw-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
