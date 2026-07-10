import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for a single Development Plan (Lane 3 · THE
 * PRESSBOX, team ink). Mirrors the page's own loading branch (masthead + plan
 * header card + goals grid).
 */
export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-6`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={230} height={11} />
        <Skeleton variant="text" width={180} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <PaperCard className="p-6">
        <Skeleton variant="text" width="40%" height={18} className="mb-3" />
        <Skeleton variant="text" width="100%" height={40} />
      </PaperCard>

      <PaperCard className="p-6">
        <Skeleton variant="text" width={140} height={18} className="mb-1" />
        <Skeleton variant="text" width={96} height={12} className="mb-4" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 rounded-fw-md border border-[color:var(--hairline)] p-4">
              <div className="flex items-start gap-2">
                <Skeleton variant="circular" width={20} height={20} />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="75%" height={16} />
                  <Skeleton variant="text" width="33%" height={12} />
                </div>
              </div>
              <Skeleton variant="rectangular" height={6} className="w-full rounded-full" />
              <Skeleton variant="text" width={96} height={12} />
            </div>
          ))}
        </div>
      </PaperCard>
    </div>
  );
}
