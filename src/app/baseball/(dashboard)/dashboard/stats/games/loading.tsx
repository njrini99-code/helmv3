import { Skeleton } from '@/components/ui/skeleton';

/**
 * Games list loading skeleton — mirrors the real layout:
 * header → tab filter → 4 game cards.
 */
export default function GamesLoading() {
  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Tab filter */}
      <Skeleton className="h-9 w-64 rounded-xl" />

      {/* Game cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
