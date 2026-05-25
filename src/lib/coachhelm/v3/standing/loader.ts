/**
 * v3 standing loader.
 *
 * Used by:
 *   - W14+ generator base class (`evidence.standing` injection)
 *   - W13 StandingBar component (via server-action wrapper)
 *   - W17 counterfactual
 *
 * Data is populated by /api/cron/v3/standing-refresh — see ./refresh.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';

import { isMetricId, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';

import type { PlayerStanding } from './types';

const SELECT_FIELDS =
  'player_id, metric_id, player_value, team_avg, team_n, team_pct, ' +
  'level_avg, level_n, level_pct, pga_value, pga_delta, computed_at';

interface RawRow {
  player_id: string;
  metric_id: string;
  player_value: number;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  level_avg: number | null;
  level_n: number;
  level_pct: number | null;
  pga_value: number;
  pga_delta: number | null;
  computed_at: string;
}

function toStanding(row: RawRow): PlayerStanding | null {
  if (!isMetricId(row.metric_id)) return null;
  return {
    ...row,
    metric_id: row.metric_id,
  };
}

/**
 * Load a single (player, metric) standing snapshot. Returns null when
 * the cron hasn't populated it yet (cold-start) or no PGA standard
 * exists for the metric.
 */
export async function loadStandingForMetric(
  playerId: string,
  metricId: MetricId,
): Promise<PlayerStanding | null> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_player_standing')
    .select(SELECT_FIELDS)
    .eq('player_id', playerId)
    .eq('metric_id', metricId)
    .maybeSingle() as {
    data: RawRow | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`loadStandingForMetric(${playerId}, ${metricId}): ${error.message}`);
  }
  if (!data) return null;
  return toStanding(data);
}

/**
 * Load all standing rows for a single player. Returns a Map keyed by
 * metric_id. Useful for dashboard hero / per-player tile rendering.
 */
export async function loadPlayerStandingMap(
  playerId: string,
): Promise<Map<MetricId, PlayerStanding>> {
  const supabase = createAdminClient();
  const { data, error } = await fromUntyped(supabase, 'golf_player_standing')
    .select(SELECT_FIELDS)
    .eq('player_id', playerId) as {
    data: RawRow[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`loadPlayerStandingMap(${playerId}): ${error.message}`);
  }
  const map = new Map<MetricId, PlayerStanding>();
  for (const row of data ?? []) {
    const s = toStanding(row);
    if (s) map.set(s.metric_id, s);
  }
  return map;
}
