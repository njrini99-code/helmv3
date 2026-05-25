/**
 * v3 counterfactual types.
 *
 * Master plan Part X: secondary line under standing bars + insight cards
 * that says "Closing this gap → 75.2 → 74.5 (≈4 wks)". Auto-suppressed
 * when projected per-round impact < 0.3 strokes (the stat-noise floor).
 */

/** Strokes-per-round value below which we don't bother showing a counterfactual. */
export const COUNTERFACTUAL_SUPPRESS_THRESHOLD = 0.3;

export interface CounterfactualProjection {
  /** Player's current 30-day scoring average. Null when not enough data. */
  current_baseline_score: number | null;
  /** Baseline minus strokes_saved_per_round. Null when baseline is null. */
  projected_score_if_closed: number | null;
  /** Per-round strokes saved if the player closed the gap to PGA. */
  strokes_saved_per_round: number;
  /** Typical coachable-timeframe in weeks (per Research doc §10). */
  weeks_to_typical_close: number;
  /**
   * True when the projection should NOT render — either suppress threshold
   * was hit (stat noise), no baseline data, or no positive gap to close.
   */
  suppressed: boolean;
  /** Reason for suppression (logged for debugging, not user-facing). */
  suppress_reason?: 'below_threshold' | 'no_baseline' | 'no_gap' | 'unknown_metric';
}
