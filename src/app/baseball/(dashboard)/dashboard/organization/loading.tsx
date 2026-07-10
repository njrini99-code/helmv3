import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for the Organization dashboard (Lane 3 · THE
 * PRESSBOX, team ink). Mirrors OrganizationClient's masthead + landing-card
 * grid so there is no legacy chrome flash on navigation.
 */
export default function OrganizationLoading() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={210} height={11} />
        <Skeleton variant="text" width={260} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-4 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton variant="text" width="50%" height={16} />
              <Skeleton variant="text" width="90%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
