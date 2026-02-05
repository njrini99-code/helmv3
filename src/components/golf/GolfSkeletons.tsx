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
    <div className="min-h-full bg-transparent">
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
// CALENDAR SKELETON (week view with time slots)
// ============================================================================

export function CalendarSkeleton() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7am to 6pm

  return (
    <div className="h-full flex flex-col">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="h-8 w-32 bg-slate-200/60 rounded-lg skeleton-shimmer" />
          <div className="flex items-center gap-1">
            <div className="h-8 w-8 bg-slate-100/60 rounded-lg skeleton-shimmer" />
            <div className="h-8 w-8 bg-slate-100/60 rounded-lg skeleton-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-slate-100/60 rounded-lg skeleton-shimmer" />
          <div className="h-8 w-24 bg-slate-100/60 rounded-lg skeleton-shimmer" />
        </div>
      </div>

      {/* Week View Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Time column */}
        <div className="w-16 flex-shrink-0 border-r border-slate-200/40">
          <div className="h-12 border-b border-slate-200/40" /> {/* Header spacer */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-16 flex items-start justify-end pr-2 pt-1"
            >
              <div className="h-3 w-10 bg-slate-200/60 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="flex-1 grid grid-cols-7">
          {days.map((day, dayIndex) => (
            <div key={day} className="border-r border-slate-200/40 last:border-r-0">
              {/* Day header */}
              <div className="h-12 border-b border-slate-200/40 flex flex-col items-center justify-center p-2">
                <div className="h-3 w-8 bg-slate-200/60 rounded skeleton-shimmer mb-1" />
                <div className="h-6 w-6 bg-slate-100/60 rounded-full skeleton-shimmer" />
              </div>

              {/* Hour slots */}
              {hours.map((hour, hourIndex) => (
                <div
                  key={hour}
                  className="h-16 border-b border-slate-100/40 relative"
                >
                  {/* Random event placeholders */}
                  {((dayIndex + hourIndex) % 5 === 0) && (
                    <div
                      className="absolute left-1 right-1 top-1 rounded-lg bg-slate-100/60 skeleton-shimmer"
                      style={{ height: ((dayIndex + hourIndex) % 3 === 0) ? '28px' : '44px' }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROUNDS LIST SKELETON
// ============================================================================

export function RoundsListSkeleton() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-24 bg-slate-200/60 rounded skeleton-shimmer" />
              <div className="h-4 w-32 bg-slate-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-10 w-28 bg-slate-200/60 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Month group */}
        {[1, 2].map((group) => (
          <div key={group}>
            <div className="h-3.5 w-32 bg-slate-200/60 rounded mb-3 skeleton-shimmer" />
            <div className="space-y-2">
              {Array.from({ length: group === 1 ? 4 : 3 }).map((_, i) => (
                <RoundRowSkeleton key={i} delay={i * 40} showPlayer={false} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// STATS PAGE SKELETON (with tabs and metric cards)
// ============================================================================

export function StatsPageSkeleton() {
  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="h-7 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
          <div className="h-4 w-64 bg-slate-100/60 rounded mt-1 skeleton-shimmer" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Player list skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-xl overflow-hidden"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative flex items-center gap-4 p-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-xl bg-slate-200/60 skeleton-shimmer" />

                {/* Player info */}
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-slate-200/60 rounded skeleton-shimmer" />
                  <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
                </div>

                {/* Stats columns */}
                <div className="hidden md:flex items-center gap-6">
                  {[1, 2, 3].map((stat) => (
                    <div key={stat} className="text-center px-3">
                      <div className="h-2.5 w-12 bg-slate-100/60 rounded mb-1.5 skeleton-shimmer" />
                      <div className="h-5 w-8 bg-slate-200/60 rounded skeleton-shimmer mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DETAILED STATS SKELETON (for lazy-loaded shot-level stats)
// ============================================================================

export function DetailedStatsSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="h-7 w-48 bg-slate-200/60 rounded skeleton-shimmer" />
              <div className="h-4 w-32 bg-slate-100/60 rounded mt-2 skeleton-shimmer" />
            </div>
            <div className="h-10 w-48 bg-slate-100/60 rounded-lg skeleton-shimmer" />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-24 bg-slate-100/60 rounded-full skeleton-shimmer flex-shrink-0"
              style={{ animationDelay: `${i * 30}ms` }}
            />
          ))}
        </div>

        {/* Stats Content */}
        <div className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-xl overflow-hidden p-4"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
                <div className="relative">
                  <div className="h-3 w-20 bg-slate-200/60 rounded mb-2 skeleton-shimmer" />
                  <div className="h-8 w-16 bg-slate-200/60 rounded skeleton-shimmer" />
                  <div className="h-2 w-12 bg-slate-100/60 rounded mt-1 skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>

          {/* Stats Sections */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl overflow-hidden p-4"
              style={{ animationDelay: `${(i + 4) * 50}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative">
                <div className="h-4 w-32 bg-slate-200/60 rounded mb-4 skeleton-shimmer" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                      <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
                      <div className="h-3 w-16 bg-slate-200/60 rounded skeleton-shimmer" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SHOT STATS TAB SKELETON (for individual tab content loading)
// ============================================================================

export function ShotStatsTabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-xl overflow-hidden p-4"
          >
            <div className="h-3 w-20 bg-slate-200/60 rounded mb-2" />
            <div className="h-8 w-16 bg-slate-200/60 rounded" />
          </div>
        ))}
      </div>

      {/* Stats Section */}
      <div className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-4">
        <div className="h-4 w-32 bg-slate-200/60 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
              <div className="h-3 w-28 bg-slate-100/60 rounded" />
              <div className="h-3 w-16 bg-slate-200/60 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Another Section */}
      <div className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl p-4">
        <div className="h-4 w-40 bg-slate-200/60 rounded mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="text-center p-3 bg-slate-50/50 rounded-lg">
              <div className="h-6 w-12 bg-slate-200/60 rounded mx-auto mb-1" />
              <div className="h-2 w-16 bg-slate-100/60 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MESSAGES PAGE SKELETON
// ============================================================================

export function MessagesPageSkeleton() {
  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Conversation List */}
      <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-slate-200/60 bg-white/45 backdrop-blur-[20px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <div className="h-6 w-24 bg-slate-200/60 rounded skeleton-shimmer" />
            <div className="h-8 w-16 bg-slate-100/60 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-4 w-36 bg-slate-100/60 rounded mt-1 skeleton-shimmer" />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-hidden py-2">
          <div className="px-4 py-1.5 mb-2">
            <div className="h-2.5 w-12 bg-slate-200/60 rounded skeleton-shimmer" />
          </div>
          <div className="space-y-0.5 px-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <MessageThreadSkeleton key={i} delay={i * 30} />
            ))}
          </div>
        </div>
      </div>

      {/* Chat Window */}
      <div className="hidden lg:flex flex-1 min-w-0 flex-col bg-slate-50">
        {/* Chat header */}
        <div className="p-4 border-b border-slate-200/60 bg-white/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200/60 skeleton-shimmer" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200/60 rounded skeleton-shimmer" />
            <div className="h-3 w-20 bg-slate-100/60 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-4 space-y-4">
          {/* Message bubbles */}
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-200/60 skeleton-shimmer" />
            <div className="max-w-[70%] px-4 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-bl-md">
              <div className="h-3 w-48 bg-slate-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="flex items-end gap-2 justify-end">
            <div className="max-w-[70%] px-4 py-2.5 bg-slate-200/60 rounded-2xl rounded-br-md skeleton-shimmer">
              <div className="h-3 w-36 bg-transparent rounded" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-200/60 skeleton-shimmer" />
            <div className="max-w-[70%] px-4 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-bl-md">
              <div className="h-3 w-32 bg-slate-100/60 rounded skeleton-shimmer mb-1" />
              <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 bg-white border-t border-slate-200/60">
          <div className="flex items-center gap-3 p-1.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex-1 h-10 bg-transparent" />
            <div className="h-10 w-10 rounded-xl bg-slate-200/60 skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROSTER PAGE SKELETON
// ============================================================================

export function RosterPageSkeleton() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
              <div className="h-4 w-48 bg-slate-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-10 w-32 bg-slate-200/60 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-xl overflow-hidden"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative flex items-center gap-4 p-4">
                {/* Avatar with status dot */}
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-slate-200/60 skeleton-shimmer" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-slate-300/60 border-2 border-white" />
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-32 bg-slate-200/60 rounded skeleton-shimmer" />
                    <div className="h-5 w-12 bg-slate-100/60 rounded-full skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-24 bg-slate-100/60 rounded skeleton-shimmer" />
                </div>

                {/* Stats - hidden on mobile */}
                <div className="hidden md:flex items-center gap-1">
                  {[1, 2, 3].map((stat) => (
                    <div key={stat} className="flex flex-col items-center px-4 py-1">
                      <div className="h-5 w-8 bg-slate-200/60 rounded skeleton-shimmer mb-0.5" />
                      <div className="h-2.5 w-12 bg-slate-100/60 rounded skeleton-shimmer" />
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  <div className="h-8 w-8 bg-slate-100/60 rounded-lg skeleton-shimmer" />
                </div>
              </div>
            </div>
          ))}
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
