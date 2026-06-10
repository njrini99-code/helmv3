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
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';

import { applyGenderAnchor } from './gender-anchor';
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
 *
 * Gender-aware (audit P1): the DB pga_value is the men's Tour value for EVERY
 * row. Before returning we resolve the player's cohort (loadPlayerCohort — the
 * same path the generators use) and apply {@link applyGenderAnchor}, so a
 * women's-team player's reference becomes the women's anchor (sand-save 38%,
 * not 50%) and the StandingBar agrees with the prose. Men's / unknown cohorts
 * are returned UNCHANGED.
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
  const standing = toStanding(data);
  if (!standing) return null;
  const cohort = await loadPlayerCohort(playerId);
  return applyGenderAnchor(standing, cohort.gender);
}

/**
 * Load all standing rows for a single player. Returns a Map keyed by
 * metric_id. Useful for dashboard hero / per-player tile rendering.
 *
 * Gender-aware (audit P1): the player's cohort is resolved ONCE and
 * {@link applyGenderAnchor} is applied to every row, so a women's-team
 * player's standing tiles render women's anchors (and omit the marker on
 * metrics with no credible women's baseline). Men's / unknown cohorts are
 * returned UNCHANGED.
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
  const cohort = await loadPlayerCohort(playerId);
  const map = new Map<MetricId, PlayerStanding>();
  for (const row of data ?? []) {
    const s = toStanding(row);
    if (s) map.set(s.metric_id, applyGenderAnchor(s, cohort.gender));
  }
  return map;
}
