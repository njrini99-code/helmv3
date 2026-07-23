import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for the Organization dashboard (Lane 3 · THE
 * PRESSBOX, team ink). Mirrors OrganizationClient's masthead + its actual
 * 2-card landing grid (Teams, Events — not 4), plus placeholder rows for
 * the TeamSelector and OrgDashboard's 5-up stat strip rendered immediately
 * below it, so there is no legacy chrome flash or content pop-in on
 * navigation.
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
        {[0, 1].map((i) => (
          <div key={i} className="flex items-start gap-4 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton variant="text" width="50%" height={16} />
              <Skeleton variant="text" width="90%" height={12} />
            </div>
          </div>
        ))}
      </div>

      {/* TeamSelector */}
      <div className="rounded-2xl border border-warm-200 bg-cream-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton variant="text" width={70} height={14} />
              <Skeleton variant="text" width={140} height={11} />
            </div>
          </div>
          <div className="flex-1 md:ml-auto md:max-w-sm">
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* OrgDashboard's 5-up stat strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-warm-200 bg-cream-50 p-4">
            <Skeleton variant="text" width={80} height={11} />
            <Skeleton variant="text" width={48} height={24} />
          </div>
        ))}
      </div>
    </div>
  );
}
