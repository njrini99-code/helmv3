import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8';

/**
 * Route-level loading skeleton for Signals (Lane 4 · THE WAR ROOM, clay ink).
 * Mirrors SignalInboxClient's masthead + severity summary strip + view toggle
 * + feed so there is no legacy raw-div chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={220} height={11} />
        <div className="flex items-start justify-between gap-4">
          <Skeleton variant="text" width={120} height={36} />
          <Skeleton className="h-9 w-36 rounded-fw-sm" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton variant="text" width="60%" height={20} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-24 rounded-fw-sm" />
        ))}
        <span className="mx-1 mb-2 h-8 w-px bg-[color:var(--hairline)]" aria-hidden />
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-28 rounded-full" />
          ))}
        </div>
      </div>

      <div className="mt-6 mb-5">
        <Skeleton className="h-10 w-72 max-w-full rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <PaperCard key={i} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton variant="text" width="70%" height={16} />
                <Skeleton variant="text" width="35%" height={13} />
              </div>
              <Skeleton className="h-6 w-16 rounded-fw-sm" />
            </div>
            <Skeleton variant="text" width="90%" height={13} className="mt-2.5" />
          </PaperCard>
        ))}
      </div>
    </div>
  );
}
