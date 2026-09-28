import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/[id].
 *
 * Shape-matches FairwayQualifierDetail's first paint: the back link, the
 * ViewHeader silhouette (title, status/date/entrant meta, primary action),
 * then from `xl` the main column beside the right rail. The same DOM order as
 * the page (status card, board, details card) and the same grid placement.
 *
 * The board stops at FairwayQualifierLeaderboard's OWN loading branch (a plain
 * 3-line stack), not its settled standings table: `useQualifierRealtime`
 * starts `loading`, so that branch is what mounts when this boundary
 * resolves. Shape-matching the table here would itself be the CLS this file
 * exists to prevent. The rail's cards are drawn at their loading shape too
 * (headline, round bars, the details rows, the rounds-played skeleton).
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10"
      >
        <span className="sr-only">Loading qualifier…</span>

        {/* Quiet back link */}
        <Skeleton className="mb-5 h-4 w-28" />

        {/* Masthead — ViewHeader silhouette */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-64 max-w-full" />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>

        {/* Same DOM order and grid placement as the page: status, the main
            column, details; the rail from xl by placement, never `order`. */}
        <div className="mt-6 flex flex-col gap-6 lg:mt-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,22rem)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-8 xl:gap-y-6">
          {/* Status card */}
          <Surface aria-hidden="true" padding="none" className="px-5 pb-5 pt-4 xl:col-start-2 xl:row-start-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-40" />
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-2 flex-1 rounded-full" />
              ))}
            </div>
            <Skeleton className="mt-5 h-6 w-36" />
          </Surface>

          <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:gap-8">
            {/* The board — its own loading branch: the title row, then the
                3-line stack (FairwayQualifierLeaderboard's padding) */}
            <Surface aria-hidden="true" padding="none">
              <div className="px-4 pb-3 pt-4 md:px-6">
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="space-y-3 px-4 pb-5 md:px-6">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            </Surface>
          </div>

          {/* Details card */}
          <Surface aria-hidden="true" padding="none" className="overflow-hidden xl:col-start-2 xl:row-start-2">
            <div className="border-b border-border-strong bg-surface-sunken px-5 py-3">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="divide-y divide-border-subtle px-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-3 border-t border-border-subtle px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
