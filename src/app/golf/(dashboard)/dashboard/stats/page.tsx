import { permanentRedirect } from 'next/navigation';
import { FairwayPlayerStats } from '@/components/fairway/pages/coachhelm/FairwayPlayerStats';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { mapLegacyStatsTab } from '@/components/fairway/modules';
import { FeatureUnavailable } from '@/components/fairway';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import type { Metadata } from 'next';
import {
  getPlayerStatsDashboardCritical,
  getPlayerStatsDashboardDeferred,
} from '@/app/golf/actions/stats-dashboard';
import { getPlayerDisplayName, getPlayerRoundOptions } from '@/app/golf/actions/stats-data';
import type { StatsSpineStageInitialData } from '@/components/golf/stats/spine-stage/StatsSpineStage';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'View your golf performance statistics, strokes gained analysis, and scoring trends.',
};

// Stats are user-specific and should reflect the latest completed rounds immediately.
export const dynamic = 'force-dynamic';

/**
 * Golf Stats Page
 *
 * Performance optimizations:
 * 1. Initial load fetches only summary stats (fast - no shot data)
 * 2. Detailed shot-level stats are lazy loaded when user clicks a tab
 * 3. Stats are cached to prevent re-fetching
 * 4. Round selection reuses cached data when available
 *
 * This results in 3-5x faster initial page load for players with many rounds.
 */

interface GolfStatsPageProps {
  searchParams: Promise<{ player?: string; tab?: string }>;
}

export default async function GolfStatsPage({ searchParams }: GolfStatsPageProps) {
  const params = await searchParams;
  const playerId = params.player ?? null;

  // Legacy `?tab=` (the old FairwayStatsCockpit tab strip) → the Spine &
  // Stage `?area=` param, permanently redirected so old bookmarks/links keep
  // working. An unrecognized tab value is stripped rather than 404ing.
  if (params.tab !== undefined) {
    const area = mapLegacyStatsTab(params.tab);
    const next = new URLSearchParams();
    if (playerId) next.set('player', playerId);
    if (area) next.set('area', area);
    const qs = next.toString();
    permanentRedirect(`/golf/dashboard/stats${qs ? `?${qs}` : ''}`);
  }

  // The data-rich Fairway player stats surface (single-player view). It
  // resolves the same player id the route resolves — `?player=` for a coach
  // viewing a teammate, else the logged-in player via useGolfUser() — and
  // renders in its own `.fairway-ds` scope on bg-canvas.

  // A coach has no personal player stats. Hitting /stats with no `?player=`
  // would dead-end on the "no player selected" empty state, so point coaches
  // at the team-stats roster (their natural landing). A coach viewing a
  // specific teammate (`?player=`) still falls through to the single-player
  // surface.
  //
  // This branch renders IN PLACE rather than `redirect()`-ing. Calling
  // `redirect()` from a conditional branch of an RSC page is what produced the
  // React #310 hook-count crashes on this route: on a client-side soft
  // navigation the router unwinds a partially-rendered tree, and the bare
  // redirect shims (/hub, /my-standing, /my-development, /my-insights,
  // /players/[playerId]) stopped crashing the moment next.config.mjs
  // `redirects()` began intercepting them before render. Conditional redirects
  // can't move into next.config — they depend on the session — so they move to
  // the in-place interstitial that /whats-new already uses.
  // React.cache()-backed — the dashboard layout already resolved it.
  const session = await getGolfSessionProfile();
  if (!playerId) {
    if (session?.coach && !session.player) {
      return (
        <FeatureUnavailable
          title={surfaceName('stats')}
          message="Personal stats belong to a player profile. As a coach, open Team Stats to see every player's numbers."
          actionHref={surfaceHref('stats-team')}
          actionLabel={surfaceName('stats-team')}
        />
      );
    }
  }

  // Initial load on the SERVER (perf, 2026-09-23). The stats surface used to
  // hydrate empty and then POST three server actions (bundle, round list,
  // coach's viewed-player name). Next.js runs a client's actions one at a
  // time, behind the shell's own, so first content waited on that queue. The
  // same three reads now run here in parallel and stream in under
  // stats/loading.tsx; the client only fetches for scope changes/retries.
  //
  // Same player the client would resolve: `?player=` for a coach viewing a
  // teammate, else the signed-in player. Each read authorizes itself
  // (verifyPlayerAccess inside the actions) exactly as the client call did.
  const targetPlayerId = playerId ?? session?.player?.id ?? null;
  let initialStats: StatsSpineStageInitialData | null = null;
  let initialPlayerName: string | null | undefined;
  if (targetPlayerId) {
    // PERF-R10: the first paint waits only for the critical half (spine and
    // bento). The deferred half (leak maps, spray, strengths, worst holes,
    // patterns) starts now and streams to the client as a promise; a failed
    // read resolves to null and the client fetches the whole bundle itself.
    const deferred = getPlayerStatsDashboardDeferred(targetPlayerId, 'overall').catch(() => null);
    const [bundle, roundOptions, name] = await Promise.all([
      getPlayerStatsDashboardCritical(targetPlayerId, 'overall').catch(() => null),
      getPlayerRoundOptions(targetPlayerId).catch(() => null),
      // Only the coach view titles the page with the viewed player's name.
      playerId ? getPlayerDisplayName(targetPlayerId).catch(() => null) : Promise.resolve(undefined),
    ]);
    // A thrown bundle read leaves `initialStats` null → the client fetches
    // and owns the error state, as before.
    if (bundle) initialStats = { playerId: targetPlayerId, bundle, roundOptions, deferred };
    initialPlayerName = name;
  }

  return (
    <div className="min-h-full bg-canvas">
      <FairwayPlayerStats
        initialPlayerId={playerId}
        initialStats={initialStats}
        initialPlayerName={initialPlayerName}
      />
    </div>
  );
}
