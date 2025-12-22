/**
 * Skeleton loading components
 * Show while content is loading for better perceived performance
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton component
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200',
        className
      )}
    />
  );
}

/**
 * Player card skeleton
 */
export function PlayerCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 p-6', className)}>
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 space-y-3">
          {/* Name */}
          <Skeleton className="h-5 w-32" />

          {/* Position */}
          <Skeleton className="h-4 w-24" />

          {/* Stats */}
          <div className="flex gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        {/* Button */}
        <Skeleton className="h-9 w-24 flex-shrink-0" />
      </div>
    </div>
  );
}

/**
 * Video card skeleton
 */
export function VideoCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-slate-100 rounded-xl overflow-hidden aspect-video', className)}>
      <Skeleton className="w-full h-full" />
    </div>
  );
}

/**
 * Message skeleton
 */
export function MessageSkeleton({ isFromMe = false, className }: SkeletonProps & { isFromMe?: boolean }) {
  return (
    <div className={cn('flex items-end gap-2', isFromMe && 'flex-row-reverse', className)}>
      {!isFromMe && <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />}
      <Skeleton className={cn('h-12 rounded-2xl', isFromMe ? 'w-2/3 ml-auto' : 'w-2/3')} />
    </div>
  );
}

/**
 * Conversation list item skeleton
 */
export function ConversationItemSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('flex items-center gap-3 p-4', className)}>
      {/* Avatar */}
      <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full max-w-md" />
      </div>

      {/* Time */}
      <Skeleton className="h-3 w-12 flex-shrink-0" />
    </div>
  );
}

/**
 * Table row skeleton
 */
export function TableRowSkeleton({ columns = 4, className }: SkeletonProps & { columns?: number }) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

/**
 * Stat card skeleton
 */
export function StatCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 p-6', className)}>
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

/**
 * Profile header skeleton
 */
export function ProfileHeaderSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8', className)}>
      <div className="flex items-start gap-8">
        {/* Avatar */}
        <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />

        {/* Info */}
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-3">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * Bento grid skeleton
 */
export function BentoGridSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('grid grid-cols-4 gap-6', className)}>
      <div className="col-span-2">
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <div className="col-span-2">
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Form skeleton
 */
export function FormSkeleton({ fields = 5, className }: SkeletonProps & { fields?: number }) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

/**
 * List skeleton
 */
export function ListSkeleton({ items = 5, className }: SkeletonProps & { items?: number }) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
          <Skeleton className="h-8 w-20 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Dashboard skeleton
 */
export function DashboardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
