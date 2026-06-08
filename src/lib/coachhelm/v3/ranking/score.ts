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
import type { InsightPriority } from '@/lib/coachhelm/insight-types';
import { getCounterfactualConfig } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

type Sb = SupabaseClient<Database>;

export const MIN_CALIBRATED_SAMPLES = 10;

/**
 * Hard per-round magnitude ceiling on `strokes_impact` BEFORE it enters the
 * rank score (audit EC-1 / FID-1/FID-2). Stale scale-mixed v2 `par_scoring`
 * rows carry a physically-impossible |impact| up to ~42.5 strokes/round (a
 * to-par player value compared against a raw-stroke team average) and would
 * otherwise rank #1 over every real leak. No single per-round leak can exceed
 * a few strokes, so we clamp the magnitude here — a defensive guard that holds
 * even if a stale row slips past the v3 read-path filter. Display magnitudes
 * are untouched; only the ranking input is clamped.
 */
export const STROKES_IMPACT_CEILING = 8;

/** Clamp a raw strokes_impact to the ranking ceiling (magnitude only). */
export function cappedStrokesImpact(strokesImpact: number): number {
  const v = Math.abs(Number(strokesImpact));
  if (!Number.isFinite(v)) return 0;
  return Math.min(v, STROKES_IMPACT_CEILING);
}

/**
 * Coachability horizon → a gentle rank multiplier so two leaks of equal stroke
 * magnitude are ordered by how SOON a player can realistically close them
 * (domain doc §10: putting/wedge/bunker = weeks; iron striking = months;
 * driving distance = years). Reference is ~8 weeks (boost 1.0); a 4-week fix
 * floats up, a 24-week one sinks — clamped to [0.6, 1.5] so it only breaks
 * ties / nudges, never dominates the stroke value.
 */
const COACHABILITY_REFERENCE_WEEKS = 8;
const COACHABILITY_MIN = 0.6;
const COACHABILITY_MAX = 1.5;

export function coachabilityBoost(metric: string | undefined): number {
  if (!metric) return 1.0;
  const cfg = getCounterfactualConfig(metric);
  if (!cfg || !Number.isFinite(cfg.coachable_timeframe_weeks) || cfg.coachable_timeframe_weeks <= 0) {
    return 1.0;
  }
  const raw = COACHABILITY_REFERENCE_WEEKS / cfg.coachable_timeframe_weeks;
  return Math.min(COACHABILITY_MAX, Math.max(COACHABILITY_MIN, raw));
}

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
  /** Row priority. Drives the rank floor when strokes_impact rounds to 0.
   *  Optional for back-compat — absent is treated as 'low'.
   *  Consumed by Phase A2 (priorityFloorScore) — added here in A1 so A2 imports
   *  without a follow-up edit. */
  priority?: InsightPriority;
  /** From evidence.sample_n — observation count behind the metric. Optional;
   *  absent → no damping (treated as fully-sampled).
   *  Consumed by Phase A2 (sampleDamping) — added here in A1 so A2 imports
   *  without a follow-up edit. */
  sample_n?: number;
}

/**
 * Metrics whose `strokes_impact` is intentionally 0 / descriptive and must NOT
 * receive a priority rank floor — flooring them would let the par-scoring family
 * (par-4 carries a ×10 holes/round leverage) and the warmup opening-hole row
 * crowd out the actionable diagnostic feed. They keep their generator priority
 * for the Alert Center but rank by their honest (zero) impact in the main feed.
 * Per-engine phases that add a purely-descriptive metric extend this set.
 *
 * Consumed by Phase A: A2 (priorityFloorScore / sampleDamping) and A3
 * (scoreInsight rewrite). Exported in A1 so A2/A3 can import without a
 * follow-up edit here — intentionally unused until then (not dead code).
 */
export const EXEMPT_FROM_FLOOR: ReadonlyArray<string | RegExp> = [
  /^scoring_par_\d$/, // scoring_par_3 / _4 / _5 — descriptive standing rows
  'opening_hole_delta', // warmup-hole tax — keep priority, no impact floor
];

/** True when a metric is exempt from the rank floor (see EXEMPT_FROM_FLOOR). */
export function isFloorExemptMetric(metric: string | undefined): boolean {
  if (!metric) return false;
  return EXEMPT_FROM_FLOOR.some((p) =>
    typeof p === 'string' ? p === metric : p.test(metric),
  );
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
  // Rank by strokes-recoverable-SOON: equal-magnitude leaks order by how
  // quickly they're coachable (domain doc §10), so a coach's feed leads with
  // what this season's practice can actually move.
  const coachability = coachabilityBoost(insight.metric);
  // |strokes_impact| is clamped to STROKES_IMPACT_CEILING first so a stale
  // scale-mixed row (impossible 40-stroke leak) can never dominate the feed.
  return cappedStrokesImpact(insight.strokes_impact) * insight.confidence * w * boost * coachability;
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
