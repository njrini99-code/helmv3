'use server';

/**
 * ============================================================================
 * Focus-area progress driver — makes the development-plan progress bar move
 * ----------------------------------------------------------------------------
 * Focus areas (golf_player_focus_areas) historically only moved their
 * `current_value` when someone manually tapped "Update progress". So an active
 * focus area sat frozen at the value captured at creation — the progress bar
 * never reflected the rounds the player actually went out and played.
 *
 * This driver closes that gap, in the SAME spirit as the goal-progress driver
 * (src/app/golf/actions/v3/goal-progress.ts). For each ACTIVE focus area with a
 * windowable measurable metric it:
 *   1. measures the metric over the area's OWN window — rounds played since it
 *      started (started_at) — NOT the diluted all-time average, and on the SAME
 *      scale as the baseline captured at creation (both come from the per-round
 *      golf_round_stats_cache written by the gender-aware recalculate RPC),
 *   2. writes the windowed value to `current_value` so the bar advances.
 *
 * HONESTY: metrics with no clean per-round source (proximity, up&down, 1/3-putt
 * %, per-par averages) are NOT windowable — {@link aggregateFocusMetric} returns
 * null and we SKIP the write, leaving `current_value` as last set rather than
 * fabricating a number. Areas still in 'proposed' (awaiting player acceptance)
 * are ignored — their window hasn't started. We never auto-complete: hitting the
 * target is the player's/coach's call, so only `current_value` is touched.
 *
 * Idempotent and side-effect-light: safe to call on page view (coach + player
 * development surfaces) AND from the nightly cron, so the bar is fresh whenever
 * anyone looks and still advances when nobody opens the app. Uses the admin
 * client (runs under a session OR headless); the explicit player_id filter is
 * the scoping guard.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  aggregateFocusMetric,
  isWindowableFocusMetric,
  findMetric,
  type FocusWindowRound,
} from '@/lib/coachhelm/focus-areas/catalog';

export interface FocusAreaProgressSummary {
  /** Active focus areas examined (windowable, with a target + start). */
  evaluated: number;
  /** Areas whose current_value was written this pass. */
  updated: number;
}

export interface BatchFocusAreaProgressSummary extends FocusAreaProgressSummary {
  /** Distinct players that had ≥1 windowable active focus area. */
  players_with_areas: number;
}

/** Minimal focus-area row this driver reads. */
interface ActiveFocusArea {
  id: string;
  player_id: string;
  target_metric: string | null;
  current_value: number | null;
  started_at: string | null;
}

/** golf_round_stats_cache columns we window, plus the round id to join dates. */
const STATS_SELECT =
  'round_id, total_score, total_putts, fairways_hit, fairways_total, greens_hit, ' +
  'greens_total, driving_distance_avg, scrambles_converted, scramble_attempts, ' +
  'sand_saves, sand_attempts';

function roundToMetric(metric: string | null, value: number): number {
  const decimals = findMetric(metric)?.decimals ?? 1;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Load every completed round (with the per-round stats we window) for the given
 * players on or after `sinceDate`. ONE rounds query + ONE stats query for the
 * whole batch; the caller date-filters per area in memory. Returns a map keyed
 * by player_id. Empty map on any error or no qualifying rounds (callers then
 * skip — current_value stays as-is).
 */
async function loadWindowRoundsByPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  playerIds: string[],
  sinceDate: string,
): Promise<Map<string, FocusWindowRound[]>> {
  const out = new Map<string, FocusWindowRound[]>();
  if (playerIds.length === 0) return out;

  const { data: rounds, error: rErr } = (await fromUntyped(supabase, 'golf_rounds')
    .select('id, player_id, round_date')
    .in('player_id', playerIds)
    .eq('status', 'completed')
    .gte('round_date', sinceDate)) as {
    data: { id: string; player_id: string; round_date: string | null }[] | null;
    error: unknown;
  };
  if (rErr || !rounds || rounds.length === 0) return out;

  const meta = new Map<string, { player_id: string; round_date: string }>();
  for (const r of rounds) {
    if (r.round_date) meta.set(r.id, { player_id: r.player_id, round_date: r.round_date });
  }
  const roundIds = [...meta.keys()];
  if (roundIds.length === 0) return out;

  const { data: stats, error: sErr } = (await fromUntyped(supabase, 'golf_round_stats_cache')
    .select(STATS_SELECT)
    .in('round_id', roundIds)) as {
    data: (Omit<FocusWindowRound, 'round_date'> & { round_id: string })[] | null;
    error: unknown;
  };
  if (sErr || !stats) return out;

  for (const { round_id, ...rest } of stats) {
    const m = meta.get(round_id);
    if (!m) continue;
    const list = out.get(m.player_id) ?? [];
    list.push({ round_date: m.round_date, ...rest });
    out.set(m.player_id, list);
  }
  return out;
}

/**
 * Core: window each area against its player's rounds-since-start and persist the
 * new current_value. Skips non-windowable metrics, areas with no target window
 * start, and any area whose window yields no value (no fabrication) or an
 * unchanged value (no-op write).
 */
async function evaluateAreas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  areas: ActiveFocusArea[],
  nowIso: string,
): Promise<{ evaluated: number; updated: number; players: Set<string> }> {
  const players = new Set<string>();
  let updated = 0;

  // Only areas we can actually window: have a start + a recognized windowable metric.
  const windowable = areas.filter(
    (a) => a.started_at && isWindowableFocusMetric(a.target_metric),
  );
  if (windowable.length === 0) {
    return { evaluated: 0, updated, players };
  }

  windowable.forEach((a) => players.add(a.player_id));

  // Earliest start across the batch → one rounds load covers every window.
  const earliest = windowable
    .map((a) => a.started_at!.slice(0, 10))
    .reduce((min, d) => (d < min ? d : min));

  const roundsByPlayer = await loadWindowRoundsByPlayer(
    supabase,
    [...players],
    earliest,
  );

  for (const area of windowable) {
    const startDate = area.started_at!.slice(0, 10);
    const playerRounds = roundsByPlayer.get(area.player_id) ?? [];
    const inWindow = playerRounds.filter((r) => r.round_date >= startDate);
    const raw = aggregateFocusMetric(area.target_metric, inWindow);
    if (raw == null) continue; // no usable rounds yet → leave current_value as-is

    const next = roundToMetric(area.target_metric, raw);
    if (area.current_value != null && area.current_value === next) continue; // no-op

    const { error } = await fromUntyped(supabase, 'golf_player_focus_areas')
      .update({ current_value: next, updated_at: nowIso })
      .eq('id', area.id);
    if (!error) updated += 1;
  }

  return { evaluated: windowable.length, updated, players };
}

/**
 * Evaluate + persist progress for every active focus area across the given
 * players in one efficient pass. Used by the nightly standing-refresh cron and
 * the coach development page (so the coach sees fresh progress, not stale).
 */
export async function runFocusAreaProgressForPlayers(
  playerIds: string[],
): Promise<BatchFocusAreaProgressSummary> {
  const empty: BatchFocusAreaProgressSummary = {
    evaluated: 0,
    updated: 0,
    players_with_areas: 0,
  };
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return empty;

  const supabase = createAdminClient();

  const { data, error } = (await fromUntyped(supabase, 'golf_player_focus_areas')
    .select('id, player_id, target_metric, current_value, started_at')
    .in('player_id', ids)
    .eq('status', 'active')) as { data: ActiveFocusArea[] | null; error: unknown };
  if (error || !data || data.length === 0) return empty;

  const { evaluated, updated, players } = await evaluateAreas(
    supabase,
    data,
    new Date().toISOString(),
  );
  return { evaluated, updated, players_with_areas: players.size };
}

/**
 * Single-player variant — evaluate + persist progress for one player's active
 * focus areas. Used on the player My Development page view.
 */
export async function evaluateAndPersistFocusAreas(
  playerId: string,
): Promise<FocusAreaProgressSummary> {
  if (!playerId) return { evaluated: 0, updated: 0 };
  const { evaluated, updated } = await runFocusAreaProgressForPlayers([playerId]);
  return { evaluated, updated };
}
