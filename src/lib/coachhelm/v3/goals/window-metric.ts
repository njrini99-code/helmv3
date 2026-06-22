/**
 * ============================================================================
 * Goal-window metric computation — accurate IN-PROGRESS goal tracking
 * ----------------------------------------------------------------------------
 * THE PROBLEM this fixes (correctness, not cosmetics):
 *   golf_player_standing.player_value is a FLAT ALL-TIME career average
 *   (refresh_player_stats_cache aggregates every completed round, no date
 *   filter). If a goal read that directly, a player crushing their target for
 *   ten rounds would barely move a hundred-round career average — the progress
 *   bar would show ~15% when they're actually EXCEEDING target during the goal.
 *   That's not just unmotivating, it's wrong.
 *
 * THE FIX:
 *   Track each goal over its OWN window — the rounds played since it started —
 *   so improvement shows up promptly and honestly. We aggregate the per-round
 *   values already stored in golf_round_stats_cache (written by the SAME
 *   gender-aware recalculate_round_strokes_gained RPC the all-time cache
 *   averages), so the windowed value is on the SAME scale as the baseline that
 *   was captured from the standing at creation — no scale mismatch.
 *
 * COVERAGE (honest):
 *   The per-round cache cleanly backs the strokes-gained family, GIR, sand
 *   scrambling, and penalty rate — the unambiguous, high-value improvement
 *   metrics. Metrics that need careful shot-level methodology (putt-make-% by
 *   band, approach proximity by band, per-par scoring, putt bias, scrambling by
 *   lie) are NOT windowed here; {@link isWindowedMetric} returns false and the
 *   caller falls back to the all-time standing rather than risk a number that
 *   diverges from the canonical one.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { isWindowedMetric } from './window-metric-ids';

// Re-export so existing importers (goal-progress) keep their import path; the
// pure source lives in window-metric-ids.ts (client-safe, no Supabase).
export { isWindowedMetric };

/** One completed round in the window, with the per-round stats we aggregate. */
export interface WindowRound {
  round_date: string;
  strokes_gained_total: number | null;
  strokes_gained_putting: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  greens_hit: number | null;
  greens_total: number | null;
  sand_saves: number | null;
  sand_attempts: number | null;
  penalty_strokes: number | null;
}

/** SG metric → the per-round cache column it averages. */
const SG_COLUMN: Partial<Record<MetricId, keyof WindowRound>> = {
  sg_total: 'strokes_gained_total',
  sg_putting: 'strokes_gained_putting',
  sg_ott: 'strokes_gained_tee',
  sg_approach: 'strokes_gained_approach',
  sg_around_green: 'strokes_gained_around_green',
};

const SELECT_FIELDS =
  'round_id, strokes_gained_total, strokes_gained_putting, strokes_gained_tee, ' +
  'strokes_gained_approach, strokes_gained_around_green, greens_hit, greens_total, ' +
  'sand_saves, sand_attempts, penalty_strokes';

interface RoundRow {
  id: string;
  round_date: string | null;
}

/**
 * Load every completed round (with its per-round stats) a player has played on
 * or after `sinceIso`, newest-irrelevant order. ONE round query + ONE stats
 * query regardless of how many goals share the player, so the caller computes
 * each goal's window in-memory by date-filtering this set. Returns [] on any
 * error or when the player has no qualifying rounds (caller then falls back to
 * the all-time standing).
 */
export async function loadPlayerWindowRounds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  playerId: string,
  sinceIso: string,
): Promise<WindowRound[]> {
  // round_date is a DATE; compare on the date portion of the goal start.
  const sinceDate = sinceIso.slice(0, 10);

  const { data: rounds, error: rErr } = (await fromUntyped(supabase, 'golf_rounds')
    .select('id, round_date')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', sinceDate)) as { data: RoundRow[] | null; error: unknown };
  if (rErr || !rounds || rounds.length === 0) return [];

  const dateByRound = new Map<string, string>();
  for (const r of rounds) if (r.round_date) dateByRound.set(r.id, r.round_date);
  const roundIds = [...dateByRound.keys()];
  if (roundIds.length === 0) return [];

  const { data: stats, error: sErr } = (await fromUntyped(supabase, 'golf_round_stats_cache')
    .select(SELECT_FIELDS)
    .in('round_id', roundIds)) as {
    data: (Omit<WindowRound, 'round_date'> & { round_id: string })[] | null;
    error: unknown;
  };
  if (sErr || !stats) return [];

  return stats
    .map(({ round_id, ...rest }) => ({
      round_date: dateByRound.get(round_id) ?? '',
      ...rest,
    }))
    .filter((r) => r.round_date !== '');
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

/**
 * Aggregate `metricId` over the given window rounds, matching the all-time
 * cache's own formula (SG = mean of per-round SG; rate stats = pooled
 * numerator/denominator). Returns null when the metric isn't windowable or the
 * rounds carry no usable data for it.
 */
export function aggregateWindowMetric(
  metricId: MetricId,
  rounds: WindowRound[],
): number | null {
  if (rounds.length === 0) return null;

  const sgCol = SG_COLUMN[metricId];
  if (sgCol) {
    const vals = rounds
      .map((r) => r[sgCol] as number | null)
      .filter((v): v is number => v != null && Number.isFinite(v));
    return average(vals);
  }

  if (metricId === 'gir_pct') {
    let hit = 0;
    let total = 0;
    for (const r of rounds) {
      hit += r.greens_hit ?? 0;
      total += r.greens_total ?? 0;
    }
    return total > 0 ? (hit / total) * 100 : null;
  }

  if (metricId === 'scrambling_pct_sand') {
    let saves = 0;
    let attempts = 0;
    for (const r of rounds) {
      saves += r.sand_saves ?? 0;
      attempts += r.sand_attempts ?? 0;
    }
    return attempts > 0 ? (saves / attempts) * 100 : null;
  }

  if (metricId === 'penalty_rate_per_round') {
    // Mean penalties per round across the window (matches the cache's per-round rate).
    return average(rounds.map((r) => r.penalty_strokes ?? 0));
  }

  return null;
}
