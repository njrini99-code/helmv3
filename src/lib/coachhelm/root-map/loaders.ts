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

import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { AreaSgRound, TeamSgRound } from './area-trends';
import type { RootArea } from './build-root-map';

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

const SG_COLUMNS =
  'round_date, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';

interface SgRoundRow extends CountableRoundInput {
  round_date: string | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

function toAreaRound(row: SgRoundRow): AreaSgRound | null {
  const date = typeof row.round_date === 'string' ? row.round_date.slice(0, 10) : null;
  // Partial or mis-entered rounds (e.g. 37 strokes logged as 18 holes) carry
  // absurd per-round SG and would swamp every trend: same countable rule as
  // the rest of CoachHelm.
  if (!date || !isCountableRound(row)) return null;
  return {
    date,
    tee: num(row.strokes_gained_tee),
    approach: num(row.strokes_gained_approach),
    short_game: num(row.strokes_gained_around_green),
    putting: num(row.strokes_gained_putting),
  };
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

export interface PlayerSgCacheRow {
  playerId: string;
  roundsPlayed: number | null;
  sgTotal: number | null;
  sg: Record<RootArea, number | null>;
}

/** Stored SG per round (stats cache) for each player that has a cache row. */
export async function loadPlayersSgCache(sb: Sb, playerIds: string[]): Promise<PlayerSgCacheRow[] | null> {
  if (playerIds.length === 0) return [];
  try {
    const out: PlayerSgCacheRow[] = [];
    for (const ids of chunk(playerIds)) {
      const { data, error } = await sb
        .from('golf_player_stats_cache')
        .select(
          'player_id, rounds_played, sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round',
        )
        .in('player_id', ids);
      if (error) throw error;
      for (const row of data ?? []) {
        out.push({
          playerId: row.player_id,
          roundsPlayed: num(row.rounds_played),
          sgTotal: num(row.sg_total_per_round),
          sg: {
            tee: num(row.sg_tee_per_round),
            approach: num(row.sg_approach_per_round),
            short_game: num(row.sg_around_green_per_round),
            putting: num(row.sg_putting_per_round),
          },
        });
      }
    }
    return out;
  } catch (err) {
    warn('[root-map] stats-cache SG read failed', 'rootMap.loadPlayersSgCache', err);
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
