import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Suspense fallback for /golf/dashboard/rounds/recover. Matches the LIVE
 * FairwayRecoverRound shape: a max-w-lg column with a ViewHeader-shaped
 * masthead (eyebrow + title + description) followed by a vertical stack of
 * recoverable-round Surface cards (course/type header, 3-up holes/score/date
 * strip, saved-at line, recover button) — never the legacy FormPageSkeleton's
 * bordered input-row card.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-lg px-4 py-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading recoverable rounds…</span>

        {/* Masthead (ViewHeader shape) */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Recoverable-round cards */}
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Surface key={i} elevation="shadow" padding="md" className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="flex flex-col gap-1.5">
                    <Skeleton className="h-2.5 w-14" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-10 w-full rounded-fw-md" />
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
