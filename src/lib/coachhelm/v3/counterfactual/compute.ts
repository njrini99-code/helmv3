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
import {
  getCounterfactualCeiling,
  getCounterfactualConfig,
  getCohortPlausibilityBound,
} from './lookup-tables';
import { cohortAnchor, type CohortGender } from './cohort-baselines';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

export interface ComputeCounterfactualInput {
  metric_id: MetricId | string;
  /** Direction the metric is measured in (matches golf_metrics.direction). */
  direction: Direction;
  player_value: number;
  pga_value: number;
  /** Player's current 30-day scoring average. Null when not enough rounds. */
  player_30d_scoring_avg: number | null;
  /**
   * College/division COHORT baseline for this metric (golf_player_standing.level_avg).
   * When present + finite this is the PRIMARY realistic target the gap is measured
   * to (domain doc §349: college-primary, Tour-ceiling) — it stops overstating
   * every elite-amateur weakness. Falls back to `pga_value` (Tour ceiling) when
   * null, so the engine is unchanged until the cohort RPC populates `level_avg`.
   */
  cohort_value?: number | null;
  /** Player's cohort gender — selects the per-gender anchor (DC-GENDER-1). */
  cohort_gender?: CohortGender;
  /**
   * Player's OWN per-round attempt rate for this metric (DC-ATTEMPT-1). When
   * the metric has an `attempt_metric` and this is finite + > 0, impact is
   * sized off it instead of the global `stroke_impact_per_unit`.
   */
  player_attempts_per_round?: number | null;
  /**
   * Insight confidence score (DC-CONF-1). When below 0.4 the formatter
   * softens the verb and widens the projected range so a thin-sample claim
   * doesn't read as a precise promise. Omitting this field defaults to 'high'.
   */
  confidence?: number;
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

  // Target = the realistic baseline the gap is measured to: the college/division
  // COHORT average when available (domain doc §349 college-primary), else the
  // Tour value as a fallback ceiling. Until the cohort RPC populates level_avg
  // this is exactly the old PGA-gap behavior.
  //
  // DC-COHORT-1: only trust the cohort when it passes per-metric plausibility
  // bounds. The V1 cohort is the app-population average over heavily-synthetic
  // demo data; an implausible value (e.g. sg_putting −3.94, sand-save 14.8%,
  // proximity better than Tour) is a data artifact, not a target. Reject it and
  // fall back to pga_value rather than gap to a fabricated baseline.
  const cohortUsable =
    input.cohort_value != null &&
    Number.isFinite(input.cohort_value) &&
    isCohortPlausible(input.metric_id, input.cohort_value, input.direction, input.pga_value);
  // Target priority (DC-COHORT-1 → DC-GENDER-1): a plausible cohort, else the
  // per-gender anchor (women's college target), else the Tour pga_value. The
  // anchor is the controlled replacement for the synthetic single-value cohort.
  const anchor = input.cohort_gender
    ? cohortAnchor(input.metric_id, input.cohort_gender)
    : null;
  const target = cohortUsable
    ? (input.cohort_value as number)
    : anchor != null
      ? anchor
      : input.pga_value;

  // Gap = how much the player would need to MOVE to reach the target. For
  // higher_better metrics, positive gap means player needs to gain value
  // (target - player). For lower_better, positive gap means player needs to
  // lose value (player - target).
  const gap = input.direction === 'higher_better'
    ? target - input.player_value
    : input.player_value - target;

  // No gap (or player is past PGA) — no projection to show.
  if (gap <= 0) {
    return {
      ...zeroProjection(input.player_30d_scoring_avg, 'no_gap'),
      weeks_to_typical_close: cfg.coachable_timeframe_weeks,
    };
  }

  // DC-ATTEMPT-1: size impact off the player's OWN attempt rate when the metric
  // declares an attempt_metric and the caller supplied a real rate. Otherwise
  // keep the legacy gap × stroke_impact_per_unit (SG, deltas, no-attempts callers).
  // For percent metrics the gap is in pp → /100; for strokes-unit metrics
  // (par-type uses holes_per_round) the gap is already in strokes → no /100.
  const attempts = input.player_attempts_per_round;
  const useAttemptRate =
    cfg.attempt_metric != null &&
    cfg.value_per_unit != null &&
    attempts != null &&
    Number.isFinite(attempts) &&
    attempts > 0;
  const pctDivisor = getMetricRenderConfig(input.metric_id)?.unit === 'percent' ? 100 : 1;
  const raw_strokes_saved_per_round = useAttemptRate
    ? (gap / pctDivisor) * (attempts as number) * (cfg.value_per_unit as number)
    : gap * cfg.stroke_impact_per_unit;

  // CF-1/CF-2: clamp each projection to a per-metric ceiling. No single-metric
  // leak realistically saves more than ~2.5 strokes/round (tighter on the
  // factor-10 par-scoring family and the slow-to-close pressure deltas), so a
  // large gap × factor is treated as descriptive — capped before it ranks as a
  // double-digit "saves N strokes/round" claim.
  const ceiling = getCounterfactualCeiling(cfg);
  const clamped = raw_strokes_saved_per_round > ceiling;
  const strokes_saved_per_round = clamped ? ceiling : raw_strokes_saved_per_round;

  if (strokes_saved_per_round < COUNTERFACTUAL_SUPPRESS_THRESHOLD) {
    return {
      current_baseline_score: input.player_30d_scoring_avg,
      projected_score_if_closed: null,
      strokes_saved_per_round,
      weeks_to_typical_close: cfg.coachable_timeframe_weeks,
      suppressed: true,
      suppress_reason: 'below_threshold',
      attempts_used: useAttemptRate ? (attempts as number) : null,
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
      clamped,
      attempts_used: useAttemptRate ? (attempts as number) : null,
      confidence_band: bandFor(input.confidence),
    };
  }

  return {
    current_baseline_score: input.player_30d_scoring_avg,
    projected_score_if_closed: input.player_30d_scoring_avg - strokes_saved_per_round,
    strokes_saved_per_round,
    weeks_to_typical_close: cfg.coachable_timeframe_weeks,
    suppressed: false,
    clamped,
    attempts_used: useAttemptRate ? (attempts as number) : null,
    confidence_band: bandFor(input.confidence),
  };
}

/**
 * DC-COHORT-1: is a cohort `level_avg` plausible enough to be a counterfactual
 * target? Rejects out-of-band cohort values (synthetic-data artifacts) so the
 * gap falls back to the Tour `pga_value` instead of an impossible baseline.
 * Returns true (cohort usable) for metrics with no declared bounds.
 */
function isCohortPlausible(
  metricId: string,
  cohortValue: number,
  direction: Direction,
  pgaValue: number,
): boolean {
  const bound = getCohortPlausibilityBound(metricId);
  if (!bound) return true;

  if (bound.min != null && cohortValue < bound.min) return false;
  if (bound.max != null && cohortValue > bound.max) return false;

  // A college cohort cannot be at/past the Tour on a skill metric — for
  // higher_better that's cohort >= pga, for lower_better that's cohort <= pga.
  if (bound.not_better_than_pga) {
    const cohortBeatsPga = direction === 'higher_better'
      ? cohortValue >= pgaValue
      : cohortValue <= pgaValue;
    if (cohortBeatsPga) return false;
  }

  return true;
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
 * DC-CONF-1: map a raw confidence score to a band used by the formatter.
 * Null / non-finite → 'high' (safe default; callers that don't supply
 * confidence get the unchanged precise copy).
 */
function bandFor(confidence: number | undefined): 'low' | 'medium' | 'high' {
  if (confidence == null || !Number.isFinite(confidence)) return 'high';
  if (confidence < 0.4) return 'low';
  if (confidence < 0.7) return 'medium';
  return 'high';
}

/**
 * Format the secondary-line text per master plan Part X:
 *   "Closing this gap → 75.2 → 74.5 (≈4 wks)"
 *
 * Returns empty string when the projection is suppressed — caller can
 * use that as a truthiness check for "should we render this row?"
 *
 * DC-CONF-1: a low-confidence (thin-sample) projection softens the verb and
 * widens the range rather than promising a precise score drop.
 */
export function formatCounterfactualLine(p: CounterfactualProjection): string {
  if (p.suppressed) return '';
  if (p.current_baseline_score === null || p.projected_score_if_closed === null) return '';
  const baseline = p.current_baseline_score.toFixed(1);
  const projected = p.projected_score_if_closed.toFixed(1);
  const weeks = Math.max(1, Math.round(p.weeks_to_typical_close));
  const wk = `≈${weeks} wk${weeks === 1 ? '' : 's'}`;

  // DC-CONF-1: a low-confidence (thin-sample) projection softens the verb and
  // widens the range rather than promising a precise score drop.
  if (p.confidence_band === 'low') {
    const saved = p.strokes_saved_per_round;
    const lo = (saved * 0.5).toFixed(1);
    const hi = saved.toFixed(1);
    return `On limited data, focused work here could trim roughly ${lo}-${hi} strokes/round (${wk})`;
  }
  return `Closing this gap → ${baseline} → ${projected} (${wk})`;
}
