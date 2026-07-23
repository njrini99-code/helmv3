import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/recover.
 *
 * Shape-matches FairwayRecoverRound: a `max-w-lg` ViewHeader masthead, then a
 * stack of recoverable-round Surface cards (course/type header, a 3-col
 * holes/score/date readout row, a saved-at caption, and a full-width CTA) —
 * the common non-empty case (the empty state is a single centered card, which
 * this list-shaped skeleton still reads correctly into).
 */
export default function RecoverRoundLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-lg px-4 py-6 pb-24 md:py-8"
      >
        <span className="sr-only">Loading recoverable rounds…</span>

        {/* ViewHeader */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
                {['Holes', 'Score', 'Round date'].map((label) => (
                  <div key={label} className="flex flex-col gap-1.5">
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-6 w-10" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-11 w-full rounded-fw-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
