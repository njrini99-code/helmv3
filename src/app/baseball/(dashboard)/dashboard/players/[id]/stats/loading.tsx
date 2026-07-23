import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

/**
 * Player stats loading skeleton — mirrors the real page.tsx (same route):
 * breadcrumb + h1 header (no avatar) → conditional 2/4-col stat-card row →
 * a SeasonStatsTable-shaped card (tab toggle + season/export controls +
 * table) → a game-log heading + PlayerGameLog-shaped card. No avatar
 * circle, no charts, no "Session History" list — none of those exist on
 * this page.
 */
export default function PlayerStatsLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-3" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-8 w-48 mb-1.5" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Season stats summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <PaperCard key={i} className="p-4 text-center" grain={false}>
              <Skeleton className="h-3 w-10 mx-auto mb-2" />
              <Skeleton className="h-7 w-14 mx-auto" />
            </PaperCard>
          ))}
        </div>

        {/* Full season stats table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
          </div>
          <PaperCard className="overflow-hidden" grain={false}>
            <div className="px-4 py-3 border-b border-warm-100 flex items-center gap-6">
              <Skeleton className="h-3 w-16" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-8" />
              ))}
            </div>
            <div className="divide-y divide-warm-50">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-6">
                  <Skeleton className="h-4 w-24" />
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-8" />
                  ))}
                </div>
              ))}
            </div>
          </PaperCard>
        </div>

        {/* Game log */}
        <div>
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
                <Skeleton className="h-7 w-20 rounded-lg" />
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
              <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
                <Skeleton className="h-6 w-10 rounded-lg" />
                <Skeleton className="h-6 w-14 rounded-lg" />
                <Skeleton className="h-6 w-20 rounded-lg" />
              </div>
            </div>
            <PaperCard className="overflow-hidden" grain={false}>
              <div className="px-4 py-2.5 border-b border-warm-100 flex items-center gap-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-20" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-6" />
                ))}
              </div>
              <div className="divide-y divide-warm-50">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Skeleton key={j} className="h-4 w-6" />
                    ))}
                  </div>
                ))}
              </div>
            </PaperCard>
          </div>
        </div>
      </div>
    </div>
  );
}
