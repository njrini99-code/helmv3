import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Discover Colleges (Lane 3 · THE PASSPORT).
 * Mirrors CollegesClient's masthead + filter bar + card grid so there is no
 * legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={230} height={11} />
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <PaperCard className="p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Skeleton variant="rectangular" height={40} className="min-w-[200px] flex-1 rounded-lg sm:max-w-md" />
          <div className="grid grid-cols-3 gap-3 sm:flex">
            <Skeleton variant="rectangular" width={96} height={40} className="rounded-lg sm:w-36" />
            <Skeleton variant="rectangular" width={96} height={40} className="rounded-lg sm:w-36" />
            <Skeleton variant="rectangular" width={96} height={40} className="rounded-lg sm:w-48" />
          </div>
        </div>
      </PaperCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
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
  );
}
