import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/qualifiers/[id].
 *
 * Shape-matches FairwayQualifierDetail's first paint: the back link, the
 * ViewHeader silhouette (title, status/date/entrant meta, primary action),
 * then from `lg` the main column beside the right rail. On a phone the same
 * order as the page: the status card, the board, the details card.
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

        <div className="mt-6 flex flex-col gap-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,22rem)] lg:items-start lg:gap-8">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8">
            {/* The board — its own loading branch */}
            <Surface aria-hidden="true" className="order-2 lg:order-none">
              <Surface.Header>
                <Skeleton className="h-5 w-28" />
              </Surface.Header>
              <Surface.Body>
                <div className="space-y-3">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/6" />
                </div>
              </Surface.Body>
            </Surface>
          </div>

          <div className="contents lg:flex lg:flex-col lg:gap-6">
            {/* Status card */}
            <Surface aria-hidden="true" padding="none" className="order-1 px-5 pb-5 pt-4 lg:order-none">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-40" />
              <div className="mt-3 flex gap-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-2 flex-1 rounded-full" />
                ))}
              </div>
              <Skeleton className="mt-5 h-6 w-36" />
            </Surface>

            {/* Details card */}
            <Surface aria-hidden="true" padding="none" className="order-3 overflow-hidden lg:order-none">
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
    </div>
  );
}
