import { describe, expect, it } from 'vitest';
import { decideUnderReview, holeSumMismatchRoundIds, isUnderReviewCorrection } from '../under-review';
import type { CorrectionRow, ReadLifecycleMeta } from '../types';
import { NOW } from './fixtures';

function correction(id: string, kind: string, created_at: string, reason: string | null = null): CorrectionRow {
  return { id, insight_id: 'a', kind, reason, alternative_cause_label: kind === 'wrong_cause' ? 'tee shot' : null, created_at };
}

const meta = (m: Partial<ReadLifecycleMeta> = {}): ReadLifecycleMeta => ({ checkpoints_seen: 1, ...m });

describe('isUnderReviewCorrection', () => {
  it('wrong cause, and Not this with the reason wrong; nothing else', () => {
    expect(isUnderReviewCorrection({ kind: 'wrong_cause', reason: null })).toBe(true);
    expect(isUnderReviewCorrection({ kind: 'not_this', reason: 'wrong' })).toBe(true);
    expect(isUnderReviewCorrection({ kind: 'not_this', reason: 'not_important' })).toBe(false);
    expect(isUnderReviewCorrection({ kind: 'snooze', reason: null })).toBe(false);
    expect(isUnderReviewCorrection({ kind: 'confirm', reason: null })).toBe(false);
  });
});

describe('decideUnderReview', () => {
  it('a wrong-cause correction since the last checkpoint sets it; older ones do not', () => {
    const r = decideUnderReview({
      meta: meta(),
      covered: false,
      previousCheckpointAt: '2026-10-10T00:00:00.000Z',
      corrections: [correction('c-old', 'wrong_cause', '2026-10-01T00:00:00.000Z'), correction('c1', 'wrong_cause', '2026-10-14T00:00:00.000Z')],
      flaggedRoundIds: [],
      nowIso: NOW,
    });
    expect(r.under_review).toMatchObject({ reason: 'wrong_cause', correction_id: 'c1', since: '2026-10-14T00:00:00.000Z', alternative_cause_label: 'tee shot' });
    expect(r.under_review_at_checkpoint).toBe(1);
  });

  it('Not this: wrong sets it; Not this: not important does not', () => {
    const base = { meta: meta(), covered: false, previousCheckpointAt: null, flaggedRoundIds: [], nowIso: NOW };
    expect(decideUnderReview({ ...base, corrections: [correction('c', 'not_this', '2026-10-14T00:00:00.000Z', 'wrong')] }).under_review?.reason).toBe('not_this_wrong');
    expect(decideUnderReview({ ...base, corrections: [correction('c', 'not_this', '2026-10-14T00:00:00.000Z', 'not_important')] }).under_review).toBeNull();
  });

  it('clears at the next covering checkpoint and the spent correction never sets it again', () => {
    const set = { reason: 'wrong_cause' as const, since: '2026-10-14T00:00:00.000Z', correction_id: 'c1' };
    const corrections = [correction('c1', 'wrong_cause', '2026-10-14T00:00:00.000Z')];
    // Not covered tonight: stays.
    const stays = decideUnderReview({ meta: meta({ checkpoints_seen: 1, under_review: set, under_review_at_checkpoint: 1 }), covered: false, previousCheckpointAt: null, corrections, flaggedRoundIds: [], nowIso: NOW });
    expect(stays.under_review).toEqual(set);
    // Covered (checkpoints_seen now 2): cleared, not re-set from c1.
    const cleared = decideUnderReview({ meta: meta({ checkpoints_seen: 2, under_review: set, under_review_at_checkpoint: 1 }), covered: true, previousCheckpointAt: null, corrections, flaggedRoundIds: [], nowIso: NOW });
    expect(cleared.under_review).toBeNull();
    expect(cleared.under_review_at_checkpoint).toBeNull();
    // The next night (last checkpoint is now after c1): still clear.
    const next = decideUnderReview({ meta: meta({ checkpoints_seen: 2 }), covered: false, previousCheckpointAt: NOW, corrections, flaggedRoundIds: [], nowIso: NOW });
    expect(next.under_review).toBeNull();
  });

  it('an integrity flag sets it once; after a checkpoint the same round is not flagged again', () => {
    const first = decideUnderReview({ meta: meta(), covered: false, previousCheckpointAt: null, corrections: [], flaggedRoundIds: ['r2', 'r2'], nowIso: NOW });
    expect(first.under_review).toMatchObject({ reason: 'integrity', round_ids: ['r2'] });
    const after = decideUnderReview({
      meta: meta({ checkpoints_seen: 2, under_review: first.under_review, under_review_at_checkpoint: 1 }),
      covered: true,
      previousCheckpointAt: null,
      corrections: [],
      flaggedRoundIds: ['r2'],
      nowIso: NOW,
    });
    expect(after.under_review).toBeNull();
    expect(after.integrity_reviewed_round_ids).toEqual(['r2']);
    // A new flagged round still sets it.
    const fresh = decideUnderReview({ meta: meta({ checkpoints_seen: 2, integrity_reviewed_round_ids: ['r2'] }), covered: false, previousCheckpointAt: null, corrections: [], flaggedRoundIds: ['r2', 'r5'], nowIso: NOW });
    expect(fresh.under_review).toMatchObject({ reason: 'integrity', round_ids: ['r5'] });
  });
});

describe('holeSumMismatchRoundIds', () => {
  it('flags rounds whose scored holes do not add up to the entered total', () => {
    const rounds = [
      { id: 'ok', total_score: 9 },
      { id: 'bad', total_score: 10 },
      { id: 'partial', total_score: 99 },
      { id: 'nototal', total_score: null },
      { id: 'noholes', total_score: 70 },
    ];
    const holes = [
      { round_id: 'ok', score: 4 },
      { round_id: 'ok', score: 5 },
      { round_id: 'bad', score: 4 },
      { round_id: 'bad', score: 5 },
      { round_id: 'partial', score: 4 },
      { round_id: 'partial', score: null },
      { round_id: 'nototal', score: 4 },
    ];
    expect(holeSumMismatchRoundIds(rounds, holes)).toEqual(['bad']);
  });
});
