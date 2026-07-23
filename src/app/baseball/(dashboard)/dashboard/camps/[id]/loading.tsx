import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Camp Details (Lane 4 · THE WAR ROOM, clay
 * ink — coaches manage the camp roster from here).
 *
 * page.tsx only performs a server-side auth check (no data fetch); all camp +
 * registration data loads client-side in CampDetailClient, which shows its OWN
 * `CampDetailSkeleton` (masthead + info card + 4 stat tiles, no roster list)
 * while that fetch is in flight. This file is deliberately kept identical in
 * shape to that skeleton — masthead + info card + stat tiles only, no roster
 * rows — so the route-transition flash and the client's own loading state
 * read as ONE skeleton instead of a roster section popping in, then out,
 * then back in with real data.
 */
export default function CampDetailLoading() {
  return (
    <div className={`${PAGE_SHELL} space-y-6`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={200} height={11} />
        <Skeleton variant="text" width={160} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <PaperCard className="p-6">
        <Skeleton variant="text" width="40%" height={18} />
      </PaperCard>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PaperCard key={i} className="p-4">
            <Skeleton variant="text" width="60%" height={11} className="mb-2" />
            <Skeleton variant="text" width="40%" height={28} />
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
