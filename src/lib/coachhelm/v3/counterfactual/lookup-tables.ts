/**
 * v3 counterfactual lookup tables.
 *
 * For each canonical v3 metric, two values:
 *
 *   1. stroke_impact_per_unit
 *      How many strokes per round are saved if the player improves
 *      `player_value` by ONE unit (where "unit" matches the metric's
 *      stored unit — percent points, strokes, feet, count, etc.).
 *      Used to convert raw gaps into projected scoring impact.
 *
 *   2. coachable_timeframe_weeks
 *      Typical weeks of focused work to close a meaningful gap. Source:
 *      docs/v3-research-golf-domain.md §10 (Coachable vs Uncoachable).
 *      Used to set the "(≈N wks)" footer.
 *
 * Both values are estimates — every coach will quibble with the
 * specifics. The numbers below come from the research doc as the most
 * defensible starting point; refinement will happen as outcome
 * attribution (W35) feeds back which projections actually came true.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { COUNTERFACTUAL_MAX_STROKES_PER_ROUND } from './types';

export interface CounterfactualConfig {
  /** Strokes-per-round impact per unit of player_value improvement. */
  stroke_impact_per_unit: number;
  /** Typical weeks to close a meaningful gap with focused work. */
  coachable_timeframe_weeks: number;
  /**
   * Per-projection upper ceiling on strokes_saved_per_round (CF-1/CF-2).
   * No single-metric leak realistically saves more than this much per round.
   * Tightest on the high-leverage / slow-to-close metrics: the per-par
   * factor-10 family (`scoring_par_4`) and the pressure deltas, where the
   * raw `gap × factor` overstates a recoverable single-metric improvement.
   * Omitted → falls back to {@link COUNTERFACTUAL_MAX_STROKES_PER_ROUND}.
   */
  max_strokes_saved_per_round?: number;
  /**
   * The player-OWN per-round attempt rate that sizes this metric's impact
   * (DC-ATTEMPT-1). When set, computeCounterfactual (D5) uses
   *   strokes_saved = (gap_pp / 100) × player_attempts_per_round × value_per_unit
   * instead of the global `stroke_impact_per_unit`. Names a metric the caller
   * resolves from cache/standing:
   *   'sand_attempts_per_round'     → cache.sand_attempts / rounds_played
   *   'gir_misses_per_round'        → (greens_total − greens_hit) / rounds_played
   *   'approach_attempts_per_round' → shots in the bucket / rounds (generator-supplied)
   *   'putt_attempts_per_round'     → typical putts/round in the distance bucket
   *   'holes_per_round'             → par-type hole count (4 par-3s / 10 par-4s / 4 par-5s)
   */
  attempt_metric?:
    | 'sand_attempts_per_round'
    | 'gir_misses_per_round'
    | 'approach_attempts_per_round'
    | 'putt_attempts_per_round'
    | 'holes_per_round';
  /** Strokes saved per successful attempt at full conversion (paired with attempt_metric). */
  value_per_unit?: number;
}

export const COUNTERFACTUAL_LOOKUP: Record<MetricId, CounterfactualConfig> = {
  // SG — direct 1:1 mapping (1 stroke gained per round = 1 stroke on score).
  sg_total:          { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 12 },
  sg_ott:            { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 24 }, // driver gains slow
  sg_approach:       { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 16 }, // iron technique
  sg_around_green:   { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 6  },
  sg_putting:        { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 4  },

  // Putt make % — each percent point ≈ N/100 strokes saved per round where N
  // is the typical attempts/round in that bucket. Research doc §3-4:
  //   3-5 ft  ~6 attempts/rd  → 0.10 (see note below)
  //   5-10 ft ~3 attempts/rd  → 0.03
  //   10-15   ~2 attempts/rd  → 0.02
  //   15-25   ~1.5            → 0.015
  //   25+     ~1              → 0.01
  // 3-5 ft is the most frequent putt distance (~6 attempts/rd) AND the most
  // makeable (Tour ~90%), so a missed pp here is the single highest-leverage,
  // fastest-to-fix putting gap. Bumped 0.06→0.10 so a large short-putt gap
  // floors to `high` (the counterfactual ceiling + 0.3 floor still bound it).
  putts_made_3_5ft_pct:      { stroke_impact_per_unit: 0.10,  coachable_timeframe_weeks: 4,  attempt_metric: 'putt_attempts_per_round', value_per_unit: 1.0 },
  putts_made_5_10ft_pct:     { stroke_impact_per_unit: 0.03,  coachable_timeframe_weeks: 6,  attempt_metric: 'putt_attempts_per_round', value_per_unit: 1.0 },
  putts_made_10_15ft_pct:    { stroke_impact_per_unit: 0.02,  coachable_timeframe_weeks: 8,  attempt_metric: 'putt_attempts_per_round', value_per_unit: 1.0 },
  putts_made_15_25ft_pct:    { stroke_impact_per_unit: 0.015, coachable_timeframe_weeks: 8,  attempt_metric: 'putt_attempts_per_round', value_per_unit: 1.0 },
  putts_made_25_plus_ft_pct: { stroke_impact_per_unit: 0.01,  coachable_timeframe_weeks: 12, attempt_metric: 'putt_attempts_per_round', value_per_unit: 1.0 }, // mostly lag-distance

  // Putt miss bias — bias direction itself doesn't save strokes; it's
  // diagnostic. Stroke impact = 0 means counterfactual is always suppressed
  // for these metrics (the data is useful for drill selection, not
  // projection). Coachable timeframe present for completeness.
  putt_miss_bias_high_pct:   { stroke_impact_per_unit: 0, coachable_timeframe_weeks: 4 },
  putt_miss_bias_low_pct:    { stroke_impact_per_unit: 0, coachable_timeframe_weeks: 4 },
  putt_miss_bias_left_pct:   { stroke_impact_per_unit: 0, coachable_timeframe_weeks: 6 },
  putt_miss_bias_right_pct:  { stroke_impact_per_unit: 0, coachable_timeframe_weeks: 6 },

  // Approach proximity — research doc §4: every 5 ft closer ≈ 10-15 pp of
  // conversion in the 5-15 ft zone. Approximate: each foot closer ≈ 0.04
  // strokes/round contribution at typical 12 approaches/round.
  approach_proximity_50_125ft:    { stroke_impact_per_unit: 0.05, coachable_timeframe_weeks: 6 },
  approach_proximity_125_175ft:   { stroke_impact_per_unit: 0.03, coachable_timeframe_weeks: 12 },
  approach_proximity_175_plus_ft: { stroke_impact_per_unit: 0.02, coachable_timeframe_weeks: 16 },

  // Scrambling — each percent point improvement ≈ N/100 strokes/round where
  // N is attempts/round from that lie. Research: typical 8-10 attempts/rd
  // total, ~3 from sand, ~4 from rough.
  scrambling_pct_rough:    { stroke_impact_per_unit: 0.04, coachable_timeframe_weeks: 6, attempt_metric: 'approach_attempts_per_round', value_per_unit: 0.85 },
  // NOTE: the old global 0.03 constant baked in a Tour-average sand-attempt rate and overstated
  // a women's player's impact to a fabricated 1.5 strokes/round. D5 sizes this off the player's
  // OWN sand_attempts_per_round so the projection stays grounded for low-volume bunker players.
  scrambling_pct_sand:     { stroke_impact_per_unit: 0.03, coachable_timeframe_weeks: 4, attempt_metric: 'sand_attempts_per_round', value_per_unit: 0.85 },
  scrambling_pct_fairway:  { stroke_impact_per_unit: 0.02, coachable_timeframe_weeks: 6, attempt_metric: 'approach_attempts_per_round', value_per_unit: 0.85 },

  // Course mgmt — research §4 + §6: each penalty avoided ≈ 1.5 strokes;
  // each double avoided ≈ 1.0 stroke.
  penalty_rate_per_round:  { stroke_impact_per_unit: 1.5, coachable_timeframe_weeks: 2 }, // decision-making, fast
  big_number_rate:         { stroke_impact_per_unit: 0.18, coachable_timeframe_weeks: 4 }, // pp of holes × ~1.0 stroke × 18 holes

  // Per-par scoring — direct: 1 stroke improvement on the per-par average
  // multiplied by holes/round of that par. Typical: 4 par-3s, 10 par-4s,
  // 4 par-5s on a par-72. The factor-10 par-4 family dominates the feed when
  // gapped to a full target, so it carries the tightest ceiling (CF-1/CF-2):
  // per-par is descriptive — a single par-type can't realistically reclaim
  // the whole-round gap on its own.
  scoring_par_3: { stroke_impact_per_unit: 4,  coachable_timeframe_weeks: 8,  max_strokes_saved_per_round: 1.0, attempt_metric: 'holes_per_round', value_per_unit: 1.0 },
  scoring_par_4: { stroke_impact_per_unit: 10, coachable_timeframe_weeks: 12, max_strokes_saved_per_round: 1.5, attempt_metric: 'holes_per_round', value_per_unit: 1.0 },
  scoring_par_5: { stroke_impact_per_unit: 4,  coachable_timeframe_weeks: 8,  max_strokes_saved_per_round: 1.0, attempt_metric: 'holes_per_round', value_per_unit: 1.0 },

  // GIR — each pp ≈ 0.18 holes/round × 0.5 strokes per GIR = ~0.09 strokes/pp
  gir_pct: { stroke_impact_per_unit: 0.09, coachable_timeframe_weeks: 12, attempt_metric: 'gir_misses_per_round', value_per_unit: 0.5 },

  // Pressure + warmup
  // Pressure gap is "typical / slow-to-close" (domain doc §9-10) — only a
  // fraction of the above-reference gap is realistically recoverable, so the
  // per-unit factor carries a <1.0 closability discount rather than projecting
  // the full delta as strokes a player can simply reclaim.
  // Pressure gap is "slow-to-close" (domain doc §9-10), so the ceiling is tight
  // even after the per-unit closability discount (CF-1/CF-2): a large above-
  // reference gap can't be reclaimed as a clean single-metric stroke recovery.
  practice_tournament_delta: { stroke_impact_per_unit: 0.5, coachable_timeframe_weeks: 16, max_strokes_saved_per_round: 1.0 }, // slow, partial close
  opening_hole_delta:        { stroke_impact_per_unit: 0.5, coachable_timeframe_weeks: 4 },  // routine work
};

export function getCounterfactualConfig(metricId: string): CounterfactualConfig | null {
  return (COUNTERFACTUAL_LOOKUP as Record<string, CounterfactualConfig | undefined>)[metricId] ?? null;
}

/**
 * Effective per-projection ceiling on strokes_saved_per_round (CF-1/CF-2):
 * the metric's own `max_strokes_saved_per_round` when set, else the global
 * {@link COUNTERFACTUAL_MAX_STROKES_PER_ROUND} default.
 */
export function getCounterfactualCeiling(cfg: CounterfactualConfig): number {
  return cfg.max_strokes_saved_per_round ?? COUNTERFACTUAL_MAX_STROKES_PER_ROUND;
}

/**
 * Per-metric plausibility bounds on a COHORT `level_avg` before it's allowed
 * to become a counterfactual target (DC-COHORT-1).
 *
 * The cohort baseline is the app-population average (V1: no real division
 * field, heavily synthetic demo data — domain doc §9 calibration gate). On
 * the current prod snapshot it produces physically-implausible targets
 * (`sg_putting` −3.94, sand-save 14.8%, 50-125yd proximity *better* than
 * Tour). Gapping a player to a target that bad/good either fabricates a
 * negative gap (player "already past cohort" → silent suppression) or, for
 * a too-good cohort, projects a Tour-beating target.
 *
 * When a cohort value falls outside its plausible band we REJECT it and fall
 * back to `pga_value` (Tour ceiling) — the pre-cohort behavior — rather than
 * trust a synthetic artifact. The existing 0.3 lower suppression and the
 * "no positive gap" rule still apply on top of whichever target survives.
 *
 *   min / max are in the metric's stored unit (strokes, percent points, feet).
 *   `not_better_than_pga: true` additionally rejects a cohort that is at or
 *   beyond the Tour value (a cohort of college players cannot out-perform the
 *   Tour on a skill metric — that's a data artifact, not a realistic target).
 */
export interface CohortPlausibilityBound {
  /** Lower bound (inclusive) in the metric's stored unit. */
  min?: number;
  /** Upper bound (inclusive) in the metric's stored unit. */
  max?: number;
  /** Reject when the cohort is at/past the Tour value (impossible for amateurs). */
  not_better_than_pga?: boolean;
}

export const COHORT_PLAUSIBILITY_BOUNDS: Partial<Record<MetricId, CohortPlausibilityBound>> = {
  // Strokes Gained are vs a scratch/Tour baseline; a college cohort sits below
  // Tour but a −1.0+ SG cohort is a synthetic artifact, not a target to chase.
  sg_total:        { min: -1.0, not_better_than_pga: true },
  sg_ott:          { min: -1.0, not_better_than_pga: true },
  sg_approach:     { min: -1.0, not_better_than_pga: true },
  sg_around_green: { min: -1.0, not_better_than_pga: true },
  sg_putting:      { min: -1.0, not_better_than_pga: true },

  // Scrambling — college ~40% (domain doc §174); a sub-25% cohort is
  // implausible and would make almost any real player look "above cohort."
  scrambling_pct_rough:   { min: 25, not_better_than_pga: true },
  scrambling_pct_sand:    { min: 25, not_better_than_pga: true },
  scrambling_pct_fairway: { min: 25, not_better_than_pga: true },

  // Approach proximity (lower_better, feet) — a college cohort cannot be
  // tighter than the Tour, so reject any cohort better than (less than) PGA.
  approach_proximity_50_125ft:    { not_better_than_pga: true },
  approach_proximity_125_175ft:   { not_better_than_pga: true },
  approach_proximity_175_plus_ft: { not_better_than_pga: true },
};

export function getCohortPlausibilityBound(metricId: string): CohortPlausibilityBound | null {
  return (COHORT_PLAUSIBILITY_BOUNDS as Record<string, CohortPlausibilityBound | undefined>)[metricId] ?? null;
}
