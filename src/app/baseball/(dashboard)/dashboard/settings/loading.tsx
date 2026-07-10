import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for the Settings hub (Lane 3 · THE PRESSBOX,
 * team ink). Mirrors the page's masthead + link-card grid so there is no
 * legacy chrome flash on navigation.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={140} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
            <div className="flex items-start gap-3">
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton variant="text" width="60%" height={16} />
                <Skeleton variant="text" width="90%" height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
