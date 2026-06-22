import { RoundsListSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Rounds library must match the LIVE
 * Fairway layout: a max-w-[1200px] shell with a 5-tile KPI hero (grid-cols-2 →
 * md:grid-cols-5) on bg-surface, then month-ledger Surfaces. The legacy
 * RoundsListSkeleton (max-w-5xl, no KPI strip) only matches the flag-off page,
 * so it stays behind the flag. isRedesignEnabled() is build-time-inlined and is
 * safe to read in a loading boundary.
 */
function FairwayRoundsLibraryLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading rounds…</span>

        {/* Title block */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>

        {/* KPI hero — 5 lifted tiles (matches FairwayRoundsLibrary) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4 shadow-flat"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>

        {/* Month-ledger Surfaces */}
        {[5, 3].map((rows, gi) => (
          <Surface key={gi} padding="none" className="overflow-hidden">
            <div className="flex items-end justify-between gap-4 border-b border-border-subtle px-4 py-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="divide-y divide-border-subtle">
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <Skeleton className="h-9 w-12" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-7 w-12" />
                </div>
              ))}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayRoundsLibraryLoading />;
  return <RoundsListSkeleton />;
}
