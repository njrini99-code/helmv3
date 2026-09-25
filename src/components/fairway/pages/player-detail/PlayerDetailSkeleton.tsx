/**
 * Skeletons for the player detail page. `PlayerDetailBodySkeleton` is the
 * Suspense fallback while the server batch streams; `PlayerDetailSkeleton`
 * is the whole-route fallback (loading.tsx) and adds the masthead. Both match
 * the real first paint: masthead, verdict, stage, ledger, entry rows.
 */

import { Skeleton } from '@/components/fairway/feedback/Skeleton';

export function PlayerDetailBodySkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mt-5 h-5 w-full max-w-[520px]" />
      <Skeleton className="mt-2 h-5 w-2/3 max-w-[360px]" />
      <div className="mt-8 md:grid md:grid-cols-12 md:gap-x-10">
        <Skeleton className="h-[300px] rounded-card md:col-span-7" />
        <div className="mt-10 md:col-span-5 md:mt-0">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`ledger-${i}`} className="mt-2 flex min-h-11 items-center justify-between border-t border-border-subtle py-2.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 md:w-7/12">
        <Skeleton className="h-6 w-28" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={`entry-${i}`} className="mt-2 flex min-h-[72px] items-center justify-between gap-3 border-t border-border-subtle">
            <div className="flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3.5 w-56 max-w-full" />
            </div>
            <Skeleton className="h-11 w-[104px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerDetailSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-2 md:px-8 md:pt-6"
    >
      <span className="sr-only">Loading player</span>
      <Skeleton className="h-11 w-24" />
      <div className="mt-2 flex items-start justify-between gap-3">
        <Skeleton className="h-16 w-16 rounded-full md:h-20 md:w-20" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-11 w-[116px] rounded-full" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      </div>
      <Skeleton className="mt-4 h-9 w-56 max-w-full md:h-11" />
      <Skeleton className="mt-2 h-5 w-32" />
      <Skeleton className="mt-1 h-5 w-52" />
      <PlayerDetailBodySkeleton />
    </div>
  );
}
