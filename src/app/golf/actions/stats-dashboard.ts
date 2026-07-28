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

type SettledValue<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'failed' | 'timeout' };

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
async function getPlayerStatsDashboardBundleImpl(playerId: string) {
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
      const [detailed, trend, standing, leak, spray, strengthsWeaknesses, worstHoles, patterns] =
        await Promise.all([
          settleWithin(getDetailedStats(playerId, 'overall'), 15_000),
          settleWithin(getTrendAnalysis(playerId), 12_000),
          settleWithin(getPlayerStandingRows(playerId), 12_000),
          settleWithin(getPlayerLeakMaps(playerId), 10_000),
          settleWithin(getSprayChartData(playerId, 'overall'), 10_000),
          settleWithin(getPlayerStrengthsWeaknesses(playerId), 10_000),
          settleWithin(getWorstHoleAnalysis(playerId), 10_000),
          settleWithin(getPlayerPatterns(playerId), 10_000),
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

export async function getPlayerStatsDashboardBundle(playerId: string) {
  return observedGetPlayerStatsDashboardBundle(playerId);
}
