/**
 * The coach weight W (03 §2.2, §7.2; 07 §2 F), learned from corrections.
 *
 * One number per coach x family, starting at 1.0:
 *   - "Not this" (`not_this`, any reason)  -> W - 0.1, floor 0.5
 *   - "Good read" (`confirm`)              -> W + 0.05, cap 1.5
 *   - "Wrong cause", "Already on it", "Show later" do not move W (they act on
 *     the cause line, the prescription and the schedule instead).
 * Steps apply oldest first and the bounds clamp at every step, so a coach who
 * confirmed a family to the cap and then says "Not this" once is at 1.4, not
 * at 1.5 + n x 0.05 - 0.1.
 *
 * One vote per read: only the author's NEWEST correction on a given insight
 * counts. Tapping "Not this" five times on one read moves W once, and a coach
 * who changes their mind ("Not this", later "Good read") is counted by the
 * later answer. Assumption (the spec says "per correction" and is silent on
 * repeats); it keeps one read from driving a family to the floor.
 *
 * "Family" is the insight's `insight_type`: the key the ranker already uses
 * for coach weights (`CoachWeights` in v3/ranking/score.ts).
 *
 * Hand-off (03 §2.2 W row, 07 §7): corrections set W only until a family has
 * >= 10 verdicts; from then on the outcome-based weight takes over, so a
 * family at or past {@link W_VERDICT_HANDOFF} is left out of the result.
 *
 * Pure: data in, weights out. No fetch, no Supabase.
 */
import type { CorrectionAuthorRole, CorrectionKind } from './types';

export const W_NEUTRAL = 1;
export const W_MIN = 0.5;
export const W_MAX = 1.5;
export const W_STEP_NOT_THIS = -0.1;
export const W_STEP_CONFIRM = 0.05;
/** Verdicts per family at which outcome-based weights replace W. */
export const W_VERDICT_HANDOFF = 10;

const STEP_BY_KIND: Readonly<Partial<Record<CorrectionKind, number>>> = {
  not_this: W_STEP_NOT_THIS,
  confirm: W_STEP_CONFIRM,
};

/** What W needs from a correction row, with the insight's family resolved. */
export interface WeightCorrection {
  insight_id: string;
  author_user_id: string;
  author_role: CorrectionAuthorRole;
  kind: CorrectionKind;
  created_at: string;
  /** The insight's `insight_type`. */
  family: string;
}

/** insight_type -> W, for the families whose W is not the neutral 1.0. */
export type CorrectionWeights = Record<string, number>;

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** One step of W for one correction kind, clamped to [0.5, 1.5]. */
export function stepCoachWeight(w: number, kind: CorrectionKind): number {
  const step = STEP_BY_KIND[kind] ?? 0;
  return Math.min(W_MAX, Math.max(W_MIN, round2(w + step)));
}

/** The fields {@link latestPerRead} keys and orders on. */
export interface AuthoredCorrection {
  insight_id: string;
  author_user_id: string;
  created_at: string;
}

function byCreatedAt(a: AuthoredCorrection, b: AuthoredCorrection): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * The newest correction per (author, insight), oldest first. Input order
 * breaks a tie on `created_at` (the later element wins), so the result is
 * deterministic.
 */
export function latestPerRead<T extends AuthoredCorrection>(corrections: readonly T[]): T[] {
  const latest = new Map<string, { row: T; idx: number }>();
  corrections.forEach((row, idx) => {
    const key = `${row.author_user_id}\u0000${row.insight_id}`;
    const prev = latest.get(key);
    if (!prev || row.created_at >= prev.row.created_at) latest.set(key, { row, idx });
  });
  return [...latest.values()].sort((a, b) => byCreatedAt(a.row, b.row) || a.idx - b.idx).map((v) => v.row);
}

export interface CoachWeightOptions {
  /** Verdicts per family (03 §4.3); a family at >= 10 is handed off. */
  verdictsByFamily?: Readonly<Record<string, number>>;
}

/**
 * W per family for one coach, from that coach's corrections. Rows written by
 * someone else, or with `author_role` 'player', are ignored: a player's
 * "Not this" is a precision signal, not a coach weight.
 */
export function computeCoachWeights(
  corrections: readonly WeightCorrection[],
  coachUserId: string,
  options: CoachWeightOptions = {},
): CorrectionWeights {
  const own = corrections.filter(
    (c) => c.author_user_id === coachUserId && c.author_role === 'coach' && c.family,
  );
  const w = new Map<string, number>();
  for (const c of latestPerRead(own)) {
    w.set(c.family, stepCoachWeight(w.get(c.family) ?? W_NEUTRAL, c.kind));
  }

  const verdicts = options.verdictsByFamily ?? {};
  const out: CorrectionWeights = {};
  for (const [family, value] of [...w.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if ((verdicts[family] ?? 0) >= W_VERDICT_HANDOFF) continue;
    if (value === W_NEUTRAL) continue;
    out[family] = value;
  }
  return out;
}

/**
 * The weights the ranker multiplies in: W from corrections, except where an
 * outcome-based weight exists. `outcomeWeights` holds only calibrated rows
 * (sample_n >= 10, `loadCoachWeightsForPlayer`), which is the hand-off rule
 * applied to today's outcome table.
 */
export function mergeCoachWeights(
  correctionWeights: Readonly<CorrectionWeights>,
  outcomeWeights: Readonly<Record<string, number>>,
): Record<string, number> {
  return { ...correctionWeights, ...outcomeWeights };
}
