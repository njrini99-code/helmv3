'use server';

import {
  getDetailedStats,
  getPlayerStrengthsWeaknesses,
  getSprayChartData,
  getTrendAnalysis,
  getWorstHoleAnalysis,
} from './stats-data';
import { getPlayerLeakMaps, getPlayerStandingRows } from './stats-leak-maps';
import { getPlayerPatterns } from './insights';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { runWithStatsActionContext } from '@/lib/golf/stats-action-context';
import { createClient } from '@/lib/supabase/server';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import type { StatsRoundScope } from './stats-data-types';

type SettledValue<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'failed' | 'timeout' | 'deferred' };

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<SettledValue<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<SettledValue<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
  });
  const settled: Promise<SettledValue<T>> = promise.then(
    (value): SettledValue<T> => ({ ok: true, value }),
    (): SettledValue<T> => ({ ok: false, reason: 'failed' }),
  );
  const result = await Promise.race([settled, timed]);
  if (timeout) clearTimeout(timeout);
  return result;
}

function failedStatsBundle() {
  const failed = (): SettledValue<never> => ({ ok: false, reason: 'failed' });
  return {
    detailed: failed(),
    trend: failed(),
    standing: failed(),
    leak: failed(),
    spray: failed(),
    strengthsWeaknesses: failed(),
    worstHoles: failed(),
    patterns: failed(),
  };
}

/**
 * One browser round-trip for the complete player Stats surface. Individual
 * enrichments are bounded and settle independently, so a slow leak map or
 * CoachHelm pattern read cannot leave the entire page on a blank skeleton.
 */
/**
 * `roundId` scopes the two panels that can honestly be read for a single round
 * — the detailed ~75-stat block and the spray chart. Everything else in the
 * bundle is cross-round BY CONSTRUCTION (trend compares 30-day windows,
 * standing ranks against the team, leak maps and strengths/weaknesses need a
 * sample, worst-holes aggregates repeat play) and stays on the career view.
 * Scoping those to one round would not be a narrower answer, it would be a
 * meaningless one, so they are deliberately left alone rather than threaded.
 */
type StatsBundlePart = 'all' | 'critical' | 'deferred';

/** A part the server has not read yet: it is coming, not failed (PERF-R10). */
const DEFERRED = { ok: false, reason: 'deferred' } as const;

async function getPlayerStatsDashboardBundleImpl(
  playerId: string,
  roundId?: StatsRoundScope,
  part: StatsBundlePart = 'all',
) {
  const supabase = await createClient();
  // The dashboard is latency-sensitive and already bounds each downstream
  // enrichment. Make exactly one remote Auth attempt here; the resilient
  // helper may still use the local verified-looking session cookie when GoTrue
  // is transiently unavailable, but it will not add a second network retry.
  const { user } = await getUserResilient(supabase, { retryTransient: false });
  if (!user) return failedStatsBundle();

  const authorization = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!authorization.allowed) return failedStatsBundle();

  return runWithStatsActionContext(
    {
      supabase,
      user,
      requestedPlayerId: playerId,
      authorization: { ...authorization, allowed: true },
    },
    async () => {
      // PERF-R10: the critical part (the spine and bento: detailed stats,
      // trend, standing) and the deferred part (leak maps, spray, strengths,
      // worst holes, patterns) can be read separately, so the first paint
      // waits for the slowest of three reads instead of eight.
      const critical = part !== 'deferred';
      const deferred = part !== 'critical';
      const [detailed, trend, standing, leak, spray, strengthsWeaknesses, worstHoles, patterns] =
        await Promise.all([
          critical ? settleWithin(getDetailedStats(playerId, roundId ?? 'overall'), 15_000) : DEFERRED,
          critical ? settleWithin(getTrendAnalysis(playerId), 12_000) : DEFERRED,
          critical ? settleWithin(getPlayerStandingRows(playerId), 12_000) : DEFERRED,
          deferred ? settleWithin(getPlayerLeakMaps(playerId), 10_000) : DEFERRED,
          deferred ? settleWithin(getSprayChartData(playerId, roundId ?? 'overall'), 10_000) : DEFERRED,
          deferred ? settleWithin(getPlayerStrengthsWeaknesses(playerId), 10_000) : DEFERRED,
          deferred ? settleWithin(getWorstHoleAnalysis(playerId), 10_000) : DEFERRED,
          deferred ? settleWithin(getPlayerPatterns(playerId), 10_000) : DEFERRED,
        ]);

      return { detailed, trend, standing, leak, spray, strengthsWeaknesses, worstHoles, patterns };
    },
  );
}

const observedGetPlayerStatsDashboardBundle = withAdminObserved(
  'getPlayerStatsDashboardBundle',
  {
    sport: 'golf',
    feature: 'stats_analytics',
    contextFrom: ([playerId]) => ({ playerId }),
  },
  getPlayerStatsDashboardBundleImpl,
);

export async function getPlayerStatsDashboardBundle(
  playerId: string,
  roundId?: StatsRoundScope,
) {
  return observedGetPlayerStatsDashboardBundle(playerId, roundId);
}

/**
 * The server-rendered first paint's two halves (PERF-R10). The Stats page
 * awaits the critical half and streams the deferred half to the client as a
 * promise; the parts the other half owns come back as `reason: 'deferred'`.
 */
const observedGetPlayerStatsDashboardCritical = withAdminObserved(
  'getPlayerStatsDashboardCritical',
  { sport: 'golf', feature: 'stats_analytics', contextFrom: ([playerId]) => ({ playerId }) },
  (playerId: string, roundId?: StatsRoundScope) => getPlayerStatsDashboardBundleImpl(playerId, roundId, 'critical'),
);

const observedGetPlayerStatsDashboardDeferred = withAdminObserved(
  'getPlayerStatsDashboardDeferred',
  { sport: 'golf', feature: 'stats_analytics', contextFrom: ([playerId]) => ({ playerId }) },
  (playerId: string, roundId?: StatsRoundScope) => getPlayerStatsDashboardBundleImpl(playerId, roundId, 'deferred'),
);

export async function getPlayerStatsDashboardCritical(playerId: string, roundId?: StatsRoundScope) {
  return observedGetPlayerStatsDashboardCritical(playerId, roundId);
}

export async function getPlayerStatsDashboardDeferred(playerId: string, roundId?: StatsRoundScope) {
  return observedGetPlayerStatsDashboardDeferred(playerId, roundId);
}
