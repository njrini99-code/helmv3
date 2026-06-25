import { Skeleton } from '@/components/ui/skeleton';

/**
 * Player profile loading skeleton — mirrors PlayerProfileClient's layout:
 * header avatar + bio → tab bar → snapshot grid → career stats.
 */
export default function PlayerProfileLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <Skeleton className="mb-6 h-4 w-24" />

        {/* Player header card */}
        <div className="glass-standard rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <Skeleton className="h-24 w-24 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-4 w-36" />
              <div className="flex flex-wrap gap-2 mt-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-6 w-20 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-xl" />
          ))}
        </div>

        {/* Snapshot grid placeholder */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>

        {/* Two-column content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
