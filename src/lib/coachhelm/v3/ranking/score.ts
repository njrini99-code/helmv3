/**
 * v3 insight ranking (W36).
 *
 * Per master plan Part XIV.4:
 *   rank_score = |strokes_impact| × confidence × coach_weight
 *
 * coach_weight is read from golf_coachhelm_coach_weights keyed by
 * (coach_id, insight_type, intent='general'). Default = 1.0 until
 * sample_n ≥ MIN_CALIBRATED_SAMPLES so under-calibrated weights don't
 * skew rank order.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Sb = SupabaseClient<Database>;

export const MIN_CALIBRATED_SAMPLES = 10;

export interface RankableInsight {
  /** Per-insight type used to look up coach weight. */
  insight_type: string;
  /** From evidence.strokes_impact. Magnitude only — sign just indicates direction. */
  strokes_impact: number;
  /** From evidence.confidence ∈ [0, 1]. */
  confidence: number;
}

/** Map of insight_type → resolved weight (already-validated against MIN_SAMPLES). */
export type CoachWeights = Record<string, number>;

/** Pure scoring fn — returns a non-negative rank score. */
export function scoreInsight(insight: RankableInsight, weights: CoachWeights): number {
  const w = weights[insight.insight_type] ?? 1.0;
  return Math.abs(insight.strokes_impact) * insight.confidence * w;
}

/** Sort descending by score. Stable — equal scores preserve input order. */
export function rankInsights<T extends RankableInsight>(insights: T[], weights: CoachWeights): T[] {
  return insights
    .map((i, idx) => ({ i, idx, score: scoreInsight(i, weights) }))
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
