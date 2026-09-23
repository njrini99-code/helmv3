/**
 * Per-hole shot-sequence validator (addendum §13, A1).
 *
 * `buildHoleSequence` checks a set of normalized `ShotFact`s against a
 * hole's AUTHORITATIVE totals (`HoleContext` — sourced from `golf_holes`,
 * never derived from the shots themselves). A matching row count is
 * necessary but not sufficient: order, termination, and penalty
 * representation are each checked independently, and every failing check
 * is reported — not just the first one found — so a caller can show a
 * reviewer exactly what's wrong with a sequence instead of one symptom at
 * a time.
 */

import type { HoleContext, ShotFact } from './types';

export interface HoleSequenceResult {
  /** The hole's shots, sorted by `shot_number` (unordered/missing numbers
   *  sort last — an unordered shot is a validation finding, not a crash). */
  shots: ShotFact[];
  complete: boolean;
  /** Every violated check, in the order below. Empty iff `complete`. */
  reasons: string[];
}

/** Outcomes that mean "the ball found the green" — used only to check that
 *  a penalty shot never carries one of these (see `proximateCause` in
 *  `engine/hole-diagnosis.ts` for the authoritative penalty > everything
 *  precedence this mirrors at the shot level). */
const GREEN_FINDING_RESULTS = new Set(['green', 'gir']);

export function buildHoleSequence(facts: ShotFact[], hole: HoleContext): HoleSequenceResult {
  const reasons: string[] = [];

  const onHole = facts.filter(
    (f) => f.round_id === hole.round_id && f.hole_number === hole.hole_number,
  );
  const shots = [...onHole].sort((a, b) => {
    if (a.shot_number === null && b.shot_number === null) return 0;
    if (a.shot_number === null) return 1;
    if (b.shot_number === null) return -1;
    return a.shot_number - b.shot_number;
  });

  if (shots.length === 0) {
    return { shots, complete: false, reasons: ['no_shots_recorded'] };
  }

  // --- Order -----------------------------------------------------------
  const numbers = shots.map((s) => s.shot_number);
  if (numbers.some((n) => n === null)) {
    reasons.push('missing_shot_number');
  }
  const known = numbers.filter((n): n is number => n !== null);
  const seen = new Set<number>();
  let hasDuplicate = false;
  for (const n of known) {
    if (seen.has(n)) hasDuplicate = true;
    seen.add(n);
  }
  if (hasDuplicate) reasons.push('duplicate_shot_number');

  const distinctSorted = [...seen].sort((a, b) => a - b);
  const sequentialFromOne =
    distinctSorted.length > 0 &&
    distinctSorted[0] === 1 &&
    distinctSorted.every((n, i) => n === i + 1);
  if (known.length > 0 && !sequentialFromOne) {
    reasons.push('non_sequential_shot_numbers');
  }

  // --- Row count vs. the authoritative total ---------------------------
  // Necessary, not sufficient — kept as its own independent check rather
  // than inferred from the order/termination checks below.
  if (shots.length !== hole.total_strokes) {
    reasons.push('shot_count_mismatch');
  }

  // --- Penalty representation -------------------------------------------
  // The count of `is_penalty` shots must reconcile with the hole's
  // authoritative `penalty_strokes`, and a penalty shot must never read as
  // a normal green-finding attempt. `buildHoleSequence` never rewrites or
  // clears `is_penalty` on the shots it returns — downstream code that
  // checks `result`/`lie_after` for a green finish MUST check `is_penalty`
  // first (mirrors `proximateCause`'s penalty-first precedence).
  // `hole.penalty_strokes === null` means the authoritative count is not
  // recorded, not that it's zero — see `HoleContext.penalty_strokes`'s doc
  // comment. There is nothing to reconcile against, so this check is
  // skipped rather than comparing against an assumed 0.
  const penaltyCount = shots.filter((s) => s.is_penalty).length;
  if (hole.penalty_strokes !== null && penaltyCount !== hole.penalty_strokes) {
    reasons.push('penalty_count_mismatch');
  }
  const penaltyMisreadAsGreenAttempt = shots.some(
    (s) => s.is_penalty && s.result !== null && GREEN_FINDING_RESULTS.has(s.result),
  );
  if (penaltyMisreadAsGreenAttempt) {
    reasons.push('penalty_shot_recorded_as_green_attempt');
  }

  // --- Termination -------------------------------------------------------
  // The sequence must end with the ball holed, and nothing recorded after
  // that point. A hole is holed out by EITHER `result === 'hole'` OR
  // `putt_made === true` — the shot-edit path (`golf.ts`'s `updateShotImpl`)
  // can set `putt_made` independently of `result`, and the rest of the
  // codebase (`round-review-system.ts`, `round-review-content.ts`) already
  // treats both as termination; checking `result` alone would miss a hole
  // logged only through `putt_made`.
  const holedIndex = shots.findIndex((s) => s.result === 'hole' || s.putt_made === true);
  if (holedIndex === -1) {
    reasons.push('sequence_not_terminated');
  } else if (holedIndex !== shots.length - 1) {
    reasons.push('shots_recorded_after_hole_out');
  }

  return { shots, complete: reasons.length === 0, reasons };
}
