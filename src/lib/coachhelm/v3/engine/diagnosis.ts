/**
 * v3 engine — shared diagnosis helper.
 *
 * Turns a miss tally into a DOMINANT AXIS (the measured tendency) + an
 * observation / check / action reading. Reused by approach_miss / scrambling /
 * putt_distance / course-mgmt so every reading is composed one way — and so
 * none of them asserts a cause (under-clubbing, deceleration, face control)
 * that the shot record does not contain.
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

/** Approach miss directions we read an observation for. */
export type ApproachAxis = 'short' | 'long' | 'left' | 'right';

/**
 * Observation / check / action reading for a dominant approach miss axis
 * (repair plan Package 2, "replace practice strings with observation/check/
 * action fields and a compatible text fallback").
 *
 *  - `observation` is the measured fact: the share of misses on the axis and
 *    the sample it is over. It is the ONLY sentence that may read as fact.
 *  - `check` names what the data does NOT contain and what the coach should
 *    establish before treating a cause as known. A 73% short share is
 *    compatible with under-clubbing, a headwind, a front-edge target, a
 *    lay-up, or a lie that cost carry — the engine has no intent, wind,
 *    target, or club record, so it asserts none of them.
 *  - `action` is a recommendation that is useful whichever of those turns
 *    out to be true, framed as a recommendation, never as the fix.
 */
export interface AxisReading {
  observation: string;
  check: string;
  action: string;
}

const AXIS_WORD: Record<ApproachAxis, string> = {
  short: 'SHORT',
  long: 'LONG',
  left: 'LEFT',
  right: 'RIGHT',
};

/**
 * Compose the reading for a dominant APPROACH miss axis. Every number in the
 * observation comes from the cited tally; the check and action contain no
 * measured claim at all.
 *
 * @param axis The dominant approach miss direction (short / long / left / right).
 * @param share Observed share of the cited misses, as a 0..1 fraction (NOT
 *   0..100) — rendered as a percentage. Pass {@link DominantAxis.share}
 *   straight through.
 * @param n Number of misses the share is over (the cited sample). NOTE: this
 *   is the AXIS-READ subset (misses with a short/long or left/right
 *   component), not all misses — pure cross-axis misses are excluded by
 *   dominantAxis, and the sentence must say so (regrade VAL-P3: '82% of
 *   those 11 misses' on a card whose own green-hit line implies 21).
 */
export function approachAxisReading(axis: ApproachAxis, share: number, n: number): AxisReading {
  const pct = Math.round(share * 100);
  const read = axis === 'short' || axis === 'long' ? 'distance read' : 'line read';
  const observation =
    `${pct}% of the ${n} misses with a ${read} finished ${AXIS_WORD[axis]}.`;
  switch (axis) {
    case 'short':
      return {
        observation,
        check:
          'The record does not say why: the same short pattern comes from ' +
          'under-clubbing, a headwind, a front-edge target, a deliberate lay-up, ' +
          'or a lie that cost carry. Check the club and target on the next few ' +
          'approaches from this range before naming a cause.',
        action:
          'Recommended: have the player call the carry number that covers the ' +
          'flag from this range and log the club, then review the next ten ' +
          'approaches from here together.',
      };
    case 'long':
      return {
        observation,
        check:
          'The record does not say why: the same long pattern comes from ' +
          'over-clubbing, a helping wind, a back-pin target, firm greens, or a ' +
          'flyer lie. Check the club and conditions on the next few approaches ' +
          'from this range before naming a cause.',
        action:
          'Recommended: have the player log club and pin position from this ' +
          'range for the next ten approaches, then compare the carry numbers to ' +
          'the distances actually played.',
      };
    case 'left':
    case 'right':
      return {
        observation,
        check:
          'The record does not say why: a one-sided line miss can be start ' +
          'line, face control, wind, slope, or aiming away from a hazard on ' +
          'purpose. Check the intended start line and target on the next few ' +
          'approaches before naming a cause.',
        action:
          'Recommended: have the player state the start line and target before ' +
          `each approach from this range, then compare where the ${axis} misses ` +
          'were aimed against where they finished.',
      };
  }
}

/** Compatible text fallback: the three fields as one paragraph. */
export function axisReadingToText(reading: AxisReading): string {
  return `${reading.observation} ${reading.check} ${reading.action}`;
}

/**
 * Sentence form of {@link approachAxisReading} for callers that only carry
 * prose. Kept as the public name the generators already import; the content
 * is the observation/check/action text — it no longer asserts a mechanical
 * cause (under-clubbing, deceleration, face control) that nothing measured.
 */
export function approachAxisDriver(axis: ApproachAxis, share: number, n: number): string {
  return axisReadingToText(approachAxisReading(axis, share, n));
}
