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

export interface CounterfactualConfig {
  /** Strokes-per-round impact per unit of player_value improvement. */
  stroke_impact_per_unit: number;
  /** Typical weeks to close a meaningful gap with focused work. */
  coachable_timeframe_weeks: number;
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
  //   3-5 ft  ~6 attempts/rd  → 0.06 strokes per pp
  //   5-10 ft ~3 attempts/rd  → 0.03
  //   10-15   ~2 attempts/rd  → 0.02
  //   15-25   ~1.5            → 0.015
  //   25+     ~1              → 0.01
  putts_made_3_5ft_pct:      { stroke_impact_per_unit: 0.06,  coachable_timeframe_weeks: 4 },
  putts_made_5_10ft_pct:     { stroke_impact_per_unit: 0.03,  coachable_timeframe_weeks: 6 },
  putts_made_10_15ft_pct:    { stroke_impact_per_unit: 0.02,  coachable_timeframe_weeks: 8 },
  putts_made_15_25ft_pct:    { stroke_impact_per_unit: 0.015, coachable_timeframe_weeks: 8 },
  putts_made_25_plus_ft_pct: { stroke_impact_per_unit: 0.01,  coachable_timeframe_weeks: 12 }, // mostly lag-distance

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
  scrambling_pct_rough:    { stroke_impact_per_unit: 0.04, coachable_timeframe_weeks: 6 },
  scrambling_pct_sand:     { stroke_impact_per_unit: 0.03, coachable_timeframe_weeks: 4 },
  scrambling_pct_fairway:  { stroke_impact_per_unit: 0.02, coachable_timeframe_weeks: 6 },

  // Course mgmt — research §4 + §6: each penalty avoided ≈ 1.5 strokes;
  // each double avoided ≈ 1.0 stroke.
  penalty_rate_per_round:  { stroke_impact_per_unit: 1.5, coachable_timeframe_weeks: 2 }, // decision-making, fast
  big_number_rate:         { stroke_impact_per_unit: 0.18, coachable_timeframe_weeks: 4 }, // pp of holes × ~1.0 stroke × 18 holes

  // Per-par scoring — direct: 1 stroke improvement on the per-par average
  // multiplied by holes/round of that par. Typical: 4 par-3s, 10 par-4s,
  // 4 par-5s on a par-72.
  scoring_par_3: { stroke_impact_per_unit: 4,  coachable_timeframe_weeks: 8 },
  scoring_par_4: { stroke_impact_per_unit: 10, coachable_timeframe_weeks: 12 },
  scoring_par_5: { stroke_impact_per_unit: 4,  coachable_timeframe_weeks: 8 },

  // GIR — each pp ≈ 0.18 holes/round × 0.5 strokes per GIR = ~0.09 strokes/pp
  gir_pct: { stroke_impact_per_unit: 0.09, coachable_timeframe_weeks: 12 },

  // Pressure + warmup
  practice_tournament_delta: { stroke_impact_per_unit: 1.0, coachable_timeframe_weeks: 16 }, // slow
  opening_hole_delta:        { stroke_impact_per_unit: 0.5, coachable_timeframe_weeks: 4 },  // routine work
};

export function getCounterfactualConfig(metricId: string): CounterfactualConfig | null {
  return (COUNTERFACTUAL_LOOKUP as Record<string, CounterfactualConfig | undefined>)[metricId] ?? null;
}
