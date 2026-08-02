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
import { bootstrapFromDb, calibrateConfidence } from '@/lib/coachhelm/v2/reasoning/confidence-calibrator';

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

/**
 * Priority → rank floor. Used ONLY when |strokes_impact| rounds to 0 so the
 * 176/232 live insights that legitimately carry no per-round stroke delta
 * (high-confidence diagnostics like approach proximity, putt make-rates) are
 * still orderable instead of tying at score 0 and falling back to recency.
 * urgent 4 / high 3 / medium 2 / low 1 — strictly monotonic, never 0.
 */
const PRIORITY_FLOOR: Record<NonNullable<RankableInsight['priority']>, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function priorityFloorScore(
  priority: RankableInsight['priority'],
): number {
  return PRIORITY_FLOOR[priority ?? 'low'];
}

/**
 * Sample-size damping ∈ (0, 1]. A 5%-make-rate off a thin lifetime sample must
 * not out-rank a deep-sample leak just because its confidence factor reads high.
 * `sqrt(sample_n / DAMP_REF_N)` clamped to 1 — undamped at the reference depth,
 * gentler than linear so a 5-round row keeps ~65% weight (not punished to near
 * zero). A RECORDED zero/negative count is degenerate-thin → DAMP_MIN.
 *
 * ABSENT / non-finite sample → NEUTRAL (1.0). Damping must down-rank
 * KNOWN-thin samples; a MISSING sample count is not evidence of thinness, so we
 * don't penalize it (consistent with weight/goalBoost defaulting to 1.0). A real
 * 2-stroke leak must not be quartered merely for lacking sample_n.
 */
export const DAMP_REF_N = 12;
export const DAMP_MIN = 0.25;

export function sampleDamping(sample_n: number | null | undefined): number {
  // Absent / not-recorded → NEUTRAL (1.0).
  if (sample_n === undefined || sample_n === null) return 1;
  const n = Number(sample_n);
  if (!Number.isFinite(n)) return 1;            // garbage → neutral
  if (n <= 0) return DAMP_MIN;                  // a RECORDED zero/negative = degenerate-thin
  return Math.min(1, Math.max(DAMP_MIN, Math.sqrt(n / DAMP_REF_N)));
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

/**
 * Large additive band that guarantees a `priority:'urgent'` insight outranks
 * EVERY non-urgent one regardless of impact, while two urgent rows still order
 * by their underlying composite. Sits above the max achievable composite
 * (ceiling 8 × conf 1 × coach_weight 2.0 × goalBoost 2.0 × coachability 1.5
 * × damping 1 ≈ 48), so 1000 is an unreachable separator — a single comparator
 * still sorts correctly. Assumes upstream-clamped confidence∈[0,1] and
 * coach_weight≤2 (EMA-clamped in nextWeight); 1000 leaves a ~20× margin.
 */
export const URGENT_SHORT_CIRCUIT = 1000;

/**
 * The priority RANK FLOOR (1–4) and a real per-round strokes impact live on
 * different scales: impacts are clamped to ≤8 strokes (realistically <2/round),
 * while the floor would otherwise sit at 1–4 and OUTRANK a genuine 1.2-stroke
 * leak (a medium floor of 2 beating a 1.2-stroke leak is exactly the bug this
 * prevents). FLOOR_SCALE pushes the floor band strictly below any real impact so
 * the floor only ORDERS the zero-impact diagnostics among themselves (its sole
 * job), honoring contract #2: a real impact above ~0.05 strokes/round always
 * ranks on its magnitude, never the floor (the floor band tops out ~0.018, so a
 * sub-0.05-stroke leak with weak multipliers can tie/lose — acceptable). Relative
 * order of floored rows is unchanged (every floor scaled equally), so the rescue
 * of buried high-confidence diagnostics still works.
 */
export const FLOOR_SCALE = 0.001;

/**
 * Pure scoring fn — the SINGLE ranking contract for every read surface
 * (Hub single-pick, player feed, coach feed, round takeaway, player CoachHelm
 * dashboard). Returns a non-negative rank score.
 *
 *   composite = magnitudeTerm × confidence × coach_weight × goalBoost
 *               × coachability × sampleDamping
 *
 * - magnitudeTerm: the real |strokes_impact| (ceiling-clamped) when it rounds
 *   to a non-zero per-round value; otherwise the priority RANK FLOOR
 *   (urgent 4 / high 3 / medium 2 / low 1, scaled by FLOOR_SCALE to sit strictly
 *   below any real impact) so a zero-impact diagnostic is still orderable instead
 *   of tying at 0 and falling back to recency. Floor-exempt
 *   metrics (scoring_par_*, opening_hole_delta) get NO floor — they keep their
 *   priority for the Alert Center but rank on their honest (zero) impact, so the
 *   descriptive engines never crowd the actionable feed.
 * - urgent short-circuit: an urgent row is lifted above the whole non-urgent
 *   band so a small-but-urgent leak (e.g. a three-putt chain) always leads.
 */
export function scoreInsight(
  insight: RankableInsight,
  weights: CoachWeights,
  activeGoals: Goal[] = [],
): number {
  const w = weights[insight.insight_type] ?? 1.0;
  const boost = computeGoalBoost(insight, activeGoals);
  const coachability = coachabilityBoost(insight.metric);
  const damping = sampleDamping(insight.sample_n);
  // Clamp to [0,1]: a no-op for valid data, but guards the urgent separator if
  // confidence is ever stored as a 0–100 percentage. x=0→0, x=1.5→1, x=NaN→0.
  const confidence = Math.max(0, Math.min(1, Number(insight.confidence) || 0));

  // Real per-round leak → rank on the (clamped) magnitude. Rounds to 0 → use the
  // priority floor UNLESS the metric is exempt (descriptive: keep honest 0).
  const capped = cappedStrokesImpact(insight.strokes_impact);
  const magnitudeTerm =
    // rounds to 2dp — a sub-0.005 strokes/round leak is effectively zero and
    // falls to the floor band.
    Math.round(capped * 100) / 100 > 0
      ? capped
      : isFloorExemptMetric(insight.metric)
        ? 0
        : priorityFloorScore(insight.priority) * FLOOR_SCALE;

  const composite = magnitudeTerm * confidence * w * boost * coachability * damping;

  // Urgent always leads the feed — lift above the non-urgent band, preserving
  // intra-urgent order by adding the composite on top of the separator.
  if (insight.priority === 'urgent') {
    return URGENT_SHORT_CIRCUIT + composite;
  }
  return composite;
}

/**
 * Async version of scoreInsight that applies calibration to the confidence value.
 * Loads calibration buckets from the database and applies them to correct the
 * raw confidence before computing the rank score.
 *
 * This is the preferred entry point for new code. Falls back to raw confidence
 * if calibration load fails.
 */
export async function scoreInsightWithCalibration(
  insight: RankableInsight,
  weights: CoachWeights,
  sb: Sb,
  activeGoals: Goal[] = [],
): Promise<number> {
  // Load calibration record for this insight type. The initializer IS the
  // fallback: if bootstrapFromDb throws, we keep the raw confidence. The catch
  // used to re-assign that same value, which made the initializer dead code
  // (CodeQL "useless assignment to local variable", alert 549) and forced an
  // unused `_err` binding past the no-unused-vars lint.
  let calibratedConfidence = insight.confidence;
  try {
    const record = await bootstrapFromDb(sb, insight.insight_type);
    // Apply calibration to the raw confidence value
    calibratedConfidence = calibrateConfidence(insight.confidence, record);
  } catch {
    // Calibration unavailable — keep the raw confidence assigned above.
  }

  // Compute score with calibrated confidence
  const insightWithCalibratedConfidence: RankableInsight = {
    ...insight,
    confidence: calibratedConfidence,
  };

  return scoreInsight(insightWithCalibratedConfidence, weights, activeGoals);
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

