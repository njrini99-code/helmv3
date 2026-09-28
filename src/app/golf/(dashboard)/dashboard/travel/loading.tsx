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

        {/* Masthead: ViewHeader (eyebrow · title · meta) + CTA. The redesign
            dropped the description line, so no third bar. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-9 w-32 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-40 max-w-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-fw-md" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-1">
            {/* Phone: the next-trip hero (FairwayNextTrip): eyebrow + pill,
                title, sub line, date, big time, one button. */}
            <div className="lg:hidden">
              <Surface elevation="border" padding="none">
                <div className="flex flex-col gap-4 p-5">
                  <Skeleton className="h-5 w-40 rounded-full" />
                  <div>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-3.5 w-36" />
                  </div>
                  <div>
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="mt-2 h-7 w-32" />
                  </div>
                  {/* Wear / Stay rows */}
                  <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                  </div>
                  <Skeleton className="h-11 w-40 rounded-full" />
                </div>
              </Surface>
            </div>

            {/* "Coming up" dated rows (FairwayTripCard): date block + name,
                time · destination, status pill. */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-card border border-border-subtle bg-surface p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex w-10 flex-shrink-0 flex-col items-center gap-1.5">
                      <Skeleton className="h-3 w-7" />
                      <Skeleton className="h-5 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="mt-2 h-3.5 w-2/5" />
                      <Skeleton className="mt-3 h-5 w-16 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Past trips disclosure row (collapsed). */}
            <Skeleton className="h-3 w-24" />
          </div>

          {/* Desktop: the next trip's sheet is shown by default (header, tabs,
              timeline rows); there is no "Select a trip" empty pane any more. */}
          <div className="hidden lg:col-span-2 lg:block">
            <Surface elevation="border" padding="none">
              <div className="border-b border-border-subtle p-6">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="mt-2 h-3.5 w-40" />
                <div className="mt-4 flex gap-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
                {/* Tabs strip: Trip sheet | Expenses */}
                <div className="mt-4 flex gap-6">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="flex flex-col px-6 pb-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[4.75rem_1fr] gap-x-3 border-b border-border-subtle py-4 last:border-b-0">
                    <Skeleton className="h-3.5 w-14" />
                    <div>
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="mt-2 h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
