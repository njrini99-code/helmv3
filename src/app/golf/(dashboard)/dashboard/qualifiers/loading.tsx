import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';
import { cn } from '@/lib/utils';

/**
 * P324 — the Suspense fallback for the Qualifiers library matches the live
 * FairwayQualifiers first paint, in the page's order: the ViewHeader
 * (eyebrow, title, description, counts, and the coach's "Create qualifier"
 * Button — rounded-full, min-h-[44px]), the toolbar (three status FilterPills,
 * then the SearchField track — rounded-fw-sm, h-11), the hero, then a titled
 * two-up card grid.
 *
 * The hero mirrors QualifierHero: a shadow Surface whose text column (status
 * pill, title, description, facts over a hairline) sits beside a sunken well
 * from xl and above it below xl, with the action at the foot. The well holds
 * what the hero's own first paint shows before its live feed answers: the
 * progress line, the round bars, the scorecards line, and three board rows.
 * The cards mirror QualifierCard: title and pill, two description lines,
 * facts over a hairline, and the sunken action footer.
 */
function HeroSkeleton() {
  return (
    <Surface elevation="shadow" padding="none" className="overflow-hidden">
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-rows-[1fr_auto] xl:gap-x-10 xl:p-8">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="mt-3 h-8 w-64 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-[36rem]" />
          <Skeleton className="mt-2 h-4 w-2/3 max-w-[24rem]" />
          <FactsSkeleton className="mt-5" />
        </div>

        <div className="min-w-0 rounded-fw-md bg-surface-sunken p-4 sm:p-5 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-x-8 xl:flex">
            <div className="min-w-0">
              <Skeleton className="h-6 w-44" />
              <div className="mt-3 flex gap-1.5">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="min-w-0 flex-1">
                    <div className="h-2 rounded-full bg-surface [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]" />
                    <Skeleton className="mt-1.5 h-3 w-5" />
                  </div>
                ))}
              </div>
              <Skeleton className="mt-3 h-5 w-40" />
            </div>
            <div className="min-w-0 border-t border-border-subtle pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0 xl:border-l-0 xl:border-t xl:pl-0 xl:pt-4">
              <Skeleton className="h-5 w-32" />
              <div className="mt-3 flex flex-col gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-5" />
                    <Skeleton circle className="h-8 w-8" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-8" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-start-1 xl:row-start-2 xl:self-end">
          <Skeleton className="h-11 w-full rounded-full sm:w-44" />
        </div>
      </div>
    </Surface>
  );
}

function FactsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-6 gap-y-3 border-t border-border-subtle pt-4', className)}>
      {[20, 10, 8, 28].map((w, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4" style={{ width: `${w * 4}px` }} />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Surface elevation="border" padding="none" className="flex flex-col overflow-hidden">
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <FactsSkeleton className="mt-4" />
      </div>
      <div className="border-t border-border-subtle bg-surface-sunken px-5 py-3">
        <Skeleton className="h-5 w-28" />
      </div>
    </Surface>
  );
}

function FairwayQualifiersLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading qualifiers…</span>

        {/* ViewHeader: eyebrow, title, description, counts + primary action */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-60" />
            <Skeleton className="h-5 w-80 max-w-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-11 w-44 rounded-full" />
        </div>

        {/* Toolbar: status FilterPills, then search */}
        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[18, 22, 28].map((w, i) => (
              <Skeleton
                key={i}
                className="h-9 rounded-full [@media(pointer:coarse)]:h-11"
                style={{ width: `${w * 4}px` }}
              />
            ))}
          </div>
          <div className="max-w-md">
            <Skeleton className="h-11 w-full" />
          </div>
        </div>

        {/* Hero, then a titled two-up card grid */}
        <div className="mt-8 flex flex-col gap-10">
          <HeroSkeleton />
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 px-1">
              <Skeleton className="h-5 w-24" />
              <span aria-hidden="true" className="h-px flex-1 bg-border-subtle" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayQualifiersLoading />;
}
