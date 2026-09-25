/**
 * ============================================================================
 * Root map loaders: small, bounded READS of stored data
 * ----------------------------------------------------------------------------
 * Plain server-side functions (NOT `'use server'` actions) that the RSC pages
 * call with their own request-scoped Supabase client, so RLS applies exactly
 * as it does for every other read on those pages. No generator runs, no shot
 * scan, no writes (PR #2068): each function is one indexed select over
 * columns the stats pipeline already stored, with a hard row bound.
 *
 * Failure contract: every loader returns `null` on a failed read (logged as a
 * warning) and `[]` for a genuine "no rows". Callers render an honest empty
 * state for `[]` and omit the element for `null`; neither is ever turned into
 * a number.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  STORED_SG_COLUMNS as SG_COLUMNS,
  areaRoundFromStored as toAreaRound,
  averageAreaSg,
  type AreaSgRound,
  type PlayerAreaSg,
  type StoredSgRoundRow as SgRoundRow,
  type TeamSgRound,
} from './area-trends';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { GREEN_MAX_FT, type GreenPuttInput } from './green-view';

type Sb = SupabaseClient<Database>;

/** PostgREST `.in()` lists ride in the URL; keep each chunk well short of the
 *  length limit (uuid ≈ 37 chars with its comma). */
const IN_CHUNK = 60;

function chunk<T>(xs: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function warn(message: string, action: string, err: unknown): void {
  void logServerError(`${message}: ${describeError(err)}`, { action, featureArea: 'coachhelm', skipSentry: true }, 'warning').catch(
    () => undefined,
  );
}

/**
 * The player's most recent completed rounds with their stored per-round SG,
 * newest first. `limit` rounds max (default 10: 5 recent vs 5 before).
 */
export async function loadRecentAreaSgRounds(sb: Sb, playerId: string, limit = 10): Promise<AreaSgRound[] | null> {
  try {
    const { data, error } = await sb
      .from('golf_rounds')
      .select(SG_COLUMNS)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      // Over-fetch so non-countable rounds dropped below don't shrink the window.
      .limit(limit * 2);
    if (error) throw error;
    return ((data ?? []) as SgRoundRow[])
      .map(toAreaRound)
      .filter((r): r is AreaSgRound => r !== null)
      .slice(0, limit);
  } catch (err) {
    warn(`[root-map] recent SG rounds read failed for player ${playerId}`, 'rootMap.loadRecentAreaSgRounds', err);
    return null;
  }
}

/**
 * Roster rounds since `sinceDate` (date-only), with stored per-round SG.
 * Bounded by the window and paged past the 1000-row cap on a stable order.
 */
export async function loadTeamSgRounds(sb: Sb, playerIds: string[], sinceDate: string): Promise<TeamSgRound[] | null> {
  if (playerIds.length === 0) return [];
  try {
    const out: TeamSgRound[] = [];
    for (const ids of chunk(playerIds)) {
      const { data, error } = await fetchAllRowsResult<SgRoundRow & { id: string; player_id: string }>(
        (from, to) =>
          sb
            .from('golf_rounds')
            .select(`id, player_id, ${SG_COLUMNS}`)
            .in('player_id', ids)
            .eq('status', 'completed')
            .gte('round_date', sinceDate)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: (SgRoundRow & { id: string; player_id: string })[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_rounds', action: 'rootMap.loadTeamSgRounds', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const r = toAreaRound(row);
        if (r) out.push({ ...r, playerId: row.player_id });
      }
    }
    return out;
  } catch (err) {
    warn('[root-map] team SG rounds read failed', 'rootMap.loadTeamSgRounds', err);
    return null;
  }
}

export interface PlayerAreaSgRow extends PlayerAreaSg {
  playerId: string;
}

/**
 * Per-round area SG for each player, averaged over their COUNTABLE completed
 * rounds (per 18 holes) from the stored `golf_rounds.strokes_gained_*`.
 *
 * Deliberately NOT `golf_player_stats_cache.sg_*_per_round`: that cache is
 * written by the SQL function `update_player_stats_strokes_gained(uuid)`
 * (called from `src/lib/cache/golf-stats-calculator.ts`), which averages every
 * completed round, so one mis-entered round (37 strokes over "18 holes", SG
 * tee +17.89) moved one player's putting from -4.09 to -2.93 per round. Fixing the writer
 * is a migration; until then the root map computes its own average here.
 *
 * Bounded: one indexed select per chunk of players, paged past the 1000-row
 * cap on a stable order. Players with no countable SG round get no row.
 */
export async function loadPlayersAreaSg(sb: Sb, playerIds: string[]): Promise<PlayerAreaSgRow[] | null> {
  if (playerIds.length === 0) return [];
  try {
    const byPlayer = new Map<string, AreaSgRound[]>();
    for (const ids of chunk(playerIds)) {
      const { data, error } = await fetchAllRowsResult<SgRoundRow & { id: string; player_id: string }>(
        (from, to) =>
          sb
            .from('golf_rounds')
            .select(`id, player_id, ${SG_COLUMNS}`)
            .in('player_id', ids)
            .eq('status', 'completed')
            .not('strokes_gained_total', 'is', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: (SgRoundRow & { id: string; player_id: string })[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_rounds', action: 'rootMap.loadPlayersAreaSg', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const r = toAreaRound(row);
        if (!r) continue;
        const list = byPlayer.get(row.player_id) ?? [];
        list.push(r);
        byPlayer.set(row.player_id, list);
      }
    }
    const out: PlayerAreaSgRow[] = [];
    for (const [playerId, rounds] of byPlayer) {
      const avg = averageAreaSg(rounds);
      if (avg.roundsPlayed > 0) out.push({ playerId, ...avg });
    }
    return out;
  } catch (err) {
    warn('[root-map] countable area SG read failed', 'rootMap.loadPlayersAreaSg', err);
    return null;
  }
}

/** Rounds the green view reads back (newest countable rounds). */
export const GREEN_ROUND_LIMIT = 40;

export interface ShortPuttSample {
  rounds: number;
  putts: GreenPuttInput[];
}

/**
 * Recorded putts inside 6 ft with a slope, from the player's most recent
 * {@link GREEN_ROUND_LIMIT} countable completed rounds: the Why view's green.
 *
 * Bounded: one select for the rounds (over-fetched so non-countable ones do
 * not shrink the window) and one paged select for their putts, filtered in the
 * query to putting shots at 0-6 ft with a downhill/level/uphill slope.
 */
export async function loadShortPuttSlopes(sb: Sb, playerId: string): Promise<ShortPuttSample | null> {
  try {
    const { data: rounds, error: rErr } = await sb
      .from('golf_rounds')
      .select('id, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(GREEN_ROUND_LIMIT + 20);
    if (rErr) throw rErr;
    const roundIds = ((rounds ?? []) as Array<CountableRoundInput & { id: string }>)
      .filter(isCountableRound)
      .slice(0, GREEN_ROUND_LIMIT)
      .map((r) => r.id);
    if (roundIds.length === 0) return { rounds: 0, putts: [] };

    type Row = { id: string; putt_distance_feet: number | null; putt_slope: string | null; putt_made: boolean | null };
    const putts: GreenPuttInput[] = [];
    for (const ids of chunk(roundIds)) {
      const { data, error } = await fetchAllRowsResult<Row>(
        (from, to) =>
          sb
            .from('golf_shots')
            .select('id, putt_distance_feet, putt_slope, putt_made')
            .in('round_id', ids)
            .eq('shot_type', 'putting')
            .gt('putt_distance_feet', 0)
            .lte('putt_distance_feet', GREEN_MAX_FT)
            .in('putt_slope', ['downhill', 'level', 'uphill'])
            .not('putt_made', 'is', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: Row[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_shots', action: 'rootMap.loadShortPuttSlopes', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const feet = num(row.putt_distance_feet);
        if (feet === null || row.putt_made === null) continue;
        putts.push({ id: row.id, feet, slope: row.putt_slope, made: row.putt_made });
      }
    }
    return { rounds: roundIds.length, putts };
  } catch (err) {
    warn(`[root-map] short-putt slope read failed for player ${playerId}`, 'rootMap.loadShortPuttSlopes', err);
    return null;
  }
}

export interface StoredAttributionRow {
  insightId: string;
  targetMetricId: string;
  baseline: number;
  post: number;
  nBefore: number;
  nAfter: number;
  methodVersion: string | null;
}

/**
 * Stored outcome-attribution rows for the given insights (the table the
 * comparable-opportunity cron writes). RLS limits them to the coach who owns
 * each insight. The CALLER checks the attribution flag first.
 */
export async function loadAttributionForInsights(sb: Sb, insightIds: string[]): Promise<StoredAttributionRow[] | null> {
  if (insightIds.length === 0) return [];
  try {
    const out: StoredAttributionRow[] = [];
    for (const ids of chunk(insightIds)) {
      const { data, error } = await sb
        .from('golf_insight_outcome_attribution')
        .select('insight_id, target_metric_id, baseline_value, post_value, n_rounds_before, n_rounds_after, method_version')
        .in('insight_id', ids);
      if (error) throw error;
      for (const row of data ?? []) {
        const baseline = num(row.baseline_value);
        const post = num(row.post_value);
        if (baseline === null || post === null) continue;
        out.push({
          insightId: row.insight_id,
          targetMetricId: row.target_metric_id,
          baseline,
          post,
          nBefore: row.n_rounds_before ?? 0,
          nAfter: row.n_rounds_after ?? 0,
          methodVersion: row.method_version ?? null,
        });
      }
    }
    return out;
  } catch (err) {
    warn('[root-map] attribution read failed', 'rootMap.loadAttributionForInsights', err);
    return null;
  }
}
