/**
 * Form: the ONE 0–100 player score (owner decision OD-02, 2026-09-24).
 *
 * It replaces three numbers that disagreed for the same player on the same
 * day: Fingerprint "Overall game" (recent-5 to-par, which clamped to 100 on
 * the 37-stroke round), Genome/Scouting "Game strength" (a team z-score of
 * lifetime cache values) and the Team Stats "Composite" ring (the same
 * z-score). Every surface that prints "Form" must call this module with the
 * same inputs, so one name means one number.
 *
 * Inputs and rule:
 *   - Countable rounds only (src/lib/golf/round-countable.ts), newest first.
 *   - The last FORM_WINDOW (5) of them, each to par normalized to 18 holes
 *     (a 9-hole +5 counts as +10). To par comes from the hole-summed total
 *     (`deriveScoreToPar`), the same source as the scoring average.
 *   - A smooth curve maps the average to par to 0–100: par → 80, +10 → 50,
 *     +20 → 20. It approaches 100 and 0 but never reaches them, so there is
 *     no clamp at 100: the best a real (countable) average can print is 99.
 *   - Minus 5 per active critical/high-severity pattern, at most 20.
 *   - Fewer than FORM_EARLY_READ_BELOW (5) countable rounds prints the number
 *     with an "Early read" label. No countable rounds prints nothing (null).
 *
 * Pure: no Supabase, no React, no 'use server'. Safe to import anywhere.
 */

import { isCountableRound, isPlausibleToPar, type CountableRoundInput } from './round-countable';
import { deriveScoreToPar } from './round-total';

export const FORM_LABEL = 'Form';
export const FORM_EARLY_READ_LABEL = 'Early read';
/** Rounds the score reads (the most recent countable ones). */
export const FORM_WINDOW = 5;
/** Below this many countable rounds the score is an early read. */
export const FORM_EARLY_READ_BELOW = 5;
export const FORM_PATTERN_PENALTY_EACH = 5;
export const FORM_PATTERN_PENALTY_MAX = 20;
/** Guard only: a countable average cannot get here (see module doc). */
export const FORM_MAX = 99;

/** Anchors of the curve: average to par (18-hole) → score. */
const CURVE_MIDPOINT_TO_PAR = 10; // → 50
const CURVE_STEP = 10; // each +10 strokes multiplies the odds by 4 (par → 80, +20 → 20)
const CURVE_BASE = 4;

export type FormQuality = 'none' | 'early' | 'established';

export interface FormScore {
  /** 0–99 integer, or null when there are no countable rounds. */
  score: number | null;
  quality: FormQuality;
  /** "Early read" below 5 countable rounds, otherwise null. */
  qualityLabel: string | null;
  /** Countable rounds available (not only the window). */
  roundsCounted: number;
  /** Rounds that fed the average (at most FORM_WINDOW). */
  roundsInWindow: number;
  /** Mean to par over the window, 18-hole equivalent; null with no rounds. */
  averageToPar18: number | null;
  /** Curve value before the pattern penalty, 1 dp; null with no rounds. */
  curveScore: number | null;
  severePatterns: number;
  patternPenalty: number;
}

/** Only the round fields Form reads once a round is known to be countable. */
export interface FormToParInput {
  score_to_par: number | null;
  holes_played: number | null;
}

/** A raw round row: the countable-rule columns plus the stored to par. */
export type FormRoundInput = CountableRoundInput & { score_to_par: number | null };

export interface FormPatternInput {
  severity: string | null;
}

/** The curve: average to par (18-hole equivalent) → 0–100, unrounded. */
export function formCurve(averageToPar18: number): number {
  return 100 / (1 + CURVE_BASE ** ((averageToPar18 - CURVE_MIDPOINT_TO_PAR) / CURVE_STEP));
}

export function countSeverePatterns(patterns: readonly FormPatternInput[]): number {
  return patterns.filter((p) => p.severity === 'critical' || p.severity === 'high').length;
}

function toPar18(round: FormToParInput): number | null {
  if (round.score_to_par == null || !Number.isFinite(round.score_to_par)) return null;
  const holes = round.holes_played ?? 18;
  if (holes <= 0) return null;
  return (round.score_to_par * 18) / holes;
}

/**
 * Form from rounds that are ALREADY countable, newest first. Use this when a
 * loader has applied `isCountableRound` (and the canonical total) itself;
 * otherwise use `computeFormScore`, which does both. The stroke-floor check
 * is repeated as a guard so a raw row cannot pin the score.
 */
export function computeFormFromCountableRounds(
  countableRounds: readonly FormToParInput[],
  patterns: readonly FormPatternInput[] = [],
): FormScore {
  const rounds = countableRounds.filter((r) => isPlausibleToPar(r.score_to_par, r.holes_played));
  const severePatterns = countSeverePatterns(patterns);
  const patternPenalty = Math.min(FORM_PATTERN_PENALTY_MAX, severePatterns * FORM_PATTERN_PENALTY_EACH);

  const window = rounds
    .slice(0, FORM_WINDOW)
    .map(toPar18)
    .filter((v): v is number => v != null);

  if (window.length === 0) {
    return {
      score: null,
      quality: 'none',
      qualityLabel: null,
      roundsCounted: rounds.length,
      roundsInWindow: 0,
      averageToPar18: null,
      curveScore: null,
      severePatterns,
      patternPenalty,
    };
  }

  const averageToPar18 = window.reduce((a, b) => a + b, 0) / window.length;
  const curve = formCurve(averageToPar18);
  const score = Math.min(FORM_MAX, Math.max(0, Math.round(curve - patternPenalty)));
  const early = rounds.length < FORM_EARLY_READ_BELOW;

  return {
    score,
    quality: early ? 'early' : 'established',
    qualityLabel: early ? FORM_EARLY_READ_LABEL : null,
    roundsCounted: rounds.length,
    roundsInWindow: window.length,
    averageToPar18: Math.round(averageToPar18 * 10) / 10,
    curveScore: Math.round(curve * 10) / 10,
    severePatterns,
    patternPenalty,
  };
}

/**
 * Form from raw completed-round rows, newest first. Applies the countable
 * rule and the hole-summed to par, then `computeFormFromCountableRounds`.
 */
export function computeFormScore(
  rounds: readonly FormRoundInput[],
  patterns: readonly FormPatternInput[] = [],
): FormScore {
  const countable = rounds.filter(isCountableRound).map((r) => ({
    holes_played: r.holes_played,
    score_to_par: deriveScoreToPar({
      total_score: r.total_score,
      front_nine: r.front_nine,
      back_nine: r.back_nine,
      score_to_par: r.score_to_par,
    }),
  }));
  return computeFormFromCountableRounds(countable, patterns);
}

function signed1(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return 'E';
  return r > 0 ? `+${r.toFixed(1)}` : `−${Math.abs(r).toFixed(1)}`;
}

/**
 * The formula, as short plain lines for the tap-to-explain popover. The
 * numbers are this player's, so the reader can redo the sum.
 */
export function describeFormFormula(form: FormScore): string[] {
  const lines = [
    `Form reads your last ${FORM_WINDOW} full rounds (9-hole rounds count double to par).`,
    'Average to par maps to a 0–100 scale: par = 80, +10 = 50, +20 = 20. It never reaches 100.',
    `Each active high-severity pattern takes off ${FORM_PATTERN_PENALTY_EACH}, up to ${FORM_PATTERN_PENALTY_MAX}.`,
  ];
  if (form.score == null || form.averageToPar18 == null || form.curveScore == null) {
    lines.push('No full rounds yet, so there is no score.');
    return lines;
  }
  const n = form.roundsInWindow;
  lines.push(
    `This player: ${signed1(form.averageToPar18)} over ${n} ${n === 1 ? 'round' : 'rounds'} → ${form.curveScore.toFixed(1)}` +
      (form.patternPenalty > 0 ? `, minus ${form.patternPenalty} for patterns` : '') +
      ` = ${form.score}.`,
  );
  if (form.quality === 'early') {
    lines.push(
      `Early read: ${form.roundsCounted} of ${FORM_EARLY_READ_BELOW} rounds needed for a settled score.`,
    );
  }
  return lines;
}
