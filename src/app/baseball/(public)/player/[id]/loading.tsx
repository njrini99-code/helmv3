import { Skeleton } from '@/components/ui/skeleton';

/**
 * Public player profile loading skeleton — mirrors the hero card + tab bar
 * layout of PlayerProfileClient so the transition is smooth, not jarring.
 */
export default function PublicPlayerProfileLoading() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-warm-50 via-white to-primary-50/30">
      {/* Banner skeleton */}
      <div className="h-52 md:h-64 bg-warm-200/60 animate-pulse" />

      {/* Profile card skeleton — overlapping the banner */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 -mt-28 md:-mt-32 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-warm-200/50 overflow-hidden">
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <Skeleton className="w-32 h-32 md:w-40 md:h-40 rounded-2xl shrink-0" />

              {/* Info */}
              <div className="flex-1 space-y-3">
                <Skeleton className="h-9 w-56" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>

              {/* Quick counts */}
              <div className="flex items-center gap-6">
                <div className="text-center space-y-1">
                  <Skeleton className="h-7 w-10 mx-auto" />
                  <Skeleton className="h-3 w-12 mx-auto" />
                </div>
                <div className="text-center space-y-1">
                  <Skeleton className="h-7 w-10 mx-auto" />
                  <Skeleton className="h-3 w-16 mx-auto" />
                </div>
              </div>
            </div>
          </div>

          {/* Tab bar skeleton */}
          <div className="border-t border-warm-200 bg-warm-50/50 px-2 py-1">
            <div className="flex gap-1 overflow-x-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-24 rounded-none" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab content skeleton */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
