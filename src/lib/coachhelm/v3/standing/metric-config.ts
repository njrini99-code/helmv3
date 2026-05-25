/**
 * v3 metric → display config lookup.
 *
 * StandingBar needs `direction` (higher_better / lower_better) and `unit`
 * for each metric. These are stored in `public.golf_metrics` but loading
 * from DB on every render is wasteful. This module is a TS mirror of
 * the 28 canonical metrics' direction + unit + display label + a sensible
 * default scale for the bar visual.
 *
 * Used by:
 *   - W15 EvidencePanel (coach insight surfaces) to render <StandingBar>
 *     when `evidence.standing` exists.
 *   - W16 player surfaces.
 *   - W17 counterfactual (direction informs the sign of strokes-saved).
 *
 * MUST stay in sync with the SQL seed in
 * supabase/migrations/20260524190200_v3_golf_metrics_seed.sql and the
 * TS registry in src/lib/coachhelm/v3/metrics/registry.ts. A future CI
 * parity check should compare the three sources.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { Direction, Unit } from '@/components/golf/coachhelm/v3/StandingBar';

export interface MetricRenderConfig {
  direction: Direction;
  unit: Unit;
  display_label: string;
  /** Default scale for the bar visual. Override at the consumer site if data demands. */
  default_scale: { min: number; max: number };
}

export const METRIC_RENDER_CONFIG: Record<MetricId, MetricRenderConfig> = {
  // Strokes Gained — zero-sum, scale [-2, 2] covers Tour leader to struggling player
  sg_total:           { direction: 'higher_better', unit: 'strokes', display_label: 'SG: Total',            default_scale: { min: -2,  max: 2   } },
  sg_ott:             { direction: 'higher_better', unit: 'strokes', display_label: 'SG: Off the Tee',      default_scale: { min: -1.5, max: 1.5 } },
  sg_approach:        { direction: 'higher_better', unit: 'strokes', display_label: 'SG: Approach',         default_scale: { min: -1.5, max: 1.5 } },
  sg_around_green:    { direction: 'higher_better', unit: 'strokes', display_label: 'SG: Around the Green', default_scale: { min: -1,   max: 1   } },
  sg_putting:         { direction: 'higher_better', unit: 'strokes', display_label: 'SG: Putting',          default_scale: { min: -1.5, max: 1.5 } },

  // Putt make % by distance
  putts_made_3_5ft_pct:        { direction: 'higher_better', unit: 'percent', display_label: 'Putts Made 3-5 ft',   default_scale: { min: 60, max: 100 } },
  putts_made_5_10ft_pct:       { direction: 'higher_better', unit: 'percent', display_label: 'Putts Made 5-10 ft',  default_scale: { min: 30, max: 80  } },
  putts_made_10_15ft_pct:      { direction: 'higher_better', unit: 'percent', display_label: 'Putts Made 10-15 ft', default_scale: { min: 10, max: 60  } },
  putts_made_15_25ft_pct:      { direction: 'higher_better', unit: 'percent', display_label: 'Putts Made 15-25 ft', default_scale: { min: 0,  max: 30  } },
  putts_made_25_plus_ft_pct:   { direction: 'higher_better', unit: 'percent', display_label: 'Putts Made 25+ ft',   default_scale: { min: 0,  max: 15  } },

  // Putt miss bias — lower is better; scale 0-100% of misses
  putt_miss_bias_high_pct:   { direction: 'lower_better', unit: 'percent', display_label: 'Putt Miss High %',  default_scale: { min: 0, max: 60 } },
  putt_miss_bias_low_pct:    { direction: 'lower_better', unit: 'percent', display_label: 'Putt Miss Low %',   default_scale: { min: 0, max: 60 } },
  putt_miss_bias_left_pct:   { direction: 'lower_better', unit: 'percent', display_label: 'Putt Miss Left %',  default_scale: { min: 0, max: 60 } },
  putt_miss_bias_right_pct:  { direction: 'lower_better', unit: 'percent', display_label: 'Putt Miss Right %', default_scale: { min: 0, max: 60 } },

  // Approach proximity — lower is better (closer to hole), feet
  approach_proximity_50_125ft:   { direction: 'lower_better', unit: 'feet', display_label: 'Approach Proximity 50-125 yd',  default_scale: { min: 10, max: 50 } },
  approach_proximity_125_175ft:  { direction: 'lower_better', unit: 'feet', display_label: 'Approach Proximity 125-175 yd', default_scale: { min: 20, max: 60 } },
  approach_proximity_175_plus_ft:{ direction: 'lower_better', unit: 'feet', display_label: 'Approach Proximity 175+ yd',    default_scale: { min: 30, max: 80 } },

  // Scrambling — higher is better
  scrambling_pct_rough:   { direction: 'higher_better', unit: 'percent', display_label: 'Scrambling % Rough',   default_scale: { min: 20, max: 70 } },
  scrambling_pct_sand:    { direction: 'higher_better', unit: 'percent', display_label: 'Scrambling % Sand',    default_scale: { min: 10, max: 70 } },
  scrambling_pct_fairway: { direction: 'higher_better', unit: 'percent', display_label: 'Scrambling % Fairway', default_scale: { min: 30, max: 80 } },

  // Course management — lower is better
  penalty_rate_per_round: { direction: 'lower_better', unit: 'count',   display_label: 'Penalties per Round',         default_scale: { min: 0, max: 3 } },
  big_number_rate:        { direction: 'lower_better', unit: 'percent', display_label: 'Double Bogey-or-Worse Rate',  default_scale: { min: 0, max: 20 } },

  // Per-par scoring — lower is better, strokes to par
  scoring_par_3: { direction: 'lower_better', unit: 'strokes', display_label: 'Par 3 Scoring', default_scale: { min: 2.8, max: 4.2 } },
  scoring_par_4: { direction: 'lower_better', unit: 'strokes', display_label: 'Par 4 Scoring', default_scale: { min: 3.7, max: 5.0 } },
  scoring_par_5: { direction: 'lower_better', unit: 'strokes', display_label: 'Par 5 Scoring', default_scale: { min: 4.2, max: 5.8 } },

  // Table stakes
  gir_pct: { direction: 'higher_better', unit: 'percent', display_label: 'GIR %', default_scale: { min: 30, max: 80 } },

  // Pressure + warmup — lower is better
  practice_tournament_delta: { direction: 'lower_better', unit: 'strokes', display_label: 'Practice vs Tournament Delta', default_scale: { min: -1, max: 5  } },
  opening_hole_delta:        { direction: 'lower_better', unit: 'strokes', display_label: 'Opening Hole Delta',           default_scale: { min: -0.5, max: 1.5 } },
};

/**
 * Type-safe lookup. Returns null when the metric_id isn't in the canonical
 * registry (e.g., from a v2 evidence with a custom metric string).
 */
export function getMetricRenderConfig(metricId: string): MetricRenderConfig | null {
  return (METRIC_RENDER_CONFIG as Record<string, MetricRenderConfig | undefined>)[metricId] ?? null;
}
