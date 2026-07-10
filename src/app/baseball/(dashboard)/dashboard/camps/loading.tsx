import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Camps & Showcases. Shared coach/player
 * surface — CampsClient picks the lane ink (team/pursuit) from `useAuth()`
 * client-side, which isn't resolved yet at this Suspense boundary, so this
 * skeleton renders the neutral hairline rule rather than guessing an ink.
 * Mirrors CampsClient's own `CampsSkeleton` card grid.
 */
export default function CampsLoading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={210} height={11} />
        <Skeleton variant="text" width={120} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <PaperCard key={i} className="p-5">
            <Skeleton variant="text" width="70%" height={18} className="mb-2" />
            <Skeleton variant="text" width="50%" height={12} className="mb-3" />
            <Skeleton variant="text" width="60%" height={12} className="mb-1.5" />
            <Skeleton variant="text" width="40%" height={12} />
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
