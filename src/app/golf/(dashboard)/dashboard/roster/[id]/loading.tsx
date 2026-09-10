import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/roster/[id].
 *
 * Shape-matches FairwayPlayerProfile (facelift): a quiet "Roster" back link,
 * an UNBOXED masthead (avatar + name/badges + verdict line + action row —
 * no hero Surface, no "member since" line), a StatMatrix placeholder row, a
 * bordered Standing Surface, the two-up focus-areas/recent-rounds Surfaces,
 * and — since the page defaults its Game/Genome/Rounds tab row to "Rounds"
 * and mounts the SAME `<StatsSpineStage>` the player sees at
 * /dashboard/stats — the identical `300px 1fr` Spine & Stage skeleton
 * stats/loading.tsx already reproduces, so the swap-in never pops or
 * reshapes.
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

        <div className="flex flex-col gap-6">
          {/* Masthead — unboxed, no card */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Skeleton className="h-14 w-14 flex-shrink-0 rounded-fw-md" />
              <div className="min-w-0">
                <Skeleton className="h-9 w-56 max-w-full" />
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2 self-start">
              <Skeleton className="h-8 w-24 rounded-fw-md" />
              <Skeleton className="h-8 w-8 rounded-fw-md" />
            </div>
          </div>

          {/* StatMatrix — one matte row, 5 cells */}
          <Skeleton className="h-20 w-full rounded-fw-md" />

          {/* Standing — bordered Surface, bare StandingBars */}
          <Surface elevation="border" padding="md" className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-full rounded-fw-sm" />
          </Surface>

          {/* Focus areas + recent rounds — seam rows inside Surfaces */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-24 w-full rounded-fw-md" />
            </Surface>
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-24 w-full rounded-fw-md" />
            </Surface>
          </div>

          {/* Tabs (Game / Genome / Rounds) + the default Rounds destination —
              StatsSpineStage's own 300px spine + 1fr stage shape. */}
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-xs rounded-fw-md" />
            <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start">
              <Skeleton className="h-[480px] rounded-fw-lg min-[940px]:sticky min-[940px]:top-20" />
              <Skeleton className="h-[480px] rounded-fw-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
