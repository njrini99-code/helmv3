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
function PassSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
      <div className="h-10 bg-accent-wash" />
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 p-5">
          <Skeleton className="h-3.5 w-32" />
          <div className="mt-4 flex justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-dashed border-border-strong bg-surface-sunken px-5 py-4 sm:w-44 sm:flex-col sm:items-start sm:border-l sm:border-t-0">
          <Skeleton className="h-14 w-16" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}

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

        {/* Travel season strip */}
        <div className="mt-6 rounded-card border border-border-subtle bg-surface px-5 pb-3 pt-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-6 h-px w-full" />
          <div className="mt-6 flex justify-between">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-8" />
            ))}
          </div>
        </div>

        {/* Desktop: the boarding pass spans the page */}
        <div className="mt-6 hidden lg:block">
          <PassSkeleton />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-1">
            {/* Phone: the boarding pass (FairwayNextTrip): carrier band, FROM → TO,
                two field rows, then the countdown stub. */}
            <div className="lg:hidden">
              <PassSkeleton />
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
