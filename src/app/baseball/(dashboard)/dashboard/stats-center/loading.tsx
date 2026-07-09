import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Stats Center loading skeleton — mirrors the real layout:
 * summary strip (5 tiles) → filter bar → player stat-card grid (6 skeleton cards)
 * → stat-visual gallery placeholder.
 *
 * Uses <Skeleton> (not animate-spin or a generic spinner) per design system rules.
 */
export default function StatsCenterLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-[1536px] px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-40 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        {/* Summary strip — 5 tiles */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <PaperCard key={i} className="p-4" grain={false}>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-12" />
                </div>
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
            </PaperCard>
          ))}
        </div>

        {/* Filter bar */}
        <PaperCard className="mb-6 px-4 py-3" grain={false}>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-9 w-36 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-14 rounded-full" />
            ))}
          </div>
        </PaperCard>

        {/* Player stat card grid — 3 columns × 2 rows */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PaperCard key={i} className="p-4 space-y-4" grain={false}>
              {/* Card header — player identity */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              {/* Batting hero line */}
              <div className="grid grid-cols-4 gap-2 rounded-xl bg-warm-50/70 px-3 py-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex flex-col items-center gap-1">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                ))}
              </div>
              {/* Stat pairs grid */}
              <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
                {Array.from({ length: 16 }).map((_, j) => (
                  <div key={j} className="space-y-1">
                    <Skeleton className="h-2.5 w-6" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between border-t border-warm-100 pt-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            </PaperCard>
          ))}
        </div>

        {/* Stat-visual gallery placeholder */}
        <div className="mt-10 space-y-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
