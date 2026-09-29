/**
 * Par-5 lay-up intent for long approaches (audit row 30, 2026-09-28).
 *
 * The distance profile (and the Package 7B standing SQL) called every par-5
 * approach from 175+ yd that MISSED the green a "likely lay-up" and dropped it.
 * That infers intent from the outcome: a go at the green that finished in a
 * greenside bunker was removed as a "lay-up", which dropped 39% of 175+ yd
 * approaches and lifted the band's green-hit rate by 20 points.
 *
 * Intent is read from where the ball was LEFT instead. Production leave
 * distances for par-5 175+ yd misses (2026-09-28, completed non-test rounds)
 * are bimodal: a greenside mode at 10-40 yd (673 shots) and a wedge-distance
 * mode at 90-150 yd, with the trough at 50-80 yd. A miss left 50+ yd out was
 * a lay-up; one left inside 50 yd was a go at the green that missed.
 *
 * A recorded intent tag (`ShotFact.intent`) wins over the inference. An
 * unknown leave distance is `unknown` — excluded under its own reason, never
 * silently counted as a lay-up or as an attempt.
 *
 * Exported for the approach-miss generator's 175+ band, which uses the same
 * par-5 rule (owned by the ranking slice; not wired from here).
 *
 * Pure: no Supabase.
 */

/** Leave distance (feet) at or beyond which a par-5 miss is read as a lay-up: 50 yd. */
export const LAYUP_MIN_LEAVE_FEET = 150;

export type LongApproachIntent = 'layup' | 'attempt' | 'unknown';

export function classifyParFiveLongApproach(input: {
  par: number | null | undefined;
  onGreen: boolean;
  /** Distance to the hole after the shot, in feet; null when not recorded. */
  leaveFeet: number | null | undefined;
  /** Recorded intent tag, when an ingest source provides one. */
  intent?: string | null;
}): LongApproachIntent {
  if (input.intent === 'layup') return 'layup';
  if (input.intent === 'go_for_green') return 'attempt';
  if (input.par !== 5 || input.onGreen) return 'attempt';
  if (typeof input.leaveFeet !== 'number' || !Number.isFinite(input.leaveFeet)) return 'unknown';
  return input.leaveFeet >= LAYUP_MIN_LEAVE_FEET ? 'layup' : 'attempt';
}
