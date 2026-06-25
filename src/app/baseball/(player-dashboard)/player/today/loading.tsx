// Route-level skeleton for Player Today. The page awaits a Promise.all of
// getPlayerToday + getPlayerDailyContract + getPlayerPassport plus team-tz
// resolution before rendering, so without this a navigation froze the previous
// route until all four resolved. Mirrors PlayerTodayClient's first viewport
// (header + summary/readiness + 2-col primary / sidebar grid).

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerTodayLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Header */}
        <div className="mb-8">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-9 w-72" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>

        {/* Summary strip + readiness gate */}
        <div className="mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-20 rounded-2xl" />
        </div>

        {/* Body grid: primary column + sidebar */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
