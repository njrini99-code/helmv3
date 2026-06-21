import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the player My Development view.
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless instead of flashing legacy chrome. Wrapped
 * in the same `fairwayScope('min-h-full bg-canvas')` frame + `max-w-[760px]` column
 * the page itself uses, and shape-matched to FairwayMyDevelopment's CoachHelmShell:
 * masthead (eyebrow / title / description) → the persistent sub-nav tab strip →
 * the Goals section block → the development-progress overview instrument → an
 * active focus-area card grid. Mirrors the my-standing/loading.tsx approach.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-2 md:px-6"
      >
        <span className="sr-only">Loading your development plans…</span>

        {/* Masthead — eyebrow / title / description (ViewHeader). */}
        <div className="flex flex-col gap-2 pt-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        {/* Persistent sub-nav strip — the player CoachHelmShell tab pills. */}
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        {/* Body — Goals section, then the focus-area list. */}
        <div className="mt-6 flex flex-col gap-10">
          {/* Goals — section label + a couple of goal cards. */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 px-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
            </div>
          </section>

          {/* Development progress overview instrument — a warm focal panel. */}
          <div className="rounded-card border border-border-subtle bg-surface p-6 md:p-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex flex-col gap-4">
                <div>
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
                <Skeleton className="h-16 w-full max-w-[18rem] rounded-fw-md" />
              </div>
              <div className="flex justify-center sm:justify-end">
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          </div>

          {/* Active focus areas — section heading + a card grid. */}
          <section className="flex flex-col gap-3">
            <Skeleton className="h-5 w-44" />
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
