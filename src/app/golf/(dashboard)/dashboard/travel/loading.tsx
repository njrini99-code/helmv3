import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Purpose-built Suspense fallback for the Travel surface. Shape-matches
 * FairwayTravel (max-w-[1280px] ViewHeader masthead → `lg:grid-cols-3`: a
 * 1-col trip list of FairwayTripCard-shaped rows + a 2-col detail panel), so
 * the real page paints in place with no layout swap / CLS on hydrate.
 * Previously fell back to the legacy `GenericPageSkeleton` (cream/warm
 * tokens) — a flash-of-wrong-design against this Fairway-only route.
 *
 * The detail panel mirrors the no-selection DEFAULT first paint (no `?trip=`
 * param): a compact "Select a trip" `EmptyState` (`Surface` padding="lg" +
 * `variant="subtle"`), not the populated FairwayTripDetail (tabs + schedule
 * cards) that only renders once a trip is selected — see
 * FairwayTravel.tsx:419-454.
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

          {/* Detail panel — default first paint (no trip selected) is the
              compact "Select a trip" EmptyState, not the populated
              tabs+schedule-cards detail view. Mirrors EmptyState's own
              `variant="subtle"` shape (h-12 icon chip, one title line, one
              wrapped description line) inside the same `padding="lg"`
              Surface the real empty state renders in. */}
          <div className="lg:col-span-2">
            <Surface elevation="border" padding="lg">
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="mx-auto h-5 w-28" />
                  <Skeleton className="mx-auto h-3.5 w-64 max-w-full" />
                  <Skeleton className="mx-auto h-3.5 w-40 max-w-full" />
                </div>
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
