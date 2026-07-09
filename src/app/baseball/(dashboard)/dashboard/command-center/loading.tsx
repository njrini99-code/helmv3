import {
  TeamBattingOverviewSkeleton,
  GameVsPracticePanelSkeleton,
  PlayerPerformanceGridSkeleton,
  TrendAnalysisPanelSkeleton,
} from '@/components/baseball/command-center/analytics';
import { PaperCard } from '@/components/baseball/living-annual';

export default function CommandCenterLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 w-48 bg-warm-200 rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-warm-200 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-warm-200 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-warm-200 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Stats Overview Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <PaperCard
              key={i}
              className="p-4"
              grain={false}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-warm-200 rounded-lg animate-pulse" />
              </div>
              <div className="h-8 w-16 bg-warm-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-warm-200 rounded animate-pulse mt-2" />
            </PaperCard>
          ))}
        </div>

        {/* Analytics Dashboard Skeleton */}
        <div className="space-y-6">
          {/* Team Batting + Game vs Practice Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TeamBattingOverviewSkeleton />
            <GameVsPracticePanelSkeleton />
          </div>

          {/* Trend Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PlayerPerformanceGridSkeleton />
            </div>
            <TrendAnalysisPanelSkeleton />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2 space-y-4">
            {/* Search Skeleton */}
            <PaperCard className="p-4" grain={false}>
              <div className="h-10 bg-warm-200 rounded-lg animate-pulse" />
            </PaperCard>

            {/* Cards Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <PaperCard
                  key={i}
                  className="p-4"
                  grain={false}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-warm-200 rounded-full animate-pulse" />
                    <div>
                      <div className="h-4 w-24 bg-warm-200 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-warm-200 rounded animate-pulse mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="bg-warm-100 rounded-lg p-2">
                        <div className="h-3 w-8 bg-warm-200 rounded animate-pulse mx-auto" />
                        <div className="h-5 w-12 bg-warm-200 rounded animate-pulse mx-auto mt-1" />
                      </div>
                    ))}
                  </div>
                </PaperCard>
              ))}
            </div>
          </div>

          {/* Sidebar Skeleton */}
          <div className="space-y-4">
            <PaperCard className="p-6" grain={false}>
              <div className="h-5 w-24 bg-warm-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-warm-50 rounded-lg p-3 border border-warm-100"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-warm-200 rounded-lg animate-pulse" />
                      <div className="flex-1">
                        <div className="h-4 w-32 bg-warm-200 rounded animate-pulse" />
                        <div className="h-3 w-full bg-warm-200 rounded animate-pulse mt-2" />
                      </div>
                    </div>
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
