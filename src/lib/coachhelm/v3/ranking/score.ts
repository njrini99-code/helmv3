/**
 * v3 insight ranking (W36 + Tier-2 audit #6).
 *
 * Per master plan Part XIV.4:
 *   rank_score = |strokes_impact| × confidence × coach_weight × goalBoost
 *
 * - coach_weight is read from golf_coachhelm_coach_weights keyed by
 *   (coach_id, insight_type, intent='general'). Default = 1.0 until
 *   sample_n ≥ MIN_CALIBRATED_SAMPLES so under-calibrated weights don't
 *   skew rank order.
 * - goalBoost (Tier-2 audit, 2026-05-27) floats insights touching an
 *   active player goal to the top:
 *     1.0 = no active goal touches this insight's metric/category
 *     1.5 = exactly one active goal touches it
 *     2.0 = 2+ active goals touch it
 *   Match is `evidence.metric === goal.metric_id` OR
 *   `insight.category === goal.category`. Only goals with state='active'
 *   participate — paused/achieved/missed are ignored.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';

type Sb = SupabaseClient<Database>;

export const MIN_CALIBRATED_SAMPLES = 10;

export interface RankableInsight {
  /** Per-insight type used to look up coach weight. */
  insight_type: string;
  /** From evidence.strokes_impact. Magnitude only — sign just indicates direction. */
  strokes_impact: number;
  /** From evidence.confidence ∈ [0, 1]. */
  confidence: number;
  /** From evidence.metric — canonical MetricId. Optional for back-compat. */
  metric?: string;
  /** From golf_coach_insights.category. Optional for back-compat. */
  category?: string;
}

/** Map of insight_type → resolved weight (already-validated against MIN_SAMPLES). */
export type CoachWeights = Record<string, number>;

/**
 * Compute the goal-aware multiplier for a single insight.
 *
 * @returns 1.0 (no match), 1.5 (one match), 2.0 (≥2 matches).
 */
export function computeGoalBoost(insight: RankableInsight, activeGoals: Goal[]): number {
  if (!activeGoals.length) return 1.0;

  let matches = 0;
  for (const g of activeGoals) {
    // Defence in depth: scoreInsight callers should pre-filter, but
    // skip non-active goals here too so passing the full list is safe.
    if (g.state !== 'active') continue;

    const metricMatch =
      insight.metric != null && g.metric_id != null && insight.metric === g.metric_id;
    const categoryMatch =
      insight.category != null && g.category != null && insight.category === g.category;

    if (metricMatch || categoryMatch) matches++;
  }

  if (matches >= 2) return 2.0;
  if (matches === 1) return 1.5;
  return 1.0;
}

/** Pure scoring fn — returns a non-negative rank score. */
export function scoreInsight(
  insight: RankableInsight,
  weights: CoachWeights,
  activeGoals: Goal[] = [],
): number {
  const w = weights[insight.insight_type] ?? 1.0;
  const boost = computeGoalBoost(insight, activeGoals);
  return Math.abs(insight.strokes_impact) * insight.confidence * w * boost;
}

/** Sort descending by score. Stable — equal scores preserve input order. */
export function rankInsights<T extends RankableInsight>(
  insights: T[],
  weights: CoachWeights,
  activeGoals: Goal[] = [],
): T[] {
  return insights
    .map((i, idx) => ({ i, idx, score: scoreInsight(i, weights, activeGoals) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((row) => row.i);
}

/**
 * Resolve the coach weights to use when ranking insights for one
 * player. Looks up the player's primary coach via golf_team_members
 * → golf_team_coach_staff, then pulls rows where sample_n ≥
 * MIN_CALIBRATED_SAMPLES. Under-calibrated rows fall back to default
 * 1.0 (encoded by omission from the returned map).
 */
export async function loadCoachWeightsForPlayer(
  sb: Sb,
  player_id: string,
): Promise<CoachWeights> {
  const { data: membership } = await sb
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return {};

  const { data: staff } = await sb
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  if (!staff?.coach_id) return {};

  const { data: rows } = await sb
    .from('golf_coachhelm_coach_weights')
    .select('insight_type, weight, sample_n')
    .eq('coach_id', staff.coach_id)
    .eq('intent', 'general')
    .gte('sample_n', MIN_CALIBRATED_SAMPLES);

  const weights: CoachWeights = {};
  for (const r of rows ?? []) {
    weights[r.insight_type] = Number(r.weight);
  }
  return weights;
}
