/**
 * Under review (CoachHelm Slice 3; 03 §9 "Under review", 03 §7.2, 07 §2 D).
 * Pure setter: corrections and integrity flags in, the read's
 * `under_review` out.
 *
 * Set by:
 *   - a coach "Wrong cause" correction (`kind='wrong_cause'`), or
 *   - "Not this" with the reason "wrong" (`kind='not_this', reason='wrong'`),
 *     made after the read's last checkpoint (Slice 6a, PR #2226, table
 *     `golf_coachhelm_corrections`; read only when the table exists), or
 *   - an integrity flag on a round inside the read's window: the round's
 *     hole scores do not add up to its total (01 §2 `hole_sum_mismatch`).
 * Cleared at the next checkpoint that covers the read. A flagged round that
 * has been under review through one checkpoint is not flagged again.
 *
 * It hides nothing: the read keeps showing with the state word.
 */
import type { CorrectionRow, ReadLifecycleMeta, UnderReviewRecord } from './types';

export function isUnderReviewCorrection(c: Pick<CorrectionRow, 'kind' | 'reason'>): boolean {
  return c.kind === 'wrong_cause' || (c.kind === 'not_this' && c.reason === 'wrong');
}

export interface UnderReviewInput {
  meta: ReadLifecycleMeta;
  /** True when tonight's checkpoint covers this read. */
  covered: boolean;
  /** `meta.last_checkpoint_at` BEFORE tonight's checkpoint (null = never). */
  previousCheckpointAt: string | null;
  /** Corrections on this read, any order. */
  corrections: readonly CorrectionRow[];
  /** Rounds in the read's window that fail the hole-sum check. */
  flaggedRoundIds: readonly string[];
  nowIso: string;
}

export interface UnderReviewResult {
  under_review: UnderReviewRecord | null;
  under_review_at_checkpoint: number | null;
  integrity_reviewed_round_ids: string[];
}

/**
 * Decide the read's `under_review`. `meta.checkpoints_seen` is the count
 * AFTER tonight's checkpoint (if any) was added.
 */
export function decideUnderReview(input: UnderReviewInput): UnderReviewResult {
  const { meta, covered, previousCheckpointAt, corrections, flaggedRoundIds, nowIso } = input;
  let current: UnderReviewRecord | null = meta.under_review ?? null;
  let at: number | null = meta.under_review_at_checkpoint ?? null;
  const reviewed = new Set(meta.integrity_reviewed_round_ids ?? []);

  // 1. A checkpoint after the one it was set at clears it. The correction
  //    that set it is spent: it never sets it again.
  const spent = new Set<string>();
  if (current?.correction_id) spent.add(current.correction_id);
  if (current && covered && (at ?? 0) < meta.checkpoints_seen) {
    if (current.reason === 'integrity') for (const id of current.round_ids ?? []) reviewed.add(id);
    current = null;
    at = null;
  }

  // 2. A qualifying correction made since the read's last checkpoint sets it
  //    (the newest one wins; one already in force is not re-set).
  if (!current) {
    const fresh = corrections
      .filter(isUnderReviewCorrection)
      .filter((c) => !spent.has(c.id))
      .filter((c) => !previousCheckpointAt || c.created_at > previousCheckpointAt)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (fresh) {
      current = {
        reason: fresh.kind === 'wrong_cause' ? 'wrong_cause' : 'not_this_wrong',
        since: fresh.created_at,
        correction_id: fresh.id,
        alternative_cause_label: fresh.alternative_cause_label ?? null,
      };
      at = meta.checkpoints_seen;
    }
  }

  // 3. An integrity flag on a round not yet reviewed sets it.
  if (!current) {
    const flagged = [...new Set(flaggedRoundIds)].filter((id) => !reviewed.has(id)).sort();
    if (flagged.length > 0) {
      current = { reason: 'integrity', since: nowIso, round_ids: flagged };
      at = meta.checkpoints_seen;
    }
  }

  return {
    under_review: current,
    under_review_at_checkpoint: current ? at : null,
    integrity_reviewed_round_ids: [...reviewed].sort(),
  };
}

export interface HoleScoreRow {
  round_id: string;
  score: number | null;
}

export interface RoundTotalRow {
  id: string;
  total_score: number | null;
}

/**
 * Rounds whose scored holes do not add up to the scorecard total the player
 * entered, `golf_rounds.total_score` (`hole_sum_mismatch`, 01 §2 and 07 §2
 * A: "Hole total 74, scorecard 76"). Not `deriveRoundTotal`: front and back
 * nine are written from the holes, so they always agree with the holes
 * (production 2026-10-20: 15 of 762 complete rounds differ from
 * `total_score`, 0 from front + back). Only rounds with at least one scored hole
 * and a total are judged; a hole with no score skips the round (it is not
 * fully recorded, which the countable rule already handles).
 */
export function holeSumMismatchRoundIds(rounds: readonly RoundTotalRow[], holes: readonly HoleScoreRow[]): string[] {
  const sums = new Map<string, { sum: number; missing: boolean; n: number }>();
  for (const h of holes) {
    const s = sums.get(h.round_id) ?? { sum: 0, missing: false, n: 0 };
    if (h.score === null || !Number.isFinite(h.score)) s.missing = true;
    else s.sum += h.score;
    s.n += 1;
    sums.set(h.round_id, s);
  }
  const out: string[] = [];
  for (const r of rounds) {
    const s = sums.get(r.id);
    if (!s || s.missing || s.n === 0 || r.total_score === null) continue;
    if (s.sum !== r.total_score) out.push(r.id);
  }
  return out;
}
