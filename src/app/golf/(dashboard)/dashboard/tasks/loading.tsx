import { GenericPageSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P433 — purpose-built loading state for the Tasks board (redesign path). The
 * generic 4-card list skeleton did not match FairwayTasks (max-w-[1280px]
 * ViewHeader masthead → filter pills → search → a `grid lg:grid-cols-3` task
 * list + Templates rail), causing a layout swap / CLS on hydrate. This reserves
 * the real slots with Fairway tokens so the board paints in place. The legacy
 * GenericPageSkeleton stays behind the flag-off fork. isRedesignEnabled() is
 * build-time-inlined and safe to read in a loading boundary.
 */
function FairwayTasksLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading tasks…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description · meta) + CTA */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-9 w-52 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-fw-md" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {[64, 72, 96].map((w) => (
              <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
            ))}
          </div>

          {/* Search */}
          <Skeleton className="h-11 w-full max-w-md rounded-fw-md" />

          {/* List (col-span-2) + Templates rail */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-3 lg:col-span-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Surface key={i} elevation="border" padding="none" className="overflow-hidden">
                  <div className="flex items-start gap-4 p-4 md:p-5">
                    <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-fw-sm" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="mt-2 h-3.5 w-3/4" />
                      <div className="mt-3 flex items-center gap-2">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </div>
                    </div>
                  </div>
                </Surface>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Surface elevation="border" padding="none" className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                  <Skeleton className="h-[18px] w-[18px] rounded-fw-sm" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex flex-col gap-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-fw-md" />
                  ))}
                </div>
              </Surface>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayTasksLoading />;
  return <GenericPageSkeleton />;
}
