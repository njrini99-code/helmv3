/**
 * v3 counterfactual types.
 *
 * Master plan Part X: secondary line under standing bars + insight cards
 * that says "Closing this gap → 75.2 → 74.5 (≈4 wks)". Auto-suppressed
 * when projected per-round impact < 0.3 strokes (the stat-noise floor).
 */

/** Strokes-per-round value below which we don't bother showing a counterfactual. */
export const COUNTERFACTUAL_SUPPRESS_THRESHOLD = 0.3;

/**
 * Default per-projection upper ceiling (CF-1/CF-2). No single-metric leak
 * realistically saves more than ~2.5 strokes/round; without this cap a
 * factor=10 metric (scoring_par_4) or a large pressure gap projects an
 * implausible double-digit recovery. Individual metrics tighten this in
 * `lookup-tables.ts` (`max_strokes_saved_per_round`).
 */
export const COUNTERFACTUAL_MAX_STROKES_PER_ROUND = 2.5;

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
  /**
   * True when `strokes_saved_per_round` was capped at the per-metric ceiling
   * (CF-1/CF-2). The raw uncapped value is descriptive-only; surfaces a
   * "≥" framing if a consumer wants to flag the projection is bounded.
   */
  clamped?: boolean;
  /**
   * Player's own per-round attempt rate used to size impact (DC-ATTEMPT-1),
   * or null when the legacy gap × stroke_impact_per_unit path was used.
   */
  attempts_used?: number | null;
}
