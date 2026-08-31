import { describe, it, expect } from 'vitest';

import {
  freeRoundNumbers,
  type QualifierOption,
} from '@/components/fairway/pages/rounds/RoundTypeEditor';

function option(over: Partial<QualifierOption> = {}): QualifierOption {
  return { id: 'q1', name: 'Kentucky Round 4-6', numRounds: 3, ...over };
}

/**
 * The 2026-08-30 report — "players still cannot edit round type after the
 * round" — was this rule missing.
 *
 * The real case, from production: a player entered in a 3-round qualifier had
 * already recorded rounds 1 and 2, and his mis-typed practice round was the
 * missing round 3. The picker offered 1, 2 and 3 and defaulted to 1, so the
 * save died on the server's clash check every time, with nothing on screen
 * saying which numbers were free.
 */
describe('freeRoundNumbers', () => {
  it('offers every slot when the player holds none of them', () => {
    expect(freeRoundNumbers(option({ takenRoundNumbers: [] }))).toEqual([1, 2, 3]);
  });

  it('leaves only the genuinely open slot — the production case', () => {
    expect(freeRoundNumbers(option({ takenRoundNumbers: [1, 2] }))).toEqual([3]);
  });

  it('returns nothing when the player already fills the qualifier', () => {
    expect(freeRoundNumbers(option({ takenRoundNumbers: [1, 2, 3] }))).toEqual([]);
  });

  /** A single-round qualifier is the sharpest version: the old picker was not
   *  rendered at all when numRounds === 1, pinning the value to a slot that
   *  could already be taken. */
  it('reports a full single-round qualifier as having no free slot', () => {
    expect(freeRoundNumbers(option({ numRounds: 1, takenRoundNumbers: [1] }))).toEqual([]);
    expect(freeRoundNumbers(option({ numRounds: 1, takenRoundNumbers: [] }))).toEqual([1]);
  });

  it('treats a missing takenRoundNumbers as nothing taken, not as everything taken', () => {
    expect(freeRoundNumbers(option())).toEqual([1, 2, 3]);
  });

  it('ignores slot numbers outside the qualifier and never returns a duplicate', () => {
    const free = freeRoundNumbers(option({ numRounds: 2, takenRoundNumbers: [2, 7, 7] }));
    expect(free).toEqual([1]);
  });

  it('is empty for no qualifier rather than throwing', () => {
    expect(freeRoundNumbers(undefined)).toEqual([]);
  });

  it('treats a zero/!invalid numRounds as a single slot', () => {
    expect(freeRoundNumbers(option({ numRounds: 0, takenRoundNumbers: [] }))).toEqual([1]);
  });
});
