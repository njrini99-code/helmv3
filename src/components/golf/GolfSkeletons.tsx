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
      className="relative glass-standard rounded-2xl p-5 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-7 w-16 bg-slate-200 rounded" />
          <div className="h-2 w-24 bg-slate-100 rounded" />
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100" />
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
      className="relative glass-standard rounded-2xl p-4 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
        <div className="space-y-1">
          <div className="h-6 w-16 bg-slate-100 rounded-full" />
          <div className="h-3 w-12 bg-slate-100 rounded" />
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
      className="flex items-center gap-4 px-4 py-3 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Score badge */}
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0" />

      {/* Details */}
      <div className="flex-1 space-y-2">
        {showPlayer && <div className="h-4 w-28 bg-slate-200 rounded" />}
        <div className={cn(
          'bg-slate-200 rounded',
          showPlayer ? 'h-3 w-40' : 'h-4 w-40'
        )} />
        <div className="h-2 w-24 bg-slate-100 rounded" />
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
      className="relative glass-standard rounded-xl p-4 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 bg-slate-200 rounded" />
          <div className="h-2.5 w-36 bg-slate-100 rounded" />
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
      className="relative glass-standard rounded-2xl p-6 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative space-y-4">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-slate-50/80 rounded-xl space-y-1">
              <div className="h-2.5 w-16 bg-slate-200 rounded" />
              <div className="h-6 w-12 bg-slate-200 rounded" />
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
      className="relative glass-standard rounded-2xl p-5 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
          <div className="h-6 w-16 bg-slate-100 rounded-full" />
        </div>
        <div className="h-3 w-full bg-slate-100 rounded" />
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
      className="flex items-center gap-3 px-4 py-3 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-32 bg-slate-200 rounded" />
        <div className="h-3 w-48 bg-slate-100 rounded" />
      </div>
      <div className="h-2.5 w-12 bg-slate-100 rounded" />
    </div>
  );
}

// ============================================================================
// ANNOUNCEMENT CARD SKELETON
// ============================================================================

export function AnnouncementCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative glass-standard rounded-2xl p-5 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-slate-200 rounded" />
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-5/6 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="h-2.5 w-24 bg-slate-100 rounded" />
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
      className="flex items-center gap-3 p-3 rounded-lg animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 bg-slate-200 rounded" />
        <div className="h-3 w-24 bg-slate-100 rounded" />
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
      className="relative glass-standard rounded-2xl p-4 overflow-hidden animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="h-3 w-28 bg-slate-100 rounded" />
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
