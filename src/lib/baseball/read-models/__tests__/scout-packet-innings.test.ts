// =============================================================================
// Unit tests for scout-packet.ts's summarizePitchingSeason — the #434
// follow-up wiring the shared thirds-aware IP helper (src/lib/baseball/innings.ts)
// into the scout packet's season pitching line. IP is recorded in baseball's
// "outs" notation (.1/.2 = thirds of an inning, not a base-10 fraction), so
// summing with plain `+` is wrong: 5.2 + 3.2 must sum to 9.1 (28 outs), not
// the naive 8.4, and ERA/WHIP must divide by TRUE innings (outs / 3), not the
// notation sum. PURE function; no DB/mocking needed.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { summarizePitchingSeason } from '../scout-packet';

describe('scout-packet summarizePitchingSeason', () => {
  it('sums partial innings via outs (5.2 + 3.2 -> 9.1), not the naive decimal sum', () => {
    const line = summarizePitchingSeason(2, [5.2, 3.2], { h: 5, er: 3, k: 8, bb: 2 });
    expect(line).not.toBeNull();
    // 5.2 = 17 outs, 3.2 = 11 outs -> 28 outs = 9 innings + 1 out = 9.1 notation.
    expect(line?.ip).toBeCloseTo(9.1, 10);
    // Never the naive base-10 sum (8.4) nor another wrong-notation artifact (9.4).
    expect(line?.ip).not.toBeCloseTo(8.4, 1);
    expect(line?.ip).not.toBeCloseTo(9.4, 1);
  });

  it('derives ERA/WHIP from TRUE innings (28 outs / 3 = 9.333…), not the 9.1 notation value', () => {
    const line = summarizePitchingSeason(2, [5.2, 3.2], { h: 5, er: 3, k: 8, bb: 2 });
    const trueInnings = 28 / 3;
    expect(line?.era).toBeCloseTo((3 * 9) / trueInnings, 2);
    expect(line?.whip).toBeCloseTo((2 + 5) / trueInnings, 2);
    expect(line?.era).not.toBeCloseTo((3 * 9) / 9.1, 2);
    expect(line?.whip).not.toBeCloseTo((2 + 5) / 9.1, 2);
  });

  it('the classic #434 regression case: 6.1 + 6.2 -> 13.0, not 12.3', () => {
    const line = summarizePitchingSeason(2, [6.1, 6.2], { h: 8, er: 4, k: 14, bb: 4 });
    expect(line?.ip).toBeCloseTo(13.0, 10);
    expect(line?.ip).not.toBeCloseTo(12.3, 1);
    expect(line?.era).toBeCloseTo((4 * 9) / 13, 2);
    expect(line?.whip).toBeCloseTo((4 + 8) / 13, 2);
  });

  it('ignores null/undefined IP rows and ties count to the passed game total', () => {
    const line = summarizePitchingSeason(3, [6.1, null, undefined], {
      h: 2,
      er: 1,
      k: 3,
      bb: 1,
    });
    expect(line?.g).toBe(3);
    expect(line?.ip).toBeCloseTo(6.1, 10);
  });

  it('returns null (honest empty) when there are zero games', () => {
    expect(summarizePitchingSeason(0, [], { h: 0, er: 0, k: 0, bb: 0 })).toBeNull();
  });

  it('era/whip are null on a zero-innings line rather than dividing by zero', () => {
    const line = summarizePitchingSeason(1, [0], { h: 0, er: 0, k: 0, bb: 0 });
    expect(line?.ip).toBe(0);
    expect(line?.era).toBeNull();
    expect(line?.whip).toBeNull();
  });
});
