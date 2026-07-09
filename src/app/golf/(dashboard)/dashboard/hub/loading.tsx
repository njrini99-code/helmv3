import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Fairway-native loading state for the player Hub — reserves the masthead,
 * tab strip, and trip/task card slots in Fairway tokens so the real
 * FairwayPlayerHubWrapper paints into the same shape (no layout swap / CLS
 * on hydrate).
 */
export default function HubLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto max-w-[720px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading hub…</span>

        {/* Masthead skeleton */}
        <div>
          <Skeleton className="h-7 w-52" />
          <Skeleton className="mt-2 h-4 w-36" />
        </div>

        {/* Tab bar skeleton */}
        <div className="mt-5 flex items-center gap-4 border-b border-border-subtle pb-3">
          {[64, 64, 64, 64].map((w, i) => (
            <Skeleton key={i} className="h-5" style={{ width: w }} />
          ))}
        </div>

        <div className="mt-6 space-y-8">
          {/* Trip card skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 2 }).map((_, i) => (
              <Surface key={i} elevation="border" padding="md" className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-fw-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </Surface>
            ))}
          </div>

          {/* Task card skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Surface key={i} elevation="border" padding="md" className="flex items-start gap-4">
                <Skeleton circle className="h-7 w-7" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
