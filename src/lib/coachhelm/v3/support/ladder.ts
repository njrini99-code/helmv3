/**
 * The five-rung claim ladder (02-accuracy-standard §6; 00-overview decision 3).
 *
 * | Rung               | Gate (all must hold)                                                 |
 * | ------------------ | -------------------------------------------------------------------- |
 * | Seen repeatedly    | Observed and (split-half agrees or >= 2 checkpoints held); a printed  |
 * |                    | WHY path must lead in both halves                                     |
 * | Observed           | q <= 0.10, 95% range excludes 0, n >= 2 × floor, >= 3 rounds,         |
 * |                    | S >= 0.3; a printed WHY is a counted sequence that meets its floors   |
 * | Likely             | q <= 0.10, >= 3 rounds, S >= 0.3, but range includes 0 or             |
 * |                    | n < 2 × floor; or WHAT is Clear and WHY is a corroborated inference   |
 * | Working hypothesis | WHAT supported but WHY is an uncorroborated candidate; or WHAT only  |
 * |                    | just over its floor (n < 1.5 × floor)                                 |
 * | Not enough yet     | any floor fails or q > 0.10                                           |
 *
 * Two rungs come out: `ladder` labels the read AS WORDED (with its cause line),
 * `what_ladder` labels the WHAT alone, which is what a surface may print when
 * it drops an uncorroborated cause (the player never sees one, 00 open
 * question 3).
 *
 * Choices this module makes where 02 is silent (each is a reason code, so the
 * run log and the audit view can count them):
 *   - `rounds_unknown`: evidence that does not say how many rounds it covers
 *     cannot show the 3-round floor holds, so it is Not enough yet.
 *   - `no_strokes_estimate`: a read whose strokes at stake were never
 *     estimated cannot show the 0.3-stroke practical floor, so its WHAT stops
 *     at Working hypothesis (coach only) instead of reaching a player.
 *   - Below the practical floor with a real estimate is Not enough yet ("not a
 *     read", 02 §2).
 *
 * Pure.
 */
import { BH_Q } from './multiplicity';

export const LADDER_RUNGS = [
  'not_enough_yet',
  'working_hypothesis',
  'likely',
  'observed',
  'seen_repeatedly',
] as const;
export type LadderRung = (typeof LADDER_RUNGS)[number];

/** Smallest splittable round count (02 §2). */
export const ROUND_FLOOR = 3;
/** Smallest worthwhile change, strokes a round (02 §2). */
export const STROKES_FLOOR = 0.3;
/** Clear support needs this many times the family floor (02 §2). */
export const CLEAR_N_MULTIPLE = 2;
/** Below this many times the floor a supported WHAT is only a working hypothesis (02 §6). */
export const THIN_N_MULTIPLE = 1.5;
/** Checkpoints held that stand in for split-half agreement (02 §6). */
export const CHECKPOINTS_FOR_REPEATED = 2;

/**
 * The state of the read's cause line, as far as the ladder cares:
 *   - `observed_sequence`: a counted path that meets the Observed path floors;
 *   - `corroborated`: an inference from totals with both arms printed and the
 *     corroboration gates met (lift >= 1.25, >= 10 per arm);
 *   - `candidate`: a printed cause that is neither (an uncorroborated guess);
 *   - `not_traced`: no cause is printed (including the hidden placeholder).
 */
export type WhyState = 'observed_sequence' | 'corroborated' | 'candidate' | 'not_traced';

export interface LadderInput {
  /** BH-adjusted q; null when the candidate could not be tested. */
  q: number | null;
  rangeExcludesZero: boolean;
  /** Sample in the family's counting unit (attempts, rounds; the smaller side of a contrast). */
  n: number;
  /** The family's attempt (or round) floor for SAYING anything. */
  floor: number;
  /** Countable rounds behind the read; null when the evidence does not say. */
  roundsN: number | null;
  /** Round floor for this family (>= {@link ROUND_FLOOR}). */
  roundFloor?: number;
  /** Raw strokes a round at stake in the read's direction; null when never estimated. */
  strokes: number | null;
  why: WhyState;
  /** Counted WHY path leads the failure list in both halves (Seen repeatedly with a path). */
  whyLeadsBothHalves?: boolean;
  /** Split-half agreement; null when the halves were not computed. */
  stabilityAgrees: boolean | null;
  checkpointsHeld?: number;
  /** Highest rung the family can reach (02 §7 "ladder cap"). */
  cap: LadderRung;
}

export interface LadderResult {
  ladder: LadderRung;
  what_ladder: LadderRung;
  /** Clear support: q <= 0.10, range excludes 0, n >= 2 × floor. */
  clear: boolean;
  /** Machine-readable reasons, strongest constraint first. */
  reasons: string[];
}

function rank(r: LadderRung): number {
  return LADDER_RUNGS.indexOf(r);
}

/** The weaker of two rungs. */
export function minRung(a: LadderRung, b: LadderRung): LadderRung {
  return rank(a) <= rank(b) ? a : b;
}

/** True when `a` is at or above `b`. */
export function rungAtLeast(a: LadderRung, b: LadderRung): boolean {
  return rank(a) >= rank(b);
}

export function assignLadder(input: LadderInput): LadderResult {
  const reasons: string[] = [];
  const roundFloor = Math.max(ROUND_FLOOR, input.roundFloor ?? ROUND_FLOOR);
  const floor = Math.max(1, input.floor);

  if (input.q === null) reasons.push('untestable');
  if (input.roundsN === null) reasons.push('rounds_unknown');
  else if (input.roundsN < roundFloor) reasons.push('below_round_floor');
  if (!(input.n >= floor)) reasons.push('below_attempt_floor');
  if (input.q !== null && !(input.q <= BH_Q)) reasons.push('not_supported');
  if (input.strokes !== null && !(input.strokes >= STROKES_FLOOR)) reasons.push('below_strokes_floor');

  const clear =
    input.q !== null && input.q <= BH_Q && input.rangeExcludesZero && input.n >= CLEAR_N_MULTIPLE * floor;

  if (reasons.length > 0) {
    return { ladder: 'not_enough_yet', what_ladder: 'not_enough_yet', clear: false, reasons };
  }

  // WHAT alone.
  let what: LadderRung;
  if (input.strokes === null) {
    what = 'working_hypothesis';
    reasons.push('no_strokes_estimate');
  } else if (clear) {
    const repeated =
      input.stabilityAgrees === true || (input.checkpointsHeld ?? 0) >= CHECKPOINTS_FOR_REPEATED;
    what = repeated ? 'seen_repeatedly' : 'observed';
    if (!repeated) reasons.push('one_window_only');
  } else if (input.n < THIN_N_MULTIPLE * floor) {
    what = 'working_hypothesis';
    reasons.push('thin_support');
  } else {
    what = 'likely';
    reasons.push(input.rangeExcludesZero ? 'below_clear_n' : 'range_includes_zero');
  }

  // The read as worded, with its cause line.
  let worded = what;
  switch (input.why) {
    case 'candidate':
      worded = minRung(worded, 'working_hypothesis');
      if (rank(what) > rank('working_hypothesis')) reasons.push('uncorroborated_cause');
      break;
    case 'corroborated':
      worded = minRung(worded, 'likely');
      if (rank(what) > rank('likely')) reasons.push('cause_inferred_from_totals');
      break;
    case 'observed_sequence':
      if (worded === 'seen_repeatedly' && input.whyLeadsBothHalves !== true) {
        worded = 'observed';
        reasons.push('cause_path_one_window');
      }
      break;
    case 'not_traced':
      break;
  }

  const capped = minRung(worded, input.cap);
  const cappedWhat = minRung(what, input.cap);
  if (rank(capped) < rank(worded) || rank(cappedWhat) < rank(what)) reasons.push(`family_cap:${input.cap}`);

  return { ladder: capped, what_ladder: cappedWhat, clear, reasons };
}
