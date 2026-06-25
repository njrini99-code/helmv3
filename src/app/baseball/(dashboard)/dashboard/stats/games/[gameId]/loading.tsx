import { Skeleton } from '@/components/ui/skeleton';

/**
 * Game detail / box score loading skeleton — mirrors the real layout:
 * breadcrumb → game header card → batting table → pitching section.
 */
export default function GameDetailLoading() {
  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-40" />

      {/* Game header card */}
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-16 rounded-xl" />
            <Skeleton className="h-7 w-4" />
            <Skeleton className="h-14 w-16 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <Skeleton className="h-9 w-44 rounded-xl" />

      {/* Table skeleton */}
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-warm-100">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
