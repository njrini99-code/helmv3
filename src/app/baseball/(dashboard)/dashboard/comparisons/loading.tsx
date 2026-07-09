import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Saved Comparisons (Lane 4 · THE WAR ROOM,
 * clay ink). Mirrors the page's Living Annual masthead + PaperCard grid
 * (spec: docs/baseball/design-system-living-annual.md §7) so there is no
 * legacy chrome flash on navigation.
 */
export default function ComparisonsLoading() {
  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={230} height={11} />
        <Skeleton variant="text" width={210} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <PaperCard key={i} className="p-6">
            <Skeleton variant="text" width="75%" height={16} className="mb-3" />
            <Skeleton variant="text" width="50%" height={12} className="mb-4" />
            <div className="space-y-2">
              <Skeleton variant="text" width="100%" height={12} />
              <Skeleton variant="text" width="85%" height={12} />
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
