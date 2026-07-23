import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for the coach Roster (Lane 1 · THE PRESSBOX,
 * team ink). Mirrors RosterFairway's real first viewport — the SectionMasthead
 * + roster/lineup toggle, the 4-up KPI scoreboard, the search/filter
 * PaperCard, the surface-tab + sort/export toolbar, and the ruled
 * `PlayerRowPlate` wall (spec: docs/baseball/design-system-living-annual.md §6
 * P1 #6 "The Roster Spread") — on the same `fairwayScope` canvas +
 * `max-w-[1400px]` shell as the page itself, so there is no legacy chrome
 * flash on navigation.
 */
export default function RosterLoading() {
  return (
    <div className={fairwayScope('min-h-full')} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading roster…</span>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {/* SectionMasthead — eyebrow + title + primary action + accent rule + view toggle */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36 rounded-fw-sm" />
          </div>
          <Skeleton className="h-[3px] w-16 rounded-full" />
          <div className="mt-1 flex gap-1.5">
            <Skeleton className="h-8 w-20 rounded-fw-sm" />
            <Skeleton className="h-8 w-20 rounded-fw-sm" />
          </div>
        </div>

        {/* KPI scoreboard — 4-up, each figure on a ruled baseline */}
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-14" />
              <Skeleton className="h-[1.5px] w-full" />
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <PaperCard className="mt-6 p-5">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full max-w-md rounded-fw-sm" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-40 rounded-fw-sm" />
              <Skeleton className="h-9 w-36 rounded-fw-sm" />
              <Skeleton className="h-9 w-40 rounded-fw-sm" />
            </div>
          </div>
        </PaperCard>

        {/* Surface tabs + sort / export toolbar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-fw-sm" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-36 rounded-fw-sm" />
            <Skeleton className="h-9 w-20 rounded-fw-sm" />
            <Skeleton className="h-9 w-24 rounded-fw-sm" />
          </div>
        </div>

        {/* Ruled row plates — the record-book roster wall */}
        <div className="mt-6">
          {/* Below md (Rule 8): full-width stacked rows — name plate + two
              stat pills + a row-menu affordance, no horizontal scroll —
              mirrors RosterWall's real mobile branch (RosterFairway.tsx
              `flex flex-col md:hidden`), never the desktop 5-column table
              shape that used to render here on a phone. */}
          <div className="flex flex-col md:hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 px-1 py-3">
                    <Skeleton className="h-4 w-6 shrink-0" />
                    <Skeleton className="h-[17px] min-w-0 flex-1 max-w-[160px]" />
                    <div className="ml-auto flex shrink-0 gap-2">
                      <Skeleton className="h-6 w-10" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  </div>
                  <Skeleton className="h-[1.5px] w-full" />
                </div>
                <Skeleton className="h-11 w-11 shrink-0 rounded-fw-sm" />
              </div>
            ))}
          </div>

          {/* md+: the full five-column record book, unchanged. */}
          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[680px]">
              {/* Column-label header, aligned to the row stat columns */}
              <div className="flex items-end px-1 pb-2">
                <Skeleton className="h-3 w-12" />
                <div className="ml-auto flex gap-x-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 w-20 shrink-0" />
                  ))}
                </div>
              </div>

              {/* Rows, each resting on its own hairline rule */}
              <div className="flex flex-col">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3 px-1 py-3">
                      <Skeleton className="h-[17px] min-w-0 flex-1 max-w-[220px]" />
                      <div className="flex gap-x-6">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Skeleton key={j} className="h-6 w-20 shrink-0" />
                        ))}
                      </div>
                    </div>
                    <Skeleton className="h-[1.5px] w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
