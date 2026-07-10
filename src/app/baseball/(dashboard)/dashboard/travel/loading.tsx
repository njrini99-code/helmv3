import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for Travel (Lane 3 · THE PRESSBOX, team ink).
 * Mirrors TravelClient's masthead + itinerary card list so there is no
 * legacy chrome flash on navigation.
 */
export default function TravelLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={160} height={11} />
        <Skeleton variant="text" width={100} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
            <div className="flex items-center gap-4">
              <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton variant="text" width="40%" height={18} />
                <Skeleton variant="text" width="60%" height={14} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
