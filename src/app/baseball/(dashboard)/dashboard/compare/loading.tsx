import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/**
 * Route-level loading skeleton for Compare Players (Lane 4 · THE WAR ROOM,
 * clay ink). Mirrors CompareClient's own `loading` skeleton branch (search
 * bar + player column cards) so there is no legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-6`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={190} height={11} />
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <PaperCard className="p-5">
        <Skeleton variant="text" width={160} height={16} className="mb-3" />
        <Skeleton variant="text" width="100%" height={40} />
      </PaperCard>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PaperCard key={i} className="p-6">
            <Skeleton variant="circular" width={64} height={64} className="mx-auto mb-3" />
            <Skeleton variant="text" width="75%" className="mx-auto mb-2" />
            <Skeleton variant="text" width="50%" className="mx-auto mb-4" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((j) => (
                <Skeleton key={j} variant="text" width="100%" height={12} />
              ))}
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
