'use client';

import { cn } from '@/lib/utils';

/**
 * Canonical Skeleton primitive — Wave W2C consolidation.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md (A4 — skeleton consolidation)
 *
 * Three previously-redundant skeleton modules were folded into this one file:
 *   - src/components/ui/skeleton-loader.tsx  (DELETED)
 *   - src/components/golf/GolfSkeletons.tsx  (DELETED)
 *   - src/components/baseball/tasks/TaskSkeleton.tsx  (DELETED)
 *
 * The `Skeleton` primitive now exposes a 5-variant semantic API
 * (`line | block | card | list | chart`) while remaining a strict superset of
 * the two historical primitives so that every existing call site renders
 * byte-identically:
 *
 *   - Canonical legacy variants: `default | circular | text | button`
 *     (matte surface `bg-warm-200/60` + shimmer overlay, default animate `shimmer`).
 *   - skeleton-loader variants:  `text | circular | rectangular` with
 *     `width`/`height`/`animation` props (soft surface `bg-warm-100`,
 *     default animation `pulse`).
 *
 * Rendering mode is disambiguated WITHOUT changing any call site: a call is
 * rendered in the legacy skeleton-loader "soft" mode when it passes any of
 * `width`, `height`, an explicit `animation`, or `variant="rectangular"`;
 * otherwise it renders in the canonical "matte" mode. Every one of the 113
 * skeleton-loader `<Skeleton>` call sites passes at least one of those props,
 * and no canonical call site does — so the discriminator is exact.
 *
 * The specialized compounds (Table/Card/Profile/StatCard/List + every page-,
 * card-, and row-level skeleton from the deleted modules) are kept as
 * compositions over the primitive and reproduce their original layout/shape
 * exactly.
 */

type CanonicalVariant = 'default' | 'circular' | 'text' | 'button';
type LoaderVariant = 'text' | 'circular' | 'rectangular';
type SemanticVariant = 'line' | 'block' | 'card' | 'list' | 'chart';

interface SkeletonProps {
  className?: string;
  /**
   * Shape variant. Supports the semantic 5-variant API
   * (`line | block | card | list | chart`), the canonical legacy variants
   * (`default | circular | text | button`), and the skeleton-loader legacy
   * variants (`rectangular`). All are preserved for behavior + visual parity.
   */
  variant?: CanonicalVariant | LoaderVariant | SemanticVariant;
  /** Canonical animation control (matte mode). */
  animate?: 'pulse' | 'shimmer';
  /** skeleton-loader animation control (soft mode). Presence forces soft mode. */
  animation?: 'pulse' | 'shimmer';
  /** Explicit width — presence forces skeleton-loader "soft" rendering mode. */
  width?: string | number;
  /** Explicit height — presence forces skeleton-loader "soft" rendering mode. */
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'default',
  animate = 'shimmer',
  animation,
  width,
  height,
}: SkeletonProps) {
  // "soft" mode reproduces the legacy skeleton-loader look exactly.
  const softMode =
    width !== undefined ||
    height !== undefined ||
    animation !== undefined ||
    variant === 'rectangular';

  if (softMode) {
    const styles: React.CSSProperties = {
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    };
    const anim = animation ?? 'pulse';
    return (
      <div
        className={cn(
          'bg-warm-100',
          anim === 'pulse' && 'animate-pulse',
          anim === 'shimmer' && 'skeleton-shimmer',
          variant === 'text' && 'h-4 rounded',
          variant === 'circular' && 'rounded-full',
          // `rectangular` (loader default) and the semantic block/card/chart
          // shapes all map onto the loader rectangular look in soft mode.
          (variant === 'rectangular' ||
            variant === 'block' ||
            variant === 'card' ||
            variant === 'chart') &&
            'rounded-lg',
          className
        )}
        style={styles}
      />
    );
  }

  // Canonical "matte" mode (default for all existing canonical call sites).
  const variantClasses: Record<CanonicalVariant | SemanticVariant, string> = {
    default: 'rounded-md',
    circular: 'rounded-full',
    text: 'rounded h-4',
    button: 'rounded-[10px] h-11',
    // Semantic variants map onto the canonical matte shapes.
    line: 'rounded h-4',
    block: 'rounded-md',
    card: 'rounded-2xl',
    list: 'rounded-md',
    chart: 'rounded-lg',
  };

  return (
    <div
      className={cn(
        'bg-warm-200/60 relative overflow-hidden',
        animate === 'pulse' && 'animate-pulse',
        variantClasses[variant as CanonicalVariant | SemanticVariant] ?? 'rounded-md',
        className
      )}
    >
      {animate === 'shimmer' && (
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      )}
    </div>
  );
}

// ============================================================================
// CANONICAL COMPOUNDS (originally in ui/skeleton.tsx)
// ============================================================================

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b border-warm-200">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 py-3"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 rounded-2xl border border-warm-200 bg-white space-y-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton variant="circular" className="w-12 h-12" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="p-6 rounded-2xl border border-warm-200 bg-white">
      <Skeleton className="h-3 w-1/2 mb-3" />
      <Skeleton className="h-8 w-1/3 mb-2" />
      <Skeleton className="h-3 w-1/4" />
    </div>
  );
}

export function ListSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3"
          style={{ animationDelay: `${i * 75}ms` }}
        >
          <Skeleton variant="circular" className="w-10 h-10 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// skeleton-loader COMPOUNDS (originally in ui/skeleton-loader.tsx)
// Each reproduces the soft (bg-warm-100 + pulse) surface exactly.
// ============================================================================

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '80%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('p-5 bg-white rounded-xl border border-warm-100', className)}>
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-3">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
          <div className="flex gap-2 mt-3">
            <Skeleton variant="rectangular" width={60} height={24} className="rounded-full" />
            <Skeleton variant="rectangular" width={60} height={24} className="rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonPlayerCard({ className }: { className?: string }) {
  return (
    <div className={cn('p-5 bg-white rounded-xl border border-warm-100', className)}>
      <div className="flex items-start gap-4 mb-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1">
          <Skeleton variant="text" width="70%" className="mb-2" />
          <Skeleton variant="text" width="50%" height={12} />
          <Skeleton variant="text" width="40%" height={12} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 pt-4 border-t border-warm-100">
        {[1, 2, 3, 4].map(i => (
          <div key={i}>
            <Skeleton variant="text" width="80%" height={10} className="mb-2" />
            <Skeleton variant="text" width="60%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-warm-100 overflow-hidden', className)}>
      {/* Header */}
      <div className="grid gap-4 p-4 border-b border-warm-100 bg-warm-50" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width="60%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 p-4 border-b border-warm-50 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} variant="text" width="80%" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeMap = {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
  };

  return <Skeleton variant="circular" width={sizeMap[size]} height={sizeMap[size]} />;
}

export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn('p-5 bg-white rounded-xl border border-warm-100', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton variant="text" width="40%" height={12} className="mb-2" />
          <Skeleton variant="text" width="60%" height={32} className="mb-2" />
          <Skeleton variant="text" width="50%" height={10} />
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>
    </div>
  );
}

export function SkeletonGrid({
  items = 6,
  columns = 3,
  gap = 6,
  className
}: {
  items?: number;
  columns?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap * 0.25}rem`
      }}
    >
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonPipeline({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-4 gap-6', className)}>
      {[1, 2, 3, 4].map(stage => (
        <div key={stage} className="bg-warm-50 rounded-xl p-4 min-h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="circular" width={24} height={24} />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(card => (
              <SkeletonCard key={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Dashboard page skeleton - Bento grid style
export function SkeletonDashboard({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Bento Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-6 animate-pulse">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Skeleton variant="text" width="50%" height={12} className="mb-3" />
                <Skeleton variant="text" width="40%" height={36} className="mb-2" />
                <div className="flex items-center gap-2 mt-3">
                  <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
                  <Skeleton variant="text" width="60%" height={10} />
                </div>
              </div>
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
            </div>
          </div>
        ))}
      </div>
      {/* Two column layout */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-warm-200 p-6">
            <Skeleton variant="text" width="30%" height={20} className="mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1">
                    <Skeleton variant="text" width="70%" className="mb-2" />
                    <Skeleton variant="text" width="40%" height={12} />
                  </div>
                  <Skeleton variant="text" width={60} height={12} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-warm-200 p-6">
            <Skeleton variant="text" width="50%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-3 bg-warm-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circular" width={8} height={8} />
                    <Skeleton variant="text" width={80} />
                  </div>
                  <Skeleton variant="text" width={24} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Discover page skeleton - Player grid
export function SkeletonDiscover({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Filters bar */}
      <div className="bg-white rounded-2xl border border-warm-200 p-4">
        <div className="flex items-center gap-4">
          <Skeleton variant="rectangular" width={200} height={40} className="rounded-lg" />
          <Skeleton variant="rectangular" width={120} height={40} className="rounded-lg" />
          <Skeleton variant="rectangular" width={120} height={40} className="rounded-lg" />
          <Skeleton variant="rectangular" width={120} height={40} className="rounded-lg" />
          <div className="flex-1" />
          <Skeleton variant="rectangular" width={80} height={40} className="rounded-lg" />
        </div>
      </div>
      {/* Results count */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={16} />
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width={36} height={36} className="rounded-lg" />
          <Skeleton variant="rectangular" width={36} height={36} className="rounded-lg" />
        </div>
      </div>
      {/* Player grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-warm-200 p-5 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-start gap-4 mb-4">
              <Skeleton variant="circular" width={56} height={56} />
              <div className="flex-1">
                <Skeleton variant="text" width="70%" height={18} className="mb-2" />
                <Skeleton variant="text" width="50%" height={14} className="mb-1" />
                <Skeleton variant="text" width="60%" height={12} />
              </div>
              <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
            </div>
            <div className="grid grid-cols-4 gap-3 pt-4 border-t border-warm-100">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="text-center">
                  <Skeleton variant="text" width="80%" height={10} className="mx-auto mb-2" />
                  <Skeleton variant="text" width="60%" height={16} className="mx-auto" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Skeleton variant="rectangular" className="flex-1 h-10 rounded-xl" />
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Watchlist page skeleton
export function SkeletonWatchlist({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {['All', 'Pitchers', 'Catchers', 'Infielders', 'Outfielders'].map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={i === 0 ? 60 : 90} height={36} className="rounded-full" />
        ))}
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 gap-4 p-4 bg-warm-50 border-b border-warm-200">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="30%" />
        </div>
        {/* Rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div
            key={i}
            className="grid grid-cols-7 gap-4 p-4 border-b border-warm-100 last:border-0"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div>
                <Skeleton variant="text" width={100} className="mb-1" />
                <Skeleton variant="text" width={60} height={12} />
              </div>
            </div>
            <Skeleton variant="text" width="60%" className="self-center" />
            <Skeleton variant="text" width="40%" className="self-center" />
            <Skeleton variant="text" width="50%" className="self-center" />
            <Skeleton variant="rectangular" width={80} height={24} className="rounded-full self-center" />
            <Skeleton variant="text" width="60%" className="self-center" />
            <div className="flex gap-2 self-center">
              <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
              <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Pipeline page skeleton - Kanban board
export function SkeletonPipelineKanban({ className }: { className?: string }) {
  const stages = ['Prospects', 'Contacted', 'Interested', 'Campus Visit', 'Offer Extended', 'Committed'];
  return (
    <div className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
      {stages.map((stage, stageIndex) => (
        <div
          key={stage}
          className="flex-shrink-0 w-72 bg-warm-50/50 rounded-2xl p-4"
          style={{ animationDelay: `${stageIndex * 100}ms` }}
        >
          {/* Column header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Skeleton variant="circular" width={8} height={8} />
              <Skeleton variant="text" width={80} height={14} />
            </div>
            <Skeleton variant="rectangular" width={24} height={20} className="rounded-full" />
          </div>
          {/* Cards */}
          <div className="space-y-3">
            {Array.from({ length: Math.max(1, 4 - stageIndex) }).map((_, cardIndex) => (
              <div
                key={cardIndex}
                className="bg-white rounded-xl border border-warm-200 p-4 animate-pulse"
                style={{ animationDelay: `${(stageIndex * 100) + (cardIndex * 50)}ms` }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <Skeleton variant="circular" width={36} height={36} />
                  <div className="flex-1">
                    <Skeleton variant="text" width="80%" className="mb-1" />
                    <Skeleton variant="text" width="60%" height={12} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton variant="rectangular" width={50} height={20} className="rounded-full" />
                  <Skeleton variant="rectangular" width={40} height={20} className="rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Videos page skeleton
export function SkeletonVideos({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={16} />
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={200} height={40} className="rounded-lg" />
          <Skeleton variant="rectangular" width={120} height={40} className="rounded-lg" />
        </div>
      </div>
      {/* Video grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-warm-200 overflow-hidden animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {/* Video thumbnail */}
            <Skeleton variant="rectangular" className="w-full aspect-video" />
            {/* Video info */}
            <div className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <Skeleton variant="circular" width={40} height={40} />
                <div className="flex-1">
                  <Skeleton variant="text" width="80%" className="mb-2" />
                  <Skeleton variant="text" width="50%" height={12} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-warm-100">
                <Skeleton variant="text" width={60} height={12} />
                <div className="flex gap-2">
                  <Skeleton variant="rectangular" width={28} height={28} className="rounded-lg" />
                  <Skeleton variant="rectangular" width={28} height={28} className="rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Calendar page skeleton
export function SkeletonCalendar({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* View selector */}
      <div className="bg-white rounded-2xl border border-warm-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={70} height={36} className="rounded-lg" />
            <Skeleton variant="rectangular" width={60} height={36} className="rounded-lg" />
            <Skeleton variant="rectangular" width={50} height={36} className="rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton variant="text" width={120} height={16} />
            <div className="flex items-center gap-1">
              <Skeleton variant="rectangular" width={80} height={36} className="rounded-lg" />
              <Skeleton variant="rectangular" width={60} height={36} className="rounded-lg" />
              <Skeleton variant="rectangular" width={50} height={36} className="rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Calendar / Event list */}
        <div className="col-span-2">
          <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden">
            <div className="p-4 border-b border-warm-200">
              <Skeleton variant="text" width={100} height={18} />
            </div>
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="border border-warm-200 rounded-lg p-4 animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Skeleton variant="rectangular" width={4} height={60} className="rounded-full" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Skeleton variant="text" width="40%" height={18} />
                          <Skeleton variant="rectangular" width={60} height={20} className="rounded-full" />
                        </div>
                        <div className="flex items-center gap-4">
                          <Skeleton variant="text" width={100} height={14} />
                          <Skeleton variant="text" width={80} height={14} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
                      <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Event Types Legend */}
          <div className="bg-white rounded-2xl border border-warm-200 p-4">
            <Skeleton variant="text" width="60%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton variant="circular" width={12} height={12} />
                  <Skeleton variant="text" width="60%" height={14} />
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="bg-white rounded-2xl border border-warm-200 p-4">
            <Skeleton variant="text" width="50%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="pb-3 border-b border-warm-200 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <Skeleton variant="circular" width={8} height={8} className="mt-1.5" />
                    <div className="flex-1">
                      <Skeleton variant="text" width="80%" className="mb-1" />
                      <Skeleton variant="text" width="60%" height={12} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-2xl border border-warm-200 p-4">
            <Skeleton variant="text" width="50%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton variant="text" width={80} height={14} />
                  <Skeleton variant="text" width={24} height={14} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compare page skeleton
export function SkeletonCompare({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Player selection */}
      <div className="flex items-center gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-1 bg-white rounded-2xl border border-warm-200 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={48} height={48} />
              <div className="flex-1">
                <Skeleton variant="text" width="60%" className="mb-2" />
                <Skeleton variant="text" width="40%" height={12} />
              </div>
              <Skeleton variant="rectangular" width={24} height={24} className="rounded" />
            </div>
          </div>
        ))}
        <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
      </div>
      {/* Comparison table */}
      <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden">
        {['Basic Info', 'Metrics', 'Stats', 'Academics'].map((section) => (
          <div key={section}>
            <div className="bg-warm-50 px-6 py-3 border-b border-warm-200">
              <Skeleton variant="text" width={100} />
            </div>
            {[1, 2, 3, 4].map(row => (
              <div key={row} className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-warm-100">
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="55%" />
                <Skeleton variant="text" width="45%" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// GOLF SKELETONS (originally in golf/GolfSkeletons.tsx)
// Glass/matte surfaces with `.skeleton-shimmer` — reproduced verbatim.
// ============================================================================

export function MetricCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-5 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-7 w-16 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-2 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="w-10 h-10 rounded-lg bg-warm-100/60 skeleton-shimmer" />
      </div>
    </div>
  );
}

export function PlayerCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-4 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-warm-200/60 skeleton-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="space-y-1">
          <div className="h-6 w-16 bg-warm-100/60 rounded-full skeleton-shimmer" />
          <div className="h-3 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

function RoundRowSkeleton({ delay = 0, showPlayer = true }: { delay?: number; showPlayer?: boolean }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Score badge */}
      <div className="w-12 h-12 rounded-lg bg-warm-100/60 flex-shrink-0 skeleton-shimmer" />

      {/* Details */}
      <div className="flex-1 space-y-2">
        {showPlayer && <div className="h-4 w-28 bg-warm-200/60 rounded skeleton-shimmer" />}
        <div className={cn(
          'bg-warm-200/60 rounded skeleton-shimmer',
          showPlayer ? 'h-3 w-40' : 'h-4 w-40'
        )} />
        <div className="h-2 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

export function QuickActionSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-[16px] border border-warm-200/45 rounded-2xl p-4 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-warm-100/60 flex-shrink-0 skeleton-shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-2.5 w-36 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function StatsCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-6 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative space-y-4">
        <div className="h-4 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-white/30 backdrop-blur-sm rounded-lg space-y-1">
              <div className="h-2.5 w-16 bg-warm-200/60 rounded skeleton-shimmer" />
              <div className="h-6 w-12 bg-warm-200/60 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QualifierCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-5 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-3 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="h-6 w-16 bg-warm-100/60 rounded-full skeleton-shimmer" />
        </div>
        <div className="h-3 w-full bg-warm-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

function MessageThreadSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-full bg-warm-200/60 flex-shrink-0 skeleton-shimmer" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
        <div className="h-3 w-48 bg-warm-100/60 rounded skeleton-shimmer" />
      </div>
      <div className="h-2.5 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
    </div>
  );
}

/** Used internally by GolfSkeletonGrid's 'announcement' type variant. */
function AnnouncementCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative surface-matte rounded-2xl p-4 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
      <div className="relative space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-3 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="h-3 w-full bg-warm-100/60 rounded skeleton-shimmer" />
        <div className="h-3 w-2/3 bg-warm-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

export function CalendarEventSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-lg bg-warm-100/60 flex-shrink-0 skeleton-shimmer" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 bg-warm-200/60 rounded skeleton-shimmer" />
        <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

function DocumentCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-4 overflow-clip"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />

      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-warm-100/60 flex-shrink-0 skeleton-shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-3 w-28 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="h-9 w-32 rounded-lg bg-cream-100/75 border border-warm-200/55 skeleton-shimmer" />
        </div>

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
              <div className="h-4 w-24 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <QuickActionSkeleton key={i} delay={i * 30} />
                ))}
              </div>
            </div>

            {/* Top Performers */}
            <div>
              <div className="h-4 w-32 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="surface-matte rounded-3xl overflow-clip ">
                <div className="divide-y divide-white/20">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-4">
                      <div className="w-8 h-8 rounded-lg bg-warm-100/60 skeleton-shimmer" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
                        <div className="h-3 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                      </div>
                      <div className="h-6 w-12 bg-warm-200/60 rounded skeleton-shimmer" />
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
              <div className="h-4 w-40 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="surface-matte rounded-3xl p-6 ">
                <div className="h-64 bg-warm-100/40 rounded-lg skeleton-shimmer" />
              </div>
            </div>

            {/* Recent Rounds */}
            <div>
              <div className="h-4 w-32 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
              <div className="surface-matte rounded-3xl overflow-clip ">
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

export function ShotStatsTabSkeleton() {
  return (
    <div className="space-y-4">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-xl overflow-clip p-4"
          >
            <div className="h-3 w-20 bg-warm-200/60 rounded mb-2 skeleton-shimmer" />
            <div className="h-8 w-16 bg-warm-200/60 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Stats Section */}
      <div className="bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-4">
        <div className="h-4 w-32 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-warm-100 last:border-0">
              <div className="h-3 w-28 bg-warm-100/60 rounded skeleton-shimmer" />
              <div className="h-3 w-16 bg-warm-200/60 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>

      {/* Another Section */}
      <div className="bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent border border-warm-200/45 rounded-2xl p-4">
        <div className="h-4 w-40 bg-warm-200/60 rounded mb-4 skeleton-shimmer" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="text-center p-3 bg-warm-50/50 rounded-lg">
              <div className="h-6 w-12 bg-warm-200/60 rounded mx-auto mb-1 skeleton-shimmer" />
              <div className="h-2 w-16 bg-warm-100/60 rounded mx-auto skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MessagesPageSkeleton() {
  return (
    <div className="h-[calc(100dvh-64px)] flex">
      {/* Conversation List */}
      <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-warm-200/60 bg-cream-100/55 backdrop-blur-sm md:backdrop-blur-glass-prominent flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-warm-100">
          <div className="flex items-center justify-between mb-1">
            <div className="h-6 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-8 w-16 bg-warm-100/60 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-4 w-36 bg-warm-100/60 rounded mt-1 skeleton-shimmer" />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-hidden py-2">
          <div className="px-4 py-1.5 mb-2">
            <div className="h-2.5 w-12 bg-warm-200/60 rounded skeleton-shimmer" />
          </div>
          <div className="space-y-0.5 px-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <MessageThreadSkeleton key={i} delay={i * 30} />
            ))}
          </div>
        </div>
      </div>

      {/* Chat Window */}
      <div className="hidden lg:flex flex-1 min-w-0 flex-col bg-warm-50">
        {/* Chat header */}
        <div className="p-4 border-b border-warm-200/60 bg-cream-100/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-warm-200/60 skeleton-shimmer" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-28 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-3 w-20 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-4 space-y-4">
          {/* Message bubbles */}
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-warm-200/60 skeleton-shimmer" />
            <div className="max-w-[70%] px-4 py-2.5 bg-white border border-warm-200 rounded-2xl rounded-bl-md">
              <div className="h-3 w-48 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="flex items-end gap-2 justify-end">
            <div className="max-w-[70%] px-4 py-2.5 bg-warm-200/60 rounded-2xl rounded-br-md skeleton-shimmer">
              <div className="h-3 w-36 bg-transparent rounded" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-warm-200/60 skeleton-shimmer" />
            <div className="max-w-[70%] px-4 py-2.5 bg-white border border-warm-200 rounded-2xl rounded-bl-md">
              <div className="h-3 w-32 bg-warm-100/60 rounded skeleton-shimmer mb-1" />
              <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 bg-white border-t border-warm-200/60">
          <div className="flex items-center gap-3 p-1.5 rounded-2xl bg-warm-50 border border-warm-200">
            <div className="flex-1 h-10 bg-transparent" />
            <div className="h-10 w-10 rounded-xl bg-warm-200/60 skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RosterPageSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-4 w-48 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-cream-100/75 border border-warm-200/55 skeleton-shimmer" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="relative surface-matte rounded-3xl overflow-clip "
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative flex items-center gap-4 p-4">
                {/* Avatar with status dot */}
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-warm-200/60 skeleton-shimmer" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-warm-300/60 border-2 border-white" />
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
                    <div className="h-5 w-12 bg-warm-100/60 rounded-full skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
                </div>

                {/* Stats - hidden on mobile */}
                <div className="hidden md:flex items-center gap-1">
                  {[1, 2, 3].map((stat) => (
                    <div key={stat} className="flex flex-col items-center px-4 py-1">
                      <div className="h-5 w-8 bg-warm-200/60 rounded skeleton-shimmer mb-0.5" />
                      <div className="h-2.5 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  <div className="h-8 w-8 bg-warm-100/60 rounded-lg skeleton-shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-4 w-56 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-cream-100/75 border border-warm-200/55 skeleton-shimmer" />
        </div>

        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="relative surface-matte rounded-3xl p-5 overflow-clip "
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
            <div className="relative space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-2/5 bg-warm-200/60 rounded skeleton-shimmer" />
                  <div className="h-3 w-3/4 bg-warm-100/60 rounded skeleton-shimmer" />
                </div>
                <div className="h-6 w-16 bg-warm-100/60 rounded-full skeleton-shimmer" />
              </div>
              <div className="h-3 w-1/2 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-2xl mx-auto px-6 py-6 md:py-8">
        <div className="space-y-3 mb-6">
          <div className="h-4 w-20 bg-warm-100/60 rounded skeleton-shimmer" />
          <div className="h-7 w-48 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-4 w-64 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>

        <div className="relative surface-matte rounded-3xl p-6 overflow-clip ">
          <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
          <div className="relative space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
                <div className="h-10 w-full bg-warm-100/60 rounded-lg skeleton-shimmer" />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-4">
              <div className="h-10 w-24 bg-warm-100/60 rounded-lg skeleton-shimmer" />
              <div className="h-10 w-32 bg-warm-200/60 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-8">
        <div className="h-4 w-20 bg-warm-100/60 rounded skeleton-shimmer mb-3" />
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-7 w-56 bg-warm-200/60 rounded skeleton-shimmer" />
            <div className="h-4 w-36 bg-warm-100/60 rounded skeleton-shimmer" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-lg bg-cream-100/75 border border-warm-200/55 skeleton-shimmer" />
            <div className="h-9 w-9 rounded-lg bg-cream-100/75 border border-warm-200/55 skeleton-shimmer" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="relative surface-matte rounded-3xl p-5 overflow-clip "
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
                <div className="relative space-y-3">
                  <div className="h-4 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="p-3 bg-white/30 rounded-lg space-y-1">
                        <div className="h-2.5 w-16 bg-warm-200/60 rounded skeleton-shimmer" />
                        <div className="h-5 w-12 bg-warm-200/60 rounded skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="relative surface-matte rounded-3xl p-5 overflow-clip ">
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative space-y-3">
                <div className="h-4 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-warm-200/60 skeleton-shimmer" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
                      <div className="h-2 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlertsPageSkeleton() {
  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-8">
        <div className="space-y-2 mb-6">
          <div className="h-7 w-24 bg-warm-200/60 rounded skeleton-shimmer" />
          <div className="h-4 w-48 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>

        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-20 bg-warm-100/60 rounded-lg skeleton-shimmer" />
          ))}
        </div>

        {/* Alert cards */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="relative surface-matte rounded-3xl p-4 overflow-clip "
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              <div className="relative flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-warm-100/60 flex-shrink-0 skeleton-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-warm-200/60 rounded skeleton-shimmer" />
                  <div className="h-3 w-1/2 bg-warm-100/60 rounded skeleton-shimmer" />
                </div>
                <div className="h-3 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Golf type-driven grid skeleton (originally `SkeletonGrid` in
 * golf/GolfSkeletons.tsx). Renamed to `GolfSkeletonGrid` here to resolve the
 * name collision with the player-card grid `SkeletonGrid` from skeleton-loader
 * — both were dead externally, so no consumer import changes. Behavior + look
 * preserved verbatim.
 */
export function GolfSkeletonGrid({
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

// ============================================================================
// TASK SKELETON (originally in baseball/tasks/TaskSkeleton.tsx)
// Composition over the canonical `Skeleton` primitive.
// ============================================================================

function TaskSkeleton() {
  return (
    <div className="relative glass-standard rounded-2xl overflow-clip p-5">
      <div className="space-y-3">
        {/* Title */}
        <div className="flex items-start justify-between">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-20" />
        </div>

        {/* Description */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

export function TaskListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <TaskSkeleton key={i} />
      ))}
    </div>
  );
}
