import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for My Journey (Lane 3 · THE PASSPORT).
 * Mirrors JourneyClient's Living Annual masthead + two-column layout (schools
 * list + activity timeline) so there is no legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={220} height={11} />
        <Skeleton variant="text" width={160} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-8 border-t border-[color:var(--hairline)] pt-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {[0, 1, 2].map((i) => (
            <PaperCard key={i} className="p-4 lg:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="40%" height={18} />
                  <Skeleton variant="text" width="30%" height={11} />
                </div>
                <Skeleton variant="rectangular" width={96} height={32} className="rounded-lg" />
              </div>
              <div className="mt-4 border-t border-[color:var(--hairline)] pt-3">
                <Skeleton variant="text" width={80} height={12} />
              </div>
            </PaperCard>
          ))}
        </div>
        <PaperCard className="space-y-4 p-5">
          <Skeleton variant="text" width="40%" height={14} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" width="100%" height={22} />
          ))}
        </PaperCard>
      </div>
    </div>
  );
}
