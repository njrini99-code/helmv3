import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Camp Details (Lane 4 · THE WAR ROOM, clay
 * ink — coaches manage the camp roster from here). Mirrors CampDetailClient's
 * own `CampDetailSkeleton` (masthead + info card + stat tiles + roster list).
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
            <Skeleton variant="text" width="30%" height={22} />
          </PaperCard>
        ))}
      </div>

      <PaperCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-6 py-4">
          <Skeleton variant="text" width={96} height={18} />
          <Skeleton variant="rectangular" width={180} height={32} className="rounded-lg" />
        </div>
        <div className="divide-y divide-[color:var(--hairline)]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" width="30%" height={16} />
                <Skeleton variant="text" width="50%" height={12} />
              </div>
              <Skeleton variant="rectangular" width={80} height={24} className="rounded-full" />
            </div>
          ))}
        </div>
      </PaperCard>
    </div>
  );
}
