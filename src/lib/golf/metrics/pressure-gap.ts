/**
 * Pressure gap: the ONE definition (FP-06 parity; UI/UX audit W12).
 *
 * Before this module, Fingerprint (`player-fingerprint.ts` buildPressureSection)
 * and Genome (`v3/genome/dimensions/pressure-delta.ts`) each computed "how much
 * worse under pressure" their own way:
 *   - Fingerprint: every non-practice round counted as pressure, and 9-hole
 *     rounds were scaled to 18.
 *   - Genome: only tournament and qualifier rounds counted, and a 9-hole
 *     round's to-par was averaged raw against 18-hole rounds.
 * The same player could read "Holds up" on one screen and "Tightens up" on
 * the other from the same rounds.
 *
 * The rule, for both:
 *   - Pressure rounds are tournament and qualifier rounds (plus the legacy
 *     'qualifying' spelling). Practice rounds are the baseline. Any other
 *     type is left out of both sides.
 *   - Each round's to par is scaled to 18 holes (a 9-hole +3 counts as +6).
 *     A missing hole count means 18.
 *   - gap = mean pressure to par − mean practice to par. Positive means worse
 *     under pressure.
 *
 * Each caller keeps its own sample floor (`minPerSide`) and presentation
 * (Genome clamps to ±3 for its radar). The gap itself is this function.
 *
 * Pure: no Supabase, no React, no 'use server'.
 */

export const PRESSURE_ROUND_TYPES: readonly string[] = ['tournament', 'qualifier', 'qualifying'];
export const PRACTICE_ROUND_TYPE = 'practice';

export interface PressureGapRound {
  round_type: string | null;
  score_to_par: number | null;
  /** Missing or null means 18. */
  holes_played?: number | null;
}

export interface PressureGap {
  /** Mean pressure to par minus mean practice to par (18-hole basis). */
  gap: number;
  pressureAverage: number;
  practiceAverage: number;
  pressureRounds: number;
  practiceRounds: number;
}

export interface PressureGapSplit {
  pressure: number[];
  practice: number[];
}

function toPar18(round: PressureGapRound): number | null {
  const toPar = round.score_to_par;
  if (typeof toPar !== 'number' || !Number.isFinite(toPar)) return null;
  const holes = round.holes_played ?? 18;
  if (!(holes > 0)) return null;
  return holes === 18 ? toPar : (toPar * 18) / holes;
}

/** The 18-hole to-par values on each side of the comparison. */
export function splitPressureRounds(rounds: readonly PressureGapRound[]): PressureGapSplit {
  const pressure: number[] = [];
  const practice: number[] = [];
  for (const r of rounds) {
    const v = toPar18(r);
    if (v == null || r.round_type == null) continue;
    if (r.round_type === PRACTICE_ROUND_TYPE) practice.push(v);
    else if (PRESSURE_ROUND_TYPES.includes(r.round_type)) pressure.push(v);
  }
  return { pressure, practice };
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * The pressure gap, or null when either side has fewer than `minPerSide`
 * rounds (at least 1).
 */
export function computePressureGap(
  rounds: readonly PressureGapRound[],
  { minPerSide }: { minPerSide: number },
): PressureGap | null {
  const floor = Math.max(1, Math.floor(minPerSide));
  const { pressure, practice } = splitPressureRounds(rounds);
  if (pressure.length < floor || practice.length < floor) return null;
  const pressureAverage = mean(pressure);
  const practiceAverage = mean(practice);
  return {
    gap: pressureAverage - practiceAverage,
    pressureAverage,
    practiceAverage,
    pressureRounds: pressure.length,
    practiceRounds: practice.length,
  };
}
