import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8';

/**
 * Route-level loading skeleton for Watchlist (Lane 4 · THE WAR ROOM, clay ink).
 * Mirrors WatchlistClient's masthead (title + Add Player/Export actions +
 * filter row) and its own in-client `WatchlistSkeleton` table shape, so
 * there is no legacy `Header` chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={200} height={11} />
        <div className="flex items-start justify-between gap-4">
          <Skeleton variant="text" width={160} height={36} />
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-fw-sm" />
            <Skeleton className="h-9 w-32 rounded-fw-sm" />
          </div>
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />

        <div className="flex flex-wrap items-center gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-32 rounded-fw-sm" />
          ))}
        </div>
      </div>

      <div className="mt-8">
        <PaperCard className="overflow-hidden p-0">
          <div className="border-b border-[color:var(--hairline)] px-6 py-4">
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border-b border-[color:var(--hairline)] px-6 py-4 last:border-b-0">
              <div className="flex items-center gap-6">
                <Skeleton className="h-4 w-4" />
                <div className="flex items-center gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </PaperCard>
      </div>
    </div>
  );
}
