import { Skeleton } from '@/components/ui/skeleton';

/**
 * Stats Center loading skeleton — mirrors StatsCenterClient's real layout:
 * SectionMasthead (eyebrow + title + accent rule + Import Center/Export CSV
 * actions) → 5-up KPIContentsStrip (ruled stat lines, no card/icon wrapper)
 * → the season/side/position filter row (no card wrapper) → the two-section
 * Batting/Pitching record-book wall (PlayerRowPlateHeader + PlayerRowPlate
 * rows on a six-column plate, never a card grid) → the stat-visual gallery
 * placeholder.
 *
 * Uses <Skeleton> (not animate-spin or a generic spinner) per design system
 * rules.
 */
export default function StatsCenterLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-[1536px] px-4 py-8 sm:px-6">
        {/* SectionMasthead — eyebrow + title + accent rule + actions */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <Skeleton className="h-9 w-44" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32 rounded-fw-md" />
              <Skeleton className="h-9 w-28 rounded-fw-md" />
            </div>
          </div>
          <Skeleton className="h-[3px] w-16 rounded-full" />
        </div>

        {/* KPIContentsStrip — 5-up ruled stat cells, no card/icon wrapper */}
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-[1.5px] w-full" />
            </div>
          ))}
        </div>

        {/* Filters — season / side / position, no card wrapper */}
        <div className="mt-6 flex flex-col gap-3 border-t border-warm-200 pt-5">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-28 rounded-fw-md" />
            <Skeleton className="h-8 w-24 rounded-fw-md" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
        </div>

        {/* The record-book wall — Batting + Pitching spreads, six-column plate. */}
        <div className="mt-8 flex flex-col gap-10">
          {['Batting', 'Pitching'].map((heading) => (
            <div key={heading} className="flex flex-col gap-3">
              <Skeleton className="h-3 w-16" />

              {/* md+: fixed six-column plate scrolling horizontally as one. */}
              <div className="hidden md:block overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="flex items-end px-1 pb-2">
                    <Skeleton className="h-3 w-12" />
                    <div className="ml-auto flex gap-x-6">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-3 w-14 shrink-0" />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-3 px-1 py-3">
                          <Skeleton className="h-[17px] min-w-0 flex-1 max-w-[200px]" />
                          <div className="flex gap-x-6">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <Skeleton key={j} className="h-6 w-20 shrink-0" />
                            ))}
                          </div>
                        </div>
                        <Skeleton className="h-[1.5px] w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Below md: full-width identity rows, one headline figure
                  (Rule 8 — never the desktop six-column plate on a phone). */}
              <div className="md:hidden flex flex-col">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3 px-1 py-3">
                      <Skeleton className="h-[17px] min-w-0 flex-1 max-w-[160px]" />
                      <Skeleton className="h-6 w-20 shrink-0" />
                    </div>
                    <Skeleton className="h-[1.5px] w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Stat-visual gallery placeholder. */}
        <div className="mt-12 space-y-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
