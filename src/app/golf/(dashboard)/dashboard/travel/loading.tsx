import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';

/**
 * Purpose-built Suspense fallback for the Travel surface. Shape-matches
 * FairwayTravel (max-w-[1280px] ViewHeader masthead → `lg:grid-cols-3`: a
 * 1-col trip list of FairwayTripCard-shaped rows + a 2-col FairwayTripDetail
 * panel), so the real page paints in place with no layout swap / CLS on
 * hydrate. Previously fell back to the legacy `GenericPageSkeleton` (cream/
 * warm tokens) — a flash-of-wrong-design against this Fairway-only route.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading travel…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description · meta) + CTA */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-2 h-9 w-64 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-fw-md" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Itinerary list */}
          <div className="flex flex-col gap-3 lg:col-span-1">
            <Skeleton className="h-3 w-14" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border-subtle bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 flex-shrink-0 rounded-fw-md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-3/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            <Surface elevation="border" padding="none" className="overflow-hidden">
              {/* Header */}
              <div className="flex flex-col gap-4 border-b border-border-subtle p-6">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-11 w-11 flex-shrink-0 rounded-fw-md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-3.5 w-1/2" />
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                </div>
              </div>

              {/* Body — schedule cards */}
              <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
                <Inset padding="sm">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-4 w-28" />
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </Inset>
                <Inset padding="sm">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-4 w-28" />
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </Inset>
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
