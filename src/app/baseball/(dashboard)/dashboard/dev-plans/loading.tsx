import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Development Plans (Lane 3 · THE PRESSBOX,
 * team ink). Mirrors DevPlansClient's masthead + KPI strip + plan-row cards
 * (its own `PlansListSkeleton`) so there is no legacy chrome flash on
 * navigation.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={230} height={11} />
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton variant="text" width="60%" height={11} />
            <Skeleton variant="text" width="40%" height={22} />
          </div>
        ))}
      </div>

      <div className="space-y-4 border-t border-[color:var(--hairline)] pt-6">
        {[0, 1, 2].map((i) => (
          <PaperCard key={i} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="40%" height={16} />
                <Skeleton variant="text" width="60%" height={12} />
              </div>
              <Skeleton variant="text" width={64} height={20} />
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
