import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';
import { cn } from '@/lib/utils';

/**
 * Purpose-built Suspense fallback for the Travel surface. Shape-matches
 * FairwayTravel's first paint (max-w-[1280px] ViewHeader masthead →
 * `lg:grid-cols-3`), so the real page paints in place with no layout swap.
 *
 * The list mirrors the grouped trip list: a small group heading over a
 * hairline, then FairwayTripCard-shaped rows (date tile, name, destination,
 * dates, the status pill on its own line): one raised upcoming row, then two
 * receded past rows. The detail column mirrors FairwayTripDetail, which the
 * desktop panel always shows (the default trip; there is no "Select a trip"
 * pane): status pill, name and destination beside the countdown tile, the
 * sunken journey band, the tab row, and two raised modules. Below lg the
 * first paint is the list alone, so the detail skeleton is desktop-only.
 */
function GroupHeadingSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-3 w-3" />
      <span aria-hidden="true" className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function TripCardSkeleton({ past = false }: { past?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border border-border-subtle p-3 sm:p-4',
        past ? 'bg-transparent' : 'bg-surface [box-shadow:var(--fw-shadow-card)]',
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Date tile: month, day, weekday. */}
        <Skeleton className="h-[74px] w-14 flex-shrink-0 rounded-fw-md" />
        <div className="min-w-0 flex-1">
          {/* Each bar sits in its text's line box so the row height matches. */}
          <div className="flex h-[21px] items-center">
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <div className="mt-0.5 flex h-5 items-center">
            <Skeleton className="h-3 w-2/5" />
          </div>
          <div className="mt-1 flex h-[18px] items-center">
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="mt-2 h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function TripDetailSkeleton() {
  return (
    <Surface elevation="shadow" padding="none" className="overflow-hidden">
      <div className="px-6 pt-6">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="mt-2.5 h-4 w-48" />
          </div>
          <Skeleton className="h-[78px] w-[6.5rem] flex-shrink-0 rounded-fw-md" />
        </div>
        {/* Journey band: depart, transport, return. */}
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-fw-md bg-surface-sunken px-5 py-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton circle className="h-8 w-8" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {/* Tab row over its hairline. */}
        <div className="-mx-6 mt-5 flex gap-2 border-b border-border-subtle px-6 pb-3 pt-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-fw-md border border-border-subtle bg-elevated p-4 shadow-soft"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </Surface>
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

        {/* Masthead: ViewHeader (eyebrow · title · description · counts) + CTA */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-2 h-9 w-64 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
            <Skeleton className="mt-2.5 h-3 w-32" />
          </div>
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {/* Trip list, grouped */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            <div className="flex flex-col gap-3">
              <GroupHeadingSkeleton />
              <TripCardSkeleton />
            </div>
            <div className="flex flex-col gap-3">
              <GroupHeadingSkeleton />
              <TripCardSkeleton past />
              <TripCardSkeleton past />
            </div>
          </div>

          {/* Detail panel: desktop only on the first paint */}
          <div className="hidden lg:col-span-2 lg:block">
            <TripDetailSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
