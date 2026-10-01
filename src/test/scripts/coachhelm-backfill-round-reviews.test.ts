import { describe, it, expect } from 'vitest';
import {
  selectBackfillCandidates,
  type CandidateRoundRow,
} from '../../../scripts/coachhelm-backfill-round-reviews';

/**
 * Audit row 39 backfill: the selection rule is the safety-relevant part of the
 * script (the write path is `writeReviewIfAbsent`, covered in
 * deterministic-review.test.ts). Idempotent by construction: a round with a
 * review is never a candidate.
 */
function round(overrides: Partial<CandidateRoundRow> = {}): CandidateRoundRow {
  return {
    id: 'r', player_id: 'p-active', round_date: '2026-09-01', status: 'completed', is_test: false,
    holes_played: 18, total_score: 78, front_nine: 39, back_nine: 39, total_putts: 31,
    ...overrides,
  };
}

describe('selectBackfillCandidates', () => {
  const active = new Set(['p-active']);

  it('keeps a completed, countable, unreviewed round of an active player', () => {
    expect(selectBackfillCandidates([round({ id: 'keep' })], new Set(), active).map((r) => r.id)).toEqual(['keep']);
  });

  it('skips rounds that already have a review (idempotent re-run)', () => {
    expect(selectBackfillCandidates([round({ id: 'done' })], new Set(['done']), active)).toEqual([]);
  });

  it('skips test, non-completed and non-countable rounds', () => {
    const out = selectBackfillCandidates([
      round({ id: 'test', is_test: true }),
      round({ id: 'live', status: 'in_progress' }),
      round({ id: 'holes-missing', back_nine: null }),
      round({ id: 'implausible', total_score: 37, front_nine: 18, back_nine: 19, total_putts: 18 }),
    ], new Set(), active);
    expect(out).toEqual([]);
  });

  it('restricts to active players when a player set is given, and not when it is null', () => {
    const rows = [round({ id: 'a' }), round({ id: 'b', player_id: 'p-inactive' })];
    expect(selectBackfillCandidates(rows, new Set(), active).map((r) => r.id)).toEqual(['a']);
    expect(selectBackfillCandidates(rows, new Set(), null).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
