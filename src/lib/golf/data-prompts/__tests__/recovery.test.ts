import { describe, expect, it } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';
import { shotReducer } from '@/hooks/golf/use-shot-state-machine';
import {
  isRecoveryCandidate,
  isRoundStartMoment,
  lieAfterRecoveryFor,
  lieAfterRecoveryFromRow,
  lieAfterRecoveryPayload,
  recoveryAskShot,
  setLieAfterRecovery,
  withoutLieAfterRecovery,
} from '../recovery';

const TEE: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 400,
  distanceUnitBefore: 'yards',
  result: 'rough',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 250,
  isPenalty: false,
};
const NEXT: ShotRecord = { ...TEE, shotNumber: 2, shotType: 'approach', lieBefore: 'rough', result: 'green' };

describe('recovery rules', () => {
  it('asks only after a rough or other tee shot', () => {
    expect(isRecoveryCandidate(TEE)).toBe(true);
    expect(isRecoveryCandidate({ ...TEE, result: 'other' })).toBe(true);
    for (const result of ['fairway', 'sand', 'green', 'penalty'] as const) {
      expect(isRecoveryCandidate({ ...TEE, result })).toBe(false);
    }
    expect(isRecoveryCandidate({ ...TEE, isPenalty: true })).toBe(false);
    expect(isRecoveryCandidate({ ...TEE, shotType: 'approach' })).toBe(false);
  });

  it('asks about the tee shot only while it is the last shot and unanswered', () => {
    expect(recoveryAskShot([])).toBeNull();
    expect(recoveryAskShot([TEE])).toBe(TEE);
    expect(recoveryAskShot([TEE, NEXT])).toBeNull();
    expect(recoveryAskShot([{ ...TEE, lieAfterRecovery: false }])).toBeNull();
  });

  it('the payload carries the key only for an answered candidate', () => {
    expect(lieAfterRecoveryPayload(TEE)).toEqual({});
    expect(lieAfterRecoveryPayload({ ...TEE, lieAfterRecovery: true })).toEqual({ lie_after_recovery: true });
    expect(lieAfterRecoveryPayload({ ...TEE, lieAfterRecovery: false })).toEqual({ lie_after_recovery: false });
    // A stale answer on a shot edited to the fairway is never written.
    expect(lieAfterRecoveryPayload({ ...TEE, result: 'fairway', lieAfterRecovery: true })).toEqual({});
    expect(lieAfterRecoveryFor({ ...NEXT, lieAfterRecovery: true })).toBeNull();
  });

  it('setLieAfterRecovery changes only the candidate and returns the same array otherwise', () => {
    const history = [TEE, NEXT];
    const next = setLieAfterRecovery(history, 1, true);
    expect(next).not.toBe(history);
    expect(next[0]).toEqual({ ...TEE, lieAfterRecovery: true });
    expect(next[1]).toBe(NEXT);
    expect(setLieAfterRecovery(history, 2, true)).toBe(history);
    expect(setLieAfterRecovery(history, 9, true)).toBe(history);
    expect(setLieAfterRecovery(next, 1, true)).toBe(next);
  });

  it('the reducer action sets the answer and nothing else', () => {
    const state = { shotHistory: [TEE], currentShot: 2 } as unknown as Parameters<typeof shotReducer>[0];
    const after = shotReducer(state, { type: 'TAG_LIE_AFTER_RECOVERY', payload: { shotNumber: 1, recovery: false } });
    expect(after.shotHistory).toEqual([{ ...TEE, lieAfterRecovery: false }]);
    expect(shotReducer(state, { type: 'TAG_LIE_AFTER_RECOVERY', payload: { shotNumber: 2, recovery: true } })).toBe(state);
  });

  it('reads a stored row: boolean when the column is there, undefined before the migration', () => {
    expect(lieAfterRecoveryFromRow({ lie_after_recovery: true })).toBe(true);
    expect(lieAfterRecoveryFromRow({ lie_after_recovery: false })).toBe(false);
    expect(lieAfterRecoveryFromRow({ lie_after_recovery: null })).toBeUndefined();
    expect(lieAfterRecoveryFromRow({})).toBeUndefined();
  });
});

describe('withoutLieAfterRecovery', () => {
  it('drops only the recovery key for the direct-table fallbacks', () => {
    const answered: { shot_number: number; lie_after_recovery?: boolean } = { shot_number: 1, lie_after_recovery: true };
    const unanswered: { shot_number: number; lie_after_recovery?: boolean } = { shot_number: 2 };
    expect(withoutLieAfterRecovery(answered)).toEqual({ shot_number: 1 });
    expect(withoutLieAfterRecovery(unanswered)).toEqual({ shot_number: 2 });
  });
});

describe('isRoundStartMoment', () => {
  const blank = [null, null, null];
  it('is the first hole in play order with no score and no shot', () => {
    expect(isRoundStartMoment({ holeScores: blank, currentHoleIndex: 0, shotCount: 0 })).toBe(true);
    expect(isRoundStartMoment({ holeScores: blank, currentHoleIndex: 0, shotCount: 1 })).toBe(false);
    expect(isRoundStartMoment({ holeScores: blank, currentHoleIndex: 1, shotCount: 0 })).toBe(false);
    expect(isRoundStartMoment({ holeScores: [4, null, null], currentHoleIndex: 0, shotCount: 0 })).toBe(false);
  });
  it('follows a shotgun start', () => {
    expect(isRoundStartMoment({ holeScores: blank, currentHoleIndex: 1, startHole: 2, shotCount: 0 })).toBe(true);
    expect(isRoundStartMoment({ holeScores: blank, currentHoleIndex: 0, startHole: 2, shotCount: 0 })).toBe(false);
  });
});
