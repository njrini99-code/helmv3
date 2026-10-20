/**
 * A part of the game can never be worth more than its whole strokes-gained
 * category (wave-6 review, 2026-10-18).
 *
 * A standing row that has no attempts-per-round rate falls back to the fixed
 * `gap × stroke_impact_per_unit` rate in `compute.ts`. That rate can claim more
 * than the whole category: a 17-point 3–5 ft make-rate gap read as 1.7
 * strokes a round while all of the player's putting was 0.63 behind the Tour.
 * Without the player's own attempts, the honest bound is what the category is
 * behind, so the projection is capped there. A projection sized by real
 * attempts (`attempts_used`) is left alone. A part can still sit further
 * behind than its category when other parts are ahead, so the cap is only a
 * stand-in for missing attempts.
 *
 * Pure. Used by the Fairway and Clubhouse Standing views, so they agree.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { COUNTERFACTUAL_SUPPRESS_THRESHOLD, type CounterfactualProjection } from './types';

/** The strokes-gained category a part-of-game metric adds up to; null for SG itself and for metrics with no single parent. */
export function parentSgMetric(metricId: string): MetricId | null {
  if (metricId.startsWith('putts_made_')) return 'sg_putting';
  if (metricId.startsWith('scrambling_')) return 'sg_around_green';
  if (metricId.startsWith('approach_proximity_') || metricId === 'gir_pct') return 'sg_approach';
  return null;
}

/**
 * How many strokes a round an SG category is behind the Tour (0 when level or
 * ahead). Null when there is no row, the Tour is not comparable, or a value is
 * not a number, so there is nothing to cap against.
 */
export function sgBehindTour(
  sg: { player_value: number; pga_value: number; pga_omitted?: boolean } | null | undefined,
): number | null {
  if (!sg || sg.pga_omitted) return null;
  if (!Number.isFinite(sg.player_value) || !Number.isFinite(sg.pga_value)) return null;
  return Math.max(0, sg.pga_value - sg.player_value);
}

/**
 * `p` capped at `behind`, the strokes its SG category is behind the Tour. The
 * cap applies only when the projection was not sized by the player's own
 * attempts. A capped projection is `clamped` (a ceiling, not a forecast). A cap
 * below the 0.3-stroke noise floor suppresses the projection.
 */
export function capByParentSg(p: CounterfactualProjection, behind: number | null): CounterfactualProjection {
  if (p.suppressed || p.attempts_used != null || behind == null || p.strokes_saved_per_round <= behind) return p;
  if (behind < COUNTERFACTUAL_SUPPRESS_THRESHOLD) {
    return { ...p, strokes_saved_per_round: behind, projected_score_if_closed: null, suppressed: true, suppress_reason: 'below_threshold' };
  }
  return {
    ...p,
    strokes_saved_per_round: behind,
    projected_score_if_closed: p.current_baseline_score != null ? p.current_baseline_score - behind : null,
    clamped: true,
  };
}
