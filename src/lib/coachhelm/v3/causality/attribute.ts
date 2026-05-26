/**
 * v3 outcome attribution (W35).
 *
 * For each insight surfaced ≥21 days ago without an attribution row,
 * compute baseline (14d before surfaced_at) + post (21d after) for the
 * insight's target metric. Lift is the post-vs-baseline delta minus
 * the player's ambient 90-day trend over the same window, so we don't
 * credit insights for improvements that would have happened anyway.
 *
 * Pure-ish: takes a Supabase client and one insight id, returns the
 * computed attribution row (or null if not enough data). The caller
 * writes the row + updates aggregates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Sb = SupabaseClient<Database>;

export interface AttributionInput {
  insight_id: string;
  player_id: string;
  surfaced_at: string;
  /** The metric this insight is "about" — extracted from
   *  insight.evidence.metric upstream. */
  target_metric_id: string;
}

export interface AttributionRow {
  insight_id: string;
  surfaced_at: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  lift: number | null;
}

const PRE_WINDOW_DAYS = 14;
const POST_WINDOW_DAYS = 21;

/**
 * For a given metric, returns the player's average over rounds whose
 * date falls inside [start, end]. Source: golf_player_stats_cache
 * doesn't carry per-round time-series, so we approximate by pulling
 * golf_rounds.score_to_par (the most universally-populated metric
 * surface) when target_metric_id is 'score_to_par', else fall back to
 * an insight-evidence-mined value via a separate path.
 *
 * v1 limitation: only score_to_par is wired through. Other metric IDs
 * return null and the row is skipped — the cron logs "deferred" so we
 * can extend coverage as more metric-aware queries land.
 */
async function averageInWindow(
  sb: Sb,
  player_id: string,
  target_metric_id: string,
  startIso: string,
  endIso: string,
): Promise<{ avg: number; n: number } | null> {
  if (target_metric_id === 'score_to_par') {
    const { data } = await sb
      .from('golf_rounds')
      .select('score_to_par')
      .eq('player_id', player_id)
      .eq('status', 'completed')
      .gte('round_date', startIso.slice(0, 10))
      .lte('round_date', endIso.slice(0, 10));
    const values = (data ?? [])
      .map((r) => r.score_to_par)
      .filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return { avg: sum / values.length, n: values.length };
  }
  return null;
}

export async function computeAttribution(
  sb: Sb,
  input: AttributionInput,
): Promise<AttributionRow | null> {
  const surfacedTs = new Date(input.surfaced_at).getTime();
  const preStart = new Date(surfacedTs - PRE_WINDOW_DAYS * 86400_000).toISOString();
  const preEnd = new Date(surfacedTs - 1).toISOString();
  const postStart = new Date(surfacedTs + 1).toISOString();
  const postEnd = new Date(surfacedTs + POST_WINDOW_DAYS * 86400_000).toISOString();

  const [base, post] = await Promise.all([
    averageInWindow(sb, input.player_id, input.target_metric_id, preStart, preEnd),
    averageInWindow(sb, input.player_id, input.target_metric_id, postStart, postEnd),
  ]);
  if (!base || !post) return null;

  const delta = post.avg - base.avg;

  // Ambient trend: compare a 90-day window centered on surfaced_at
  // (excluding the immediate pre/post) so we can subtract ambient drift.
  const ambient = await averageInWindow(
    sb,
    input.player_id,
    input.target_metric_id,
    new Date(surfacedTs - 90 * 86400_000).toISOString(),
    new Date(surfacedTs + 90 * 86400_000).toISOString(),
  );
  const lift = ambient ? delta - (ambient.avg - base.avg) : null;

  return {
    insight_id: input.insight_id,
    surfaced_at: input.surfaced_at,
    target_metric_id: input.target_metric_id,
    baseline_value: base.avg,
    post_value: post.avg,
    delta,
    n_rounds_before: base.n,
    n_rounds_after: post.n,
    lift,
  };
}

/**
 * Bayesian-ish update for a (coach_id, insight_type, intent) weight
 * given a new attribution lift. We use a simple exponential-moving-
 * average over signed lifts, then clamp to [0.25, 2.0] so a single
 * outlier can't dominate the ranker.
 */
export function nextWeight(prev: { weight: number; sample_n: number }, lift: number | null): { weight: number; sample_n: number } {
  if (lift === null || !Number.isFinite(lift)) return prev;
  const alpha = 1 / (prev.sample_n + 1);
  // Positive lift = good outcome from this insight type → push weight up
  // toward 1.5; negative lift → push toward 0.5.
  const target = lift > 0 ? 1.5 : 0.5;
  const next = prev.weight * (1 - alpha) + target * alpha;
  const clamped = Math.max(0.25, Math.min(2.0, next));
  return {
    weight: Number(clamped.toFixed(4)),
    sample_n: prev.sample_n + 1,
  };
}
