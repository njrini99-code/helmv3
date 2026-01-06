/**
 * Golf-specific skeleton loaders for consistent loading states
 * Matches the glass-standard card design system
 */

import { cn } from '@/lib/utils';

// ============================================================================
// METRIC CARD SKELETON
// ============================================================================

export function MetricCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-5 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-7 w-16 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-2 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="w-10 h-10 rounded-lg bg-slate-100/60 skeleton-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// PLAYER CARD SKELETON (for roster)
// ============================================================================

export function PlayerCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-4 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-200/60 skeleton-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="space-y-1">
          <div className="h-6 w-16 bg-slate-100/60 rounded-full skeleton-shimmer" />
          <div className="h-3 w-12 bg-slate-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROUND ROW SKELETON (for stats/rounds list)
// ============================================================================

export function RoundRowSkeleton({ delay = 0, showPlayer = true }: { delay?: number; showPlayer?: boolean }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Score badge */}
      <div className="w-12 h-12 rounded-lg bg-slate-100/60 flex-shrink-0 skeleton-shimmer" />

      {/* Details */}
      <div className="flex-1 space-y-2">
        {showPlayer && <div className="h-4 w-28 bg-slate-200/60 rounded skeleton-shimmer" />}
        <div className={cn(
          'bg-slate-200/60 rounded skeleton-shimmer',
          showPlayer ? 'h-3 w-40' : 'h-4 w-40'
        )} />
        <div className="h-2 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// QUICK ACTION CARD SKELETON
// ============================================================================

export function QuickActionSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[16px] border border-white/30 rounded-2xl p-4 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100/60 flex-shrink-0 skeleton-shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-2.5 w-36 bg-slate-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STATS CARD SKELETON
// ============================================================================

export function StatsCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-6 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative space-y-4">
        <div className="h-4 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-white/30 backdrop-blur-sm rounded-lg space-y-1">
              <div className="h-2.5 w-16 bg-slate-200/60 rounded skeleton-shimmer" />
              <div className="h-6 w-12 bg-slate-200/60 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// QUALIFIER CARD SKELETON
// ============================================================================

export function QualifierCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-5 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-200/60 rounded skeleton-shimmer" />
            <div className="h-3 w-32 bg-slate-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="h-6 w-16 bg-slate-100/60 rounded-full skeleton-shimmer" />
        </div>
        <div className="h-3 w-full bg-slate-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// MESSAGE THREAD SKELETON
// ============================================================================

export function MessageThreadSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-full bg-slate-200/60 flex-shrink-0 skeleton-shimmer" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
        <div className="h-3 w-48 bg-slate-100/60 rounded skeleton-shimmer" />
      </div>
      <div className="h-2.5 w-12 bg-slate-100/60 rounded skeleton-shimmer" />
    </div>
  );
}

// ============================================================================
// ANNOUNCEMENT CARD SKELETON
// ============================================================================

export function AnnouncementCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-5 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100/60 flex-shrink-0 skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-slate-200/60 rounded skeleton-shimmer" />
            <div className="h-3 w-full bg-slate-100/60 rounded skeleton-shimmer" />
            <div className="h-3 w-5/6 bg-slate-100/60 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="h-2.5 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// CALENDAR EVENT SKELETON
// ============================================================================

export function CalendarEventSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-100/60 flex-shrink-0 skeleton-shimmer" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 bg-slate-200/60 rounded skeleton-shimmer" />
        <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// DOCUMENT CARD SKELETON
// ============================================================================

export function DocumentCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-4 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100/60 flex-shrink-0 skeleton-shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-3 w-28 bg-slate-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PREMIUM DASHBOARD SKELETON (Bento Grid Layout)
// ============================================================================

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-cream-gradient">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-20 bg-white/60 backdrop-blur-[24px] border-b border-white/30">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-slate-200/60 rounded skeleton-shimmer" />
              <div className="h-4 w-32 bg-slate-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-9 w-32 bg-slate-100/60 rounded-lg skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <MetricCardSkeleton key={i} delay={i * 50} />
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div>
              <div className="h-4 w-24 bg-slate-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <QuickActionSkeleton key={i} delay={i * 30} />
                ))}
              </div>
            </div>

            {/* Top Performers */}
            <div>
              <div className="h-4 w-32 bg-slate-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl overflow-hidden">
                <div className="divide-y divide-white/20">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100/60 skeleton-shimmer" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-24 bg-slate-200/60 rounded skeleton-shimmer" />
                        <div className="h-3 w-16 bg-slate-100/60 rounded skeleton-shimmer" />
                      </div>
                      <div className="h-6 w-12 bg-slate-200/60 rounded skeleton-shimmer" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chart Skeleton */}
            <div>
              <div className="h-4 w-40 bg-slate-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-6">
                <div className="h-64 bg-slate-100/40 rounded-lg skeleton-shimmer" />
              </div>
            </div>

            {/* Recent Rounds */}
            <div>
              <div className="h-4 w-32 bg-slate-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl overflow-hidden">
                <div className="divide-y divide-white/20">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <RoundRowSkeleton key={i} delay={i * 30} showPlayer={false} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GRID SKELETON (for loading multiple cards)
// ============================================================================

export function SkeletonGrid({
  type = 'metric',
  count = 4,
  columns = 4,
  delay = 50,
}: {
  type?: 'metric' | 'player' | 'round' | 'qualifier' | 'announcement' | 'document';
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  delay?: number;
}) {
  const SkeletonComponent = {
    metric: MetricCardSkeleton,
    player: PlayerCardSkeleton,
    round: RoundRowSkeleton,
    qualifier: QualifierCardSkeleton,
    announcement: AnnouncementCardSkeleton,
    document: DocumentCardSkeleton,
  }[type];

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={cn('grid gap-4', gridClass)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} delay={i * delay} />
      ))}
    </div>
  );
}
