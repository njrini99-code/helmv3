import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  StatsScopeRowSkeleton,
  StatsSpineStageBodySkeleton,
} from '@/components/golf/stats/spine-stage/StatsSpineStageSkeleton';

/** The player-role CoachHelmSubNav collapsed to its single "Overview" front-door
 *  tab (Spine & Stage folded Development/Game Profile/Standing into `?view=`
 *  stage drills — see CoachHelmSubNav.tsx PLAYER_TABS) — width-approximated so
 *  the strip's footprint matches the real component before hydration. */

/**
 * Route Suspense fallback for /golf/dashboard/stats.
 *
 * The fallback mirrors the live surface (FairwayPlayerStats → CoachHelmShell →
 * StatsSpineStage), so the skeleton matches the real content's tokens, width,
 * and shape. CoachHelmShell owns the one centered container and its gutters;
 * the outer wrapper adds only vertical spacing. Keep the persistent subnav
 * footprint stable until FairwayPlayerStats
 * hydrates, and the Spine & Stage `300px 1fr` two-block skeleton
 * StatsSpineStage renders for its own client-side loading state (see
 * StatsSpineStage.tsx, the `if (loading)` branch) so the route fallback and
 * the in-component fallback are visually identical.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="w-full py-2">
        <div
          className="flex w-full flex-col"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading stats…</span>
          {/* CoachHelmShell's masthead+subnav container — its own nested
              mx-auto max-w-[1200px], gap-5, px-4 pt-2 md:px-6 (no py). */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16 rounded-fw-sm" />
              <Skeleton className="h-8 w-56 rounded-fw-sm" />
              <Skeleton className="h-4 w-80 max-w-full rounded-fw-sm" />
            </div>

            {/* No sub-nav strip: the player's CoachHelm has one view (DASH-06). */}
          </div>

          {/* CoachHelmShell's body container — its own nested
              mx-auto max-w-[1200px], px-4 py-6 md:px-6. DASH-08: the scope
              row, spine and bento are drawn in their real geometry by the
              SAME skeleton StatsSpineStage uses for its own first load, so
              nothing reflows when data lands. */}
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
            <div className="flex flex-col gap-4">
              <StatsScopeRowSkeleton />
              <StatsSpineStageBodySkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
