import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading state for the coach Team Stats overview.
 *
 * Shape-matches <FairwayTeamStats/> inside fairwayScope('min-h-full
 * bg-canvas …'): the SAME max-w-[1536px] column, a ViewHeader band, a 2fr/1fr
 * SG-hero row, a 2-col leak-map row, and a 3-col per-player tile grid — built
 * from the token-correct Fairway Skeleton primitive (bg-surface-sunken /
 * rounded-card / border-border-subtle) — so the skeleton→content handoff is a
 * quiet fade, not a layout jump.
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

          {/* ── MASTHEAD: ViewHeader — eyebrow · title · description · primary action ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-11 w-44 rounded-fw-md" />
          </div>

          {/* ── HERO: SG tornado (2fr) + SG-total panel (1fr) ── */}
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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

          {/* ── LEAK MAPS: section heading + 2-col chart row ── */}
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

          {/* ── PER-PLAYER TILES: section heading + 3-col grid ── */}
          <div className="mt-10">
            <Skeleton className="mb-4 h-6 w-28" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-card border border-border-subtle bg-surface p-5">
                  {/* Header: name + grad year vs composite */}
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex-shrink-0 space-y-2 text-right">
                      <Skeleton className="ml-auto h-5 w-14" />
                      <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                  </div>
                  {/* 4-col metric grid */}
                  <div className="mt-4 grid grid-cols-4 gap-3 rounded-card bg-surface-sunken p-3">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div key={j} className="space-y-1.5">
                        <Skeleton className="h-4 w-10" />
                        <Skeleton className="h-2.5 w-8" />
                      </div>
                    ))}
                  </div>
                  {/* Headline standing strip */}
                  <Skeleton className="mt-4 h-12 w-full rounded-fw-md" />
                  {/* Drill-in link */}
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
}
