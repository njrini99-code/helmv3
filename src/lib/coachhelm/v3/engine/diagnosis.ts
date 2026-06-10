/**
 * v3 engine — shared diagnosis helper.
 *
 * Turns a miss tally into a DOMINANT AXIS (the actual cause) + a SPECIFIC
 * coachable action. Reused by approach_miss / scrambling / putt_distance /
 * course-mgmt so every "driver+action" sentence is composed one way.
 *
 * PURE: no IO, no Date.now / Math.random. The neutral bucket is carried but
 * NEVER counted toward the directional share — e.g. an approach miss can be
 * "short" (vertical) yet directionally neutral (no left/right); folding neutral
 * into the share would dilute a real one-sided tendency into a false balance.
 */

/** Vertical-or-horizontal miss split. `neutral` = misses with no signal on the
 *  axis being tested (excluded from the share, kept for honest reporting). */
export interface AxisTally {
  /** Short / left / low — the "negative" pole of the axis. */
  negative: number;
  /** Long / right / high — the "positive" pole of the axis. */
  positive: number;
  /** No directional signal on this axis. */
  neutral: number;
}

export interface DominantAxis {
  axis: 'negative' | 'positive';
  /** Observed share of the DIRECTIONAL total (neutral excluded), 0..1. */
  share: number;
  /** Directional total the share is over (negative + positive). */
  n: number;
}

/** Default share a single pole must clear before we call it "dominant". */
export const DOMINANT_AXIS_SHARE = 0.55;
/** Default directional min sample before any axis is reported. */
export const DOMINANT_AXIS_MIN_N = 5;

/**
 * The pole (negative/positive) whose share of the DIRECTIONAL total clears
 * `threshold`, or null when the distribution is balanced or too thin. Pure.
 *
 * An exact tie (or balanced split) has no dominant axis → returns null. The
 * dominant pole must clear `threshold` AND be STRICTLY greater than the other
 * pole, so tie-breaking is symmetric: neither pole wins by ordering. (At the
 * default 0.55 this is behavior-preserving — a share ≥0.55 is always strictly
 * greater than the other pole; it only matters for custom thresholds <0.5, where
 * a 50/50 split would otherwise spuriously resolve to one side.)
 *
 * @param tally Directional miss split. `neutral` is carried but never counted
 *   toward the share — folding it in would dilute a one-sided tendency.
 * @param threshold Share (0..1, NOT 0..100) a single pole must clear to be
 *   called dominant. Defaults to {@link DOMINANT_AXIS_SHARE}. Phase C may
 *   override this per generator.
 * @param minN Minimum DIRECTIONAL sample (`negative + positive`) before any
 *   axis is reported. Defaults to {@link DOMINANT_AXIS_MIN_N}.
 * @returns The dominant pole with its share (a 0..1 fraction) and directional
 *   total `n`, or null when balanced / tied / below `minN`.
 */
export function dominantAxis(
  tally: AxisTally,
  threshold: number = DOMINANT_AXIS_SHARE,
  minN: number = DOMINANT_AXIS_MIN_N,
): DominantAxis | null {
  const n = tally.negative + tally.positive;
  if (n < minN) return null;
  const negShare = tally.negative / n;
  const posShare = tally.positive / n;
  if (negShare >= threshold && negShare > posShare) {
    return { axis: 'negative', share: negShare, n };
  }
  if (posShare >= threshold && posShare > negShare) {
    return { axis: 'positive', share: posShare, n };
  }
  return null;
}

/** Approach miss directions we read a driver+action for. */
export type ApproachAxis = 'short' | 'long' | 'left' | 'right';

/**
 * Driver+action sentence for a dominant APPROACH miss axis. Each names the
 * observed share, the WHY (the cause), and a SPECIFIC action — never a symptom
 * restatement. Derived entirely from the cited tally; no uncontrolled claims.
 *
 * @param axis The dominant approach miss direction (short / long / left / right).
 * @param share Observed share of the cited misses, as a 0..1 fraction (NOT
 *   0..100) — rendered as a percentage in the sentence. Pass the
 *   {@link DominantAxis.share} straight through.
 * @param n Number of misses the share is over (the cited sample). NOTE: this
 *   is the AXIS-READ subset (misses with a short/long or left/right
 *   component), not all misses — pure cross-axis misses are excluded by
 *   dominantAxis, and the sentence must say so (regrade VAL-P3: '82% of
 *   those 11 misses' on a card whose own green-hit line implies 21).
 * @returns A driver+action sentence naming the share, the cause, and a specific
 *   mechanical fix.
 */
export function approachAxisDriver(axis: ApproachAxis, share: number, n: number): string {
  const pct = Math.round(share * 100);
  switch (axis) {
    case 'short':
      return (
        `${pct}% of the ${n} misses with a distance read came up SHORT — the driver is under-clubbing ` +
        `or decelerating, not aim. Club up and commit to a full number (carry the ` +
        `flag's yardage, not the front edge).`
      );
    case 'long':
      return (
        `${pct}% of the ${n} misses with a distance read flew LONG — you're getting more carry than the ` +
        `number plays. Club down and take spin off it (three-quarter swing) so the ` +
        `stock yardage matches the green.`
      );
    case 'left':
      return (
        `${pct}% of the ${n} misses with a line read leaked LEFT — this is a start line / face-control ` +
        `pattern, not a distance fix. Work an alignment-stick start line gate and favor ` +
        `the right edge so the miss stays on the green.`
      );
    case 'right':
      return (
        `${pct}% of the ${n} misses with a line read leaked RIGHT — this is a start line / face-control ` +
        `pattern, not a distance fix. Work an alignment-stick start line gate and favor ` +
        `the left edge so the miss stays on the green.`
      );
  }
}
