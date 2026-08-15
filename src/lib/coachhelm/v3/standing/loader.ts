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
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

import { isMetricId, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';

import { applyGenderAnchor, type LpgaStandards } from './gender-anchor';
import { loadStandardsForTour } from './pga-standards';
import type { PlayerStanding } from './types';

/**
 * Load the real LPGA rows, but only for a women's-cohort read.
 *
 * Men's and unknown cohorts never reach golf_pga_standards from here — their
 * anchor is the DB pga_value already on the standing row, unchanged. So this
 * adds exactly one reference-table read to a women's-team page load and zero
 * to a men's.
 */
async function loadLpgaIfWomens(
  gender: Awaited<ReturnType<typeof loadPlayerCohort>>['gender'],
): Promise<LpgaStandards | null> {
  if (gender !== 'womens') return null;
  return loadStandardsForTour('lpga');
}

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
  const lpga = await loadLpgaIfWomens(cohort.gender);
  return applyGenderAnchor(standing, cohort.gender, lpga);
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
  const lpga = await loadLpgaIfWomens(cohort.gender);
  const map = new Map<MetricId, PlayerStanding>();
  for (const row of data ?? []) {
    const s = toStanding(row);
    if (s) map.set(s.metric_id, applyGenderAnchor(s, cohort.gender, lpga));
  }
  return map;
}

// Chunk player ids per `.in(...)` to keep the request URL well under the
// PostgREST / proxy ~414 length limit (a full roster's UUID list is otherwise
// one long querystring filter).
const STANDING_PLAYER_BATCH = 300;

/**
 * Batched variant of {@link loadPlayerStandingMap} for multi-player surfaces
 * (e.g. the coach Team Stats page) — resolves the per-player standing map for
 * EVERY given player in a single chunked `.in('player_id', ...)` read instead
 * of N admin queries (one per player).
 *
 * Returns a Map keyed by player_id; each value is that player's
 * `Map<MetricId, PlayerStanding>` (identical shape to loadPlayerStandingMap).
 * Players with no standing rows yet (cold-start) get an empty inner map, so
 * callers can rely on `.get(id)` returning a Map for every requested id.
 *
 * Gender-aware (audit P1): each DISTINCT player's cohort is resolved ONCE and
 * {@link applyGenderAnchor} applied to every one of that player's rows — the
 * same per-player resolution loadPlayerStandingMap performs.
 */
export async function loadPlayersStandingMap(
  playerIds: string[],
): Promise<Map<string, Map<MetricId, PlayerStanding>>> {
  const result = new Map<string, Map<MetricId, PlayerStanding>>();
  // Seed an empty inner map for every requested player so cold-start players
  // (no standing rows) still resolve to a Map, never undefined.
  for (const id of playerIds) result.set(id, new Map());
  if (playerIds.length === 0) return result;

  const supabase = createAdminClient();
  const rows: RawRow[] = [];
  for (let i = 0; i < playerIds.length; i += STANDING_PLAYER_BATCH) {
    const batch = playerIds.slice(i, i + STANDING_PLAYER_BATCH);
    // Paginate each batch past the 1000-row cap (a 300-player batch can exceed
    // 1000 standing rows) with a stable order on the table's natural key.
    const batchRows = await fetchAllRows<RawRow>((from, to) =>
      fromUntyped(supabase, 'golf_player_standing')
        .select(SELECT_FIELDS)
        .in('player_id', batch)
        .order('player_id', { ascending: true })
        .order('metric_id', { ascending: true })
        .range(from, to) as PromiseLike<{
        data: RawRow[] | null;
        error: { message: string } | null;
      }>,
    );
    rows.push(...batchRows);
  }

  // Resolve each distinct player's cohort once.
  const cohortByPlayer = new Map<string, Awaited<ReturnType<typeof loadPlayerCohort>>>();
  const distinctIds = [...new Set(rows.map((r) => r.player_id))];
  await Promise.all(
    distinctIds.map(async (id) => {
      cohortByPlayer.set(id, await loadPlayerCohort(id));
    }),
  );

  // One LPGA read for the whole roster, and only when it can be used — a
  // men's-only team never touches golf_pga_standards here.
  const anyWomens = [...cohortByPlayer.values()].some((c) => c?.gender === 'womens');
  const lpga = anyWomens ? await loadStandardsForTour('lpga') : null;

  for (const row of rows) {
    const s = toStanding(row);
    if (!s) continue;
    const cohort = cohortByPlayer.get(row.player_id);
    // Default to men's (unchanged behavior) if a cohort somehow failed to resolve.
    const gender = cohort?.gender ?? 'mens';
    let map = result.get(row.player_id);
    if (!map) {
      map = new Map();
      result.set(row.player_id, map);
    }
    map.set(s.metric_id, applyGenderAnchor(s, gender, lpga));
  }

  return result;
}
