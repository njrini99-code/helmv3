import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';

// Route-level Suspense fallback for /baseball/dashboard/analytics. Mirrors
// AnalyticsClient's own `AnalyticsSkeleton` (masthead + 4-col KPI skeleton +
// single chart-shaped block + single ruled-list block) exactly, on the same
// `max-w-[1536px]` shell, so the route fallback and the client's own
// client-side loading state (shown while `useAnalytics()` resolves) agree —
// no legacy "Top Schools + Recent Activity" two-column layout that no
// longer exists on this page.
const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

export default function Loading() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading Analytics…</span>

      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton variant="text" width="70%" height={11} />
            <Skeleton variant="text" width="50%" height={34} />
          </div>
        ))}
      </div>

      <PaperCard className="p-5">
        <Skeleton variant="text" width="30%" height={14} className="mb-4" />
        <Skeleton variant="rectangular" className="h-44 w-full" />
      </PaperCard>

      <PaperCard className="space-y-4 p-5">
        <Skeleton variant="text" width="40%" height={14} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="text" width="100%" height={22} />
        ))}
      </PaperCard>
    </div>
  );
}
