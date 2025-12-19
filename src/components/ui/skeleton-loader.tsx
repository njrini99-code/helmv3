'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'shimmer';
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const styles: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={cn(
        'bg-slate-100',
        animation === 'pulse' && 'animate-pulse',
        animation === 'shimmer' && 'skeleton-shimmer',
        variant === 'text' && 'h-4 rounded',
        variant === 'circular' && 'rounded-full',
        variant === 'rectangular' && 'rounded-lg',
        className
      )}
      style={styles}
    />
  );
}

// Pre-built skeleton components for common use cases

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
    <div className={cn('p-5 bg-white rounded-xl border border-slate-100', className)}>
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
    <div className={cn('p-5 bg-white rounded-xl border border-slate-100', className)}>
      <div className="flex items-start gap-4 mb-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1">
          <Skeleton variant="text" width="70%" className="mb-2" />
          <Skeleton variant="text" width="50%" height={12} />
          <Skeleton variant="text" width="40%" height={12} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-100">
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
    <div className={cn('bg-white rounded-xl border border-slate-100 overflow-hidden', className)}>
      {/* Header */}
      <div className="grid gap-4 p-4 border-b border-slate-100 bg-slate-50" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width="60%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 p-4 border-b border-slate-50 last:border-0"
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
    <div className={cn('p-5 bg-white rounded-xl border border-slate-100', className)}>
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
        <div key={stage} className="bg-slate-50 rounded-xl p-4 min-h-[500px]">
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
          <div key={i} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 p-6 animate-pulse">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <Skeleton variant="text" width="50%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
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
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
            className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse"
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
            <div className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-100">
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
        {['All', 'Pitchers', 'Catchers', 'Infielders', 'Outfielders'].map((tab, i) => (
          <Skeleton key={i} variant="rectangular" width={i === 0 ? 60 : 90} height={36} className="rounded-full" />
        ))}
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 gap-4 p-4 bg-slate-50 border-b border-slate-200">
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
            className="grid grid-cols-7 gap-4 p-4 border-b border-slate-100 last:border-0"
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
          className="flex-shrink-0 w-72 bg-slate-50/50 rounded-2xl p-4"
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
                className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse"
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

// Messages page skeleton
export function SkeletonMessages({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-[calc(100vh-200px)] bg-white rounded-2xl border border-slate-200 overflow-hidden', className)}>
      {/* Conversation list */}
      <div className="w-80 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <Skeleton variant="rectangular" height={40} className="rounded-lg" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="p-4 border-b border-slate-100 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start gap-3">
                <Skeleton variant="circular" width={44} height={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width={40} height={10} />
                  </div>
                  <Skeleton variant="text" width="80%" height={12} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div>
            <Skeleton variant="text" width={120} className="mb-1" />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        </div>
        {/* Messages */}
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[70%]', i % 2 === 0 ? 'items-end' : 'items-start')}>
                <Skeleton
                  variant="rectangular"
                  width={200 + (i * 30)}
                  height={60}
                  className={cn('rounded-2xl', i % 2 === 0 ? 'bg-green-100' : 'bg-slate-100')}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Input */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" className="flex-1 h-12 rounded-xl" />
            <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
          </div>
        </div>
      </div>
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
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse"
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
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
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
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <Skeleton variant="text" width={100} height={18} />
            </div>
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-4 animate-pulse"
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <Skeleton variant="text" width="50%" height={18} className="mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="pb-3 border-b border-slate-200 last:border-0 last:pb-0">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
          <div key={i} className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {['Basic Info', 'Metrics', 'Stats', 'Academics'].map((section, sectionIndex) => (
          <div key={section}>
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
              <Skeleton variant="text" width={100} />
            </div>
            {[1, 2, 3, 4].map(row => (
              <div key={row} className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-slate-100">
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
