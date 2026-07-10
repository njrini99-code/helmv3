import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for Events (Lane 3 · THE PRESSBOX, team ink).
 * Mirrors EventsClient's masthead + filter bar + event-row list so there is
 * no legacy chrome flash on navigation.
 */
export default function EventsLoading() {
  return (
    <>
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <Skeleton variant="text" width={160} height={11} />
          <Skeleton variant="text" width={100} height={36} />
          <Skeleton className="h-[3px] w-16 rounded-full" />
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Skeleton variant="rectangular" height={40} className="w-full rounded-lg sm:w-48" />
          <Skeleton variant="rectangular" height={40} className="w-full rounded-lg sm:w-48" />
        </div>

        <div className="space-y-6">
          {[0, 1].map((g) => (
            <div key={g}>
              <Skeleton variant="text" width={160} height={16} className="mb-3" />
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-4">
                    <div className="flex items-start gap-4">
                      <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton variant="text" width="60%" height={16} />
                        <Skeleton variant="text" width="40%" height={12} />
                        <div className="flex gap-2">
                          <Skeleton variant="rectangular" width={64} height={20} className="rounded-full" />
                          <Skeleton variant="rectangular" width={80} height={20} className="rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
