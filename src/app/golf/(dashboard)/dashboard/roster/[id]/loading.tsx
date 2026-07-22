import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/roster/[id].
 *
 * Shape-matches FairwayPlayerProfile: a quiet "Roster" back link, the
 * Surface-wrapped identity header (avatar + name/badges + location + contact
 * actions), the 3-up cross-surface nav row (Scouting Report / Game
 * Fingerprint / Genome), and — since this page mounts the SAME
 * `<StatsSpineStage>` the player sees at /dashboard/stats — the identical
 * `300px 1fr` Spine & Stage skeleton stats/loading.tsx already reproduces
 * (StatsSpineStage renders this same fallback shape client-side too — see
 * that file's header comment), so the swap-in never pops or reshapes.
 */
export default function PlayerProfileLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading player profile…</span>

        {/* Back to roster */}
        <Skeleton className="mb-5 h-8 w-20" />

        {/* Identity header */}
        <div className="mb-8 flex flex-col gap-5 rounded-card border border-border-subtle bg-surface p-8 sm:flex-row sm:items-start">
          <Skeleton className="h-20 w-20 flex-shrink-0 rounded-2xl sm:h-24 sm:w-24" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Skeleton className="h-9 w-56 max-w-full" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-2 h-3.5 w-32" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-fw-md" />
                <Skeleton className="h-8 w-8 rounded-fw-md" />
                <Skeleton className="h-8 w-24 rounded-fw-md" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3 w-40" />
          </div>
        </div>

        {/* Cross-surface links */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3"
            >
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </div>
            </div>
          ))}
        </div>

        {/* StatsSpineStage — 300px spine + 1fr stage, same shape as
            /dashboard/stats/loading.tsx's Spine & Stage block. */}
        <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start">
          <Skeleton className="h-[480px] rounded-fw-lg min-[940px]:sticky min-[940px]:top-20" />
          <Skeleton className="h-[480px] rounded-fw-lg" />
        </div>
      </div>
    </div>
  );
}
