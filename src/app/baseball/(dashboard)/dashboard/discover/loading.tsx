import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Discover (Lane 4 · THE WAR ROOM, clay ink).
 * Mirrors DiscoverClient's masthead + filter sidebar + results grid so there
 * is no legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={200} height={11} />
        <Skeleton variant="text" width={140} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
          <PaperCard className="space-y-4 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton variant="text" width="50%" height={11} />
                <Skeleton variant="rectangular" height={36} className="rounded-lg" />
              </div>
            ))}
          </PaperCard>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <PaperCard key={i} className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton variant="circular" width={48} height={48} />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="70%" height={16} />
                    <Skeleton variant="text" width="50%" height={11} />
                    <Skeleton variant="text" width="40%" height={16} className="mt-2" />
                  </div>
                </div>
              </PaperCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
