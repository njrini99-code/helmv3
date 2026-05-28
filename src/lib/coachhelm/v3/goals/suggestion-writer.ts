/**
 * v3 W19 follow-up — engine-driven goal-suggestion writer.
 *
 * Walks players with standing data, identifies their top-2 weakest metrics
 * (per direction-aware delta), filters to metrics that:
 *   - have drill coverage (≥1 `golf_drills.impacts_metric_id = metric_id`)
 *   - the player doesn't already have an active goal targeting
 *   - the player doesn't already have a pending (non-expired) suggestion for
 * …and inserts `golf_goal_suggestions` rows (state='pending', 14-day TTL).
 *
 * The pure {@link selectSuggestionsForPlayer} core is exported separately so
 * unit tests can drive it without touching Supabase.
 *
 * Spec: docs/v3-master-plan.md Part VI.5 — "Engine suggestions".
 * Followup row: docs/v3-wave-sequence.md W19.
 *
 * Note on idempotency: prod schema has no unique constraint on
 * (player_id, metric_id, state='pending'), so we rely on a pre-flight
 * read of pending suggestions per player. Running this writer twice in a
 * row produces zero new rows on the second pass.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMetricId, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/**
 * One row from `golf_player_standing` plus the metric direction we need
 * to compute a signed "gap to PGA baseline" without bouncing back to the DB.
 */
export interface StandingRowWithDirection {
  player_id: string;
  metric_id: string;
  player_value: number;
  pga_value: number;
  /** Signed (player - pga). Sign meaning depends on direction. */
  pga_delta: number | null;
  direction: 'higher_better' | 'lower_better';
}

/** Compact view of an existing active goal — we only need the metric_id. */
export interface ActiveGoalRef {
  player_id: string;
  metric_id: string;
}

/** Compact view of a pending suggestion — same. */
export interface PendingSuggestionRef {
  player_id: string;
  metric_id: string;
}

export interface SelectionInput {
  player_id: string;
  /** All standing rows for this player. */
  standings: StandingRowWithDirection[];
  /** Set of metric_ids that have ≥1 drill in golf_drills. */
  metricsWithDrillCoverage: ReadonlySet<string>;
  /** This player's active goals' metric_ids. */
  activeGoalMetrics: ReadonlySet<string>;
  /** This player's pending/snoozed suggestion metric_ids. */
  pendingSuggestionMetrics: ReadonlySet<string>;
  /** Max suggestions per player (default 2). */
  maxSuggestions?: number;
}

export interface SuggestionDraft {
  player_id: string;
  metric_id: MetricId;
  suggested_target_value: number;
  /** Worst-first severity score (positive number, higher = worse). */
  severity: number;
}

/**
 * Default % closure toward the PGA baseline used when synthesising
 * `suggested_target_value`. 50% is the midpoint heuristic Part VI.5
 * documents ("midpoint(team_avg, pga_value)") — we use midpoint of
 * (player_value, pga_value) when no team value is available on the row.
 */
export const DEFAULT_TARGET_CLOSURE_PCT = 0.5;

/** Default suggested window (days) — matches `golf_goal_suggestions.suggested_window_days` default. */
export const DEFAULT_SUGGESTED_WINDOW_DAYS = 30;

/** Default TTL (days) before evaluator flips state→'expired'. */
export const DEFAULT_SUGGESTION_TTL_DAYS = 14;

/**
 * Pure selector. Given everything the writer knows about a player,
 * returns up to {@link SelectionInput.maxSuggestions} drafts ordered
 * worst-first.
 */
export function selectSuggestionsForPlayer(input: SelectionInput): SuggestionDraft[] {
  const cap = input.maxSuggestions ?? 2;
  if (cap <= 0) return [];

  const drafts: SuggestionDraft[] = [];
  for (const row of input.standings) {
    if (!isMetricId(row.metric_id)) continue;
    if (input.activeGoalMetrics.has(row.metric_id)) continue;
    if (input.pendingSuggestionMetrics.has(row.metric_id)) continue;
    if (!input.metricsWithDrillCoverage.has(row.metric_id)) continue;

    // Severity = how far below the PGA baseline the player is, signed
    // for direction so "worse" is always positive.
    const rawDelta = row.pga_delta ?? row.player_value - row.pga_value;
    const severity = row.direction === 'higher_better' ? -rawDelta : rawDelta;

    // Only suggest if the player is actually worse than baseline.
    if (severity <= 0) continue;

    // Skip degenerate rows (no PGA baseline to aim at).
    if (!Number.isFinite(row.pga_value)) continue;

    drafts.push({
      player_id: row.player_id,
      metric_id: row.metric_id as MetricId,
      suggested_target_value: computeTargetValue({
        playerValue: row.player_value,
        pgaValue: row.pga_value,
      }),
      severity,
    });
  }

  // Worst-first; deterministic tiebreaker by metric_id alphabetically.
  drafts.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.metric_id.localeCompare(b.metric_id);
  });

  return drafts.slice(0, cap);
}

/**
 * Midpoint heuristic: aim halfway between current player value and
 * PGA baseline. Rounded to 4dp to keep numeric storage tidy.
 */
export function computeTargetValue(args: { playerValue: number; pgaValue: number }): number {
  const t =
    args.playerValue + (args.pgaValue - args.playerValue) * DEFAULT_TARGET_CLOSURE_PCT;
  return Math.round(t * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Live writer
// ---------------------------------------------------------------------------

export interface WriterResult {
  players_considered: number;
  players_with_standings: number;
  suggestions_inserted: number;
  per_player: Array<{ player_id: string; inserted: number; metric_ids: string[] }>;
  duration_ms: number;
  error?: string;
}

/**
 * Runs the writer against live Supabase. Only call from the cron route or
 * a test-double Supabase client (typing pinned to {@link SupabaseClient}).
 */
export async function runSuggestionWriter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<WriterResult> {
  const startedAt = Date.now();
  const result: WriterResult = {
    players_considered: 0,
    players_with_standings: 0,
    suggestions_inserted: 0,
    per_player: [],
    duration_ms: 0,
  };

  // 1. Pull metric directions (small static table — 28 rows).
  const { data: metricRows, error: metricsErr } = await supabase
    .from('golf_metrics')
    .select('metric_id, direction, active')
    .eq('active', true);
  if (metricsErr) {
    result.error = `metrics: ${metricsErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  const directionByMetric = new Map<string, 'higher_better' | 'lower_better'>();
  for (const m of metricRows ?? []) {
    if (m.direction === 'higher_better' || m.direction === 'lower_better') {
      directionByMetric.set(m.metric_id, m.direction);
    }
  }

  // 2. Pull drill coverage (which metrics have ≥1 drill).
  const { data: drillRows, error: drillsErr } = await supabase
    .from('golf_drills')
    .select('impacts_metric_id')
    .not('impacts_metric_id', 'is', null);
  if (drillsErr) {
    result.error = `drills: ${drillsErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  const metricsWithDrillCoverage = new Set<string>();
  for (const d of drillRows ?? []) {
    if (d.impacts_metric_id) metricsWithDrillCoverage.add(d.impacts_metric_id);
  }

  // 3. Pull all standing rows, grouped by player.
  const { data: standingRows, error: standingErr } = await supabase
    .from('golf_player_standing')
    .select('player_id, metric_id, player_value, pga_value, pga_delta');
  if (standingErr) {
    result.error = `standing: ${standingErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }

  const standingsByPlayer = new Map<string, StandingRowWithDirection[]>();
  for (const s of standingRows ?? []) {
    const dir = directionByMetric.get(s.metric_id);
    if (!dir) continue; // Inactive or unknown metric — skip.
    const list = standingsByPlayer.get(s.player_id) ?? [];
    list.push({
      player_id: s.player_id,
      metric_id: s.metric_id,
      player_value: Number(s.player_value),
      pga_value: Number(s.pga_value),
      pga_delta: s.pga_delta == null ? null : Number(s.pga_delta),
      direction: dir,
    });
    standingsByPlayer.set(s.player_id, list);
  }

  result.players_with_standings = standingsByPlayer.size;

  if (standingsByPlayer.size === 0) {
    result.duration_ms = Date.now() - startedAt;
    return result;
  }

  // 4. Pull active goals + pending suggestions only for the players we'll touch.
  const playerIds = Array.from(standingsByPlayer.keys());
  result.players_considered = playerIds.length;

  const { data: activeGoals, error: goalsErr } = await supabase
    .from('golf_goals')
    .select('player_id, metric_id')
    .eq('state', 'active')
    .in('player_id', playerIds);
  if (goalsErr) {
    result.error = `goals: ${goalsErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  const activeGoalsByPlayer = new Map<string, Set<string>>();
  for (const g of activeGoals ?? []) {
    const set = activeGoalsByPlayer.get(g.player_id) ?? new Set<string>();
    set.add(g.metric_id);
    activeGoalsByPlayer.set(g.player_id, set);
  }

  const nowIso = new Date().toISOString();
  const { data: pendingSugs, error: sugsErr } = await supabase
    .from('golf_goal_suggestions')
    .select('player_id, metric_id, state, expires_at')
    .in('player_id', playerIds)
    .in('state', ['pending', 'snoozed'])
    .gt('expires_at', nowIso);
  if (sugsErr) {
    result.error = `suggestions: ${sugsErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  const pendingByPlayer = new Map<string, Set<string>>();
  for (const s of pendingSugs ?? []) {
    const set = pendingByPlayer.get(s.player_id) ?? new Set<string>();
    set.add(s.metric_id);
    pendingByPlayer.set(s.player_id, set);
  }

  // 5. Build inserts per player.
  const inserts: Array<{
    player_id: string;
    metric_id: string;
    suggested_target_value: number;
    suggested_window_days: number;
    expires_at: string;
  }> = [];
  const expiresAtIso = new Date(
    Date.now() + DEFAULT_SUGGESTION_TTL_DAYS * 86_400_000,
  ).toISOString();

  for (const playerId of playerIds) {
    const standings = standingsByPlayer.get(playerId) ?? [];
    const drafts = selectSuggestionsForPlayer({
      player_id: playerId,
      standings,
      metricsWithDrillCoverage,
      activeGoalMetrics: activeGoalsByPlayer.get(playerId) ?? new Set(),
      pendingSuggestionMetrics: pendingByPlayer.get(playerId) ?? new Set(),
    });
    if (drafts.length === 0) {
      result.per_player.push({ player_id: playerId, inserted: 0, metric_ids: [] });
      continue;
    }
    for (const d of drafts) {
      inserts.push({
        player_id: d.player_id,
        metric_id: d.metric_id,
        suggested_target_value: d.suggested_target_value,
        suggested_window_days: DEFAULT_SUGGESTED_WINDOW_DAYS,
        expires_at: expiresAtIso,
      });
    }
    result.per_player.push({
      player_id: playerId,
      inserted: drafts.length,
      metric_ids: drafts.map((d) => d.metric_id),
    });
  }

  if (inserts.length === 0) {
    result.duration_ms = Date.now() - startedAt;
    return result;
  }

  // 6. Batch-insert. state defaults to 'pending', suggested_at defaults to now().
  const { error: insertErr, count } = await supabase
    .from('golf_goal_suggestions')
    .insert(inserts, { count: 'exact' });

  if (insertErr) {
    result.error = `insert: ${insertErr.message}`;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  result.suggestions_inserted = count ?? inserts.length;
  result.duration_ms = Date.now() - startedAt;
  return result;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface EvaluatorResult {
  expired: number;
  duration_ms: number;
  error?: string;
}

/**
 * Flips any pending/snoozed suggestion whose `expires_at` is in the past
 * to `state='expired'`, recording `acted_at = now()` for audit.
 *
 * Idempotent — re-running selects the empty set on the second pass.
 */
export async function runSuggestionEvaluator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<EvaluatorResult> {
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('golf_goal_suggestions')
    .update({ state: 'expired', acted_at: nowIso })
    .in('state', ['pending', 'snoozed'])
    .lt('expires_at', nowIso)
    .select('id');

  if (error) {
    return { expired: 0, duration_ms: Date.now() - startedAt, error: error.message };
  }
  return {
    expired: (data ?? []).length,
    duration_ms: Date.now() - startedAt,
  };
}
