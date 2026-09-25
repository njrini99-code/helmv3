/**
 * The one "countable round" rule for GolfHelm player-facing numbers.
 *
 * A completed round only feeds averages, bests, trends, strokes gained,
 * percentiles and predictions when it is ALSO:
 *
 *   1. a supported length (9 or 18 holes);
 *   2. fully recorded: the declared number of holes has scores
 *      (`front_nine`/`back_nine` — the audited proxy for Σgolf_holes.score,
 *      see ./round-total.ts — or an explicit `recorded_holes` count);
 *   3. plausible: the canonical total clears a stroke floor, and (when the
 *      loader has it) the round's SG: Total is not above +15.
 *
 * Why this exists: before it, every surface filtered only on
 * `status = 'completed'`. A tracked round on Sep 17 2026 (91301a75, declared
 * 18 holes, 18 scored holes summing to 37, 18 putts, SG total +34.51) passed
 * that filter and set Best round, the trend axis, the prediction band, the
 * composite (clamped to 100) and the pressure gap. Hole-less rounds (declared
 * 18, zero hole rows) also counted, diluting per-hole denominators.
 *
 * Pure: no Supabase, no React. Loaders select the columns in
 * `CountableRoundInput` and filter before aggregating.
 */

import { deriveRoundTotal } from './round-total';

/** Round lengths the app scores. Anything else is not countable. */
export const COUNTABLE_HOLE_COUNTS: readonly number[] = [9, 18];

/**
 * Lowest plausible 18-hole score. The lowest competitive 18-hole score on
 * record is in the mid-50s; 50 leaves headroom for any real round while
 * rejecting half-entered ones. Prod check (2026-09-23, 652 completed rounds):
 * every other 18-hole round is >= 64 and every 9-hole round is >= 32; the only
 * 18-hole round below 64 is the 37-stroke Sep 17 round.
 * Scaled per hole, so the 9-hole floor is ceil(9 × 50/18) = 25.
 */
export const MIN_PLAUSIBLE_STROKES_PER_18 = 50;

/**
 * Largest believable SG: Total GAINED in one round. Tour-level rounds sit
 * within roughly +10 of the baseline; +15 only trips on rounds whose shot
 * data is physically impossible (Sep 17 is +34.51). Applied only when the
 * loader supplies `strokes_gained_total`.
 *
 * One-sided on purpose (W13, 2026-09-24). A large NEGATIVE SG is what a
 * genuinely bad round looks like: SG: Total tracks −(strokes over the
 * baseline), so an 88 (+17) reads about −18. Prod check (2026-09-24): the
 * old ±15 rule dropped 15 real 18-hole rounds (82–95 strokes, +10 to +23,
 * SG −15.6 to −24.1) from every average. An implausibly LOW score is
 * already caught by the stroke floor above, so there is no negative case
 * left for SG to catch.
 */
export const MAX_SG_TOTAL_PER_ROUND = 15;

/** @deprecated The ceiling is one-sided now; use `MAX_SG_TOTAL_PER_ROUND`. */
export const MAX_ABS_SG_TOTAL_PER_ROUND = MAX_SG_TOTAL_PER_ROUND;

/**
 * Fallback for callers that only have `score_to_par`: the stroke floor on a
 * par-72 course, i.e. 50 − 72 = −22 over 18 holes. Prefer the full rule
 * (`isCountableRound`); this only catches the implausible-score class.
 */
export const MIN_PLAUSIBLE_TO_PAR_PER_18 = MIN_PLAUSIBLE_STROKES_PER_18 - 72;

/** True unless an 18-hole-normalized to-par is below the stroke floor. */
export function isPlausibleToPar(scoreToPar: number | null, holesPlayed: number | null): boolean {
  if (scoreToPar == null || !Number.isFinite(scoreToPar)) return true;
  const holes = holesPlayed ?? 18;
  if (holes <= 0) return false;
  return (scoreToPar * 18) / holes >= MIN_PLAUSIBLE_TO_PAR_PER_18;
}

export interface CountableRoundInput {
  /** Omit when the query already filtered `status = 'completed'`. */
  status?: string | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  /** Used for the putts-aware floor (every hole needs >= 1 non-putt stroke). */
  total_putts: number | null;
  /** Explicit count of scored `golf_holes` rows, when the loader has it. */
  recorded_holes?: number | null;
  /** Per-round SG: Total (golf_round_stats_cache), when the loader has it. */
  strokes_gained_total?: number | null;
}

export type RoundExclusionReason =
  | 'not_completed'
  | 'unsupported_length'
  | 'holes_missing'
  | 'implausible_score'
  | 'implausible_sg';

/** Stroke floor for a round of `holes` holes with `putts` recorded putts. */
export function minPlausibleStrokes(holes: number, putts: number | null): number {
  const perHoleFloor = Math.ceil((holes * MIN_PLAUSIBLE_STROKES_PER_18) / 18);
  // A hole always takes at least one non-putt stroke, so strokes >= holes + putts.
  const puttsFloor = holes + (putts != null && putts > 0 ? putts : 0);
  return Math.max(perHoleFloor, puttsFloor);
}

function recordedHoles(round: CountableRoundInput): number {
  if (round.recorded_holes != null) return round.recorded_holes;
  const front = round.front_nine != null ? 9 : 0;
  const back = round.back_nine != null ? 9 : 0;
  return front + back;
}

/** Why a round is not countable, or `null` when it counts. */
export function roundExclusionReason(round: CountableRoundInput): RoundExclusionReason | null {
  if (round.status != null && round.status !== 'completed') return 'not_completed';

  const holes = round.holes_played ?? 18;
  if (!COUNTABLE_HOLE_COUNTS.includes(holes)) return 'unsupported_length';

  if (recordedHoles(round) !== holes) return 'holes_missing';

  const { total } = deriveRoundTotal(round);
  if (total == null || total < minPlausibleStrokes(holes, round.total_putts)) {
    return 'implausible_score';
  }

  const sg = round.strokes_gained_total;
  if (sg != null && Number.isFinite(sg) && sg > MAX_SG_TOTAL_PER_ROUND) {
    return 'implausible_sg';
  }
  return null;
}

export function isCountableRound(round: CountableRoundInput): boolean {
  return roundExclusionReason(round) === null;
}

/** Keeps order. The caller's sort (newest-first etc.) is preserved. */
export function filterCountableRounds<T extends CountableRoundInput>(rounds: readonly T[]): T[] {
  return rounds.filter(isCountableRound);
}
