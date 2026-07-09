import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for Teams (Lane 3 · THE PRESSBOX, team ink —
 * showcase-org multi-team management). Mirrors TeamsClient's masthead + team
 * card grid so there is no legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={150} height={11} />
        <Skeleton variant="text" width={110} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 space-y-4">
            <Skeleton variant="text" width="60%" height={18} />
            <Skeleton variant="text" width="40%" height={12} />
            <Skeleton variant="rectangular" height={36} className="rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
