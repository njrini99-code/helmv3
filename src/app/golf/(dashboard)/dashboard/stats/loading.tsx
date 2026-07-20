import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/** The player-role CoachHelmSubNav collapsed to its single "Overview" front-door
 *  tab (Spine & Stage folded Development/Game Profile/Standing into `?view=`
 *  stage drills — see CoachHelmSubNav.tsx PLAYER_TABS) — width-approximated so
 *  the strip's footprint matches the real component before hydration. */
const SUBNAV_TAB_WIDTH = 84;

/**
 * Route Suspense fallback for /golf/dashboard/stats.
 *
 * The fallback mirrors the live surface (FairwayPlayerStats → CoachHelmShell →
 * StatsSpineStage), so the skeleton matches the real content's tokens, width,
 * and shape — no two-stage flash, no layout shift. `FairwayPlayerStats` itself
 * wraps `CoachHelmShell` in its OWN `mx-auto max-w-[1200px] px-4 py-2 md:px-6`
 * box, and `CoachHelmShell` nests a SECOND pair of `mx-auto max-w-[1200px]`
 * containers inside that (masthead+subnav at `px-4 pt-2 md:px-6`, body at
 * `px-4 py-6 md:px-6`) — this fallback reproduces that exact two-level chain
 * (not a single flattened container), the persistent (now single-tab)
 * CoachHelmSubNav strip so it doesn't pop in once FairwayPlayerStats
 * hydrates, and the Spine & Stage `300px 1fr` two-block skeleton
 * StatsSpineStage renders for its own client-side loading state (see
 * StatsSpineStage.tsx ~L210-217) so the route fallback and the in-component
 * fallback are visually identical.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
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

            {/* CoachHelmSubNav strip — single "Overview" front-door tab. */}
            <nav
              aria-hidden="true"
              className="flex w-full items-center gap-1 border-b border-border-subtle"
            >
              <div className="px-3.5 pb-3 pt-2.5">
                <Skeleton className="h-4" style={{ width: SUBNAV_TAB_WIDTH }} />
              </div>
            </nav>
          </div>

          {/* CoachHelmShell's body container — its own nested
              mx-auto max-w-[1200px], px-4 py-6 md:px-6. Spine & Stage —
              300px spine + 1fr stage, stacking below 940px (matches
              StatsSpineStage's own loading branch exactly). */}
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
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
