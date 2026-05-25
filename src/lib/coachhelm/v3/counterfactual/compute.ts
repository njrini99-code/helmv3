/**
 * v3 counterfactual computation.
 *
 * Master plan Part X. Pure function — no DB calls inside the core compute,
 * so consumers control whether they fetch the player's 30-day baseline
 * once and reuse it across many metrics, or per-metric.
 *
 * Discipline (per Part III locked decisions):
 *   - Auto-suppress when |strokes_saved_per_round| < 0.3.
 *   - Suppress when there's no positive gap to close (player is at or
 *     past PGA already on this metric).
 *   - Suppress when the metric isn't in our canonical lookup.
 *
 * The COUNTERFACTUAL_SUPPRESS_THRESHOLD is exposed in `types.ts` so
 * consumers can render an explicit "no projection — gap too small" line
 * if they want, instead of just hiding the row.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { Direction } from '@/components/golf/coachhelm/v3/StandingBar';
import {
  COUNTERFACTUAL_SUPPRESS_THRESHOLD,
  type CounterfactualProjection,
} from './types';
import { getCounterfactualConfig } from './lookup-tables';

export interface ComputeCounterfactualInput {
  metric_id: MetricId | string;
  /** Direction the metric is measured in (matches golf_metrics.direction). */
  direction: Direction;
  player_value: number;
  pga_value: number;
  /** Player's current 30-day scoring average. Null when not enough rounds. */
  player_30d_scoring_avg: number | null;
}

/**
 * Pure compute. Returns a projection in every case — `suppressed: true`
 * means the consumer should hide the row.
 */
export function computeCounterfactual(
  input: ComputeCounterfactualInput,
): CounterfactualProjection {
  const cfg = getCounterfactualConfig(input.metric_id);
  if (!cfg) {
    return zeroProjection(input.player_30d_scoring_avg, 'unknown_metric');
  }

  // Gap = how much the player would need to MOVE to reach PGA. For
  // higher_better metrics, positive gap means player needs to gain
  // value (pga - player). For lower_better, positive gap means player
  // needs to lose value (player - pga).
  const gap = input.direction === 'higher_better'
    ? input.pga_value - input.player_value
    : input.player_value - input.pga_value;

  // No gap (or player is past PGA) — no projection to show.
  if (gap <= 0) {
    return {
      ...zeroProjection(input.player_30d_scoring_avg, 'no_gap'),
      weeks_to_typical_close: cfg.coachable_timeframe_weeks,
    };
  }

  const strokes_saved_per_round = gap * cfg.stroke_impact_per_unit;

  if (strokes_saved_per_round < COUNTERFACTUAL_SUPPRESS_THRESHOLD) {
    return {
      current_baseline_score: input.player_30d_scoring_avg,
      projected_score_if_closed: null,
      strokes_saved_per_round,
      weeks_to_typical_close: cfg.coachable_timeframe_weeks,
      suppressed: true,
      suppress_reason: 'below_threshold',
    };
  }

  if (input.player_30d_scoring_avg === null) {
    return {
      current_baseline_score: null,
      projected_score_if_closed: null,
      strokes_saved_per_round,
      weeks_to_typical_close: cfg.coachable_timeframe_weeks,
      suppressed: true,
      suppress_reason: 'no_baseline',
    };
  }

  return {
    current_baseline_score: input.player_30d_scoring_avg,
    projected_score_if_closed: input.player_30d_scoring_avg - strokes_saved_per_round,
    strokes_saved_per_round,
    weeks_to_typical_close: cfg.coachable_timeframe_weeks,
    suppressed: false,
  };
}

function zeroProjection(
  baseline: number | null,
  reason: CounterfactualProjection['suppress_reason'],
): CounterfactualProjection {
  return {
    current_baseline_score: baseline,
    projected_score_if_closed: null,
    strokes_saved_per_round: 0,
    weeks_to_typical_close: 0,
    suppressed: true,
    suppress_reason: reason,
  };
}

/**
 * Format the secondary-line text per master plan Part X:
 *   "Closing this gap → 75.2 → 74.5 (≈4 wks)"
 *
 * Returns empty string when the projection is suppressed — caller can
 * use that as a truthiness check for "should we render this row?"
 */
export function formatCounterfactualLine(p: CounterfactualProjection): string {
  if (p.suppressed) return '';
  if (p.current_baseline_score === null || p.projected_score_if_closed === null) return '';
  const baseline = p.current_baseline_score.toFixed(1);
  const projected = p.projected_score_if_closed.toFixed(1);
  const weeks = Math.max(1, Math.round(p.weeks_to_typical_close));
  return `Closing this gap → ${baseline} → ${projected} (≈${weeks} wk${weeks === 1 ? '' : 's'})`;
}
