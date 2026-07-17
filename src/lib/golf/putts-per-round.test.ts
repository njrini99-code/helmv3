import { describe, it, expect } from 'vitest';
import {
  aggregatePuttsFromHoles,
  calculatePuttsPerRound,
  calculatePuttsPerRoundFromHoles,
  type PuttsPerRoundHole,
} from './putts-per-round';

describe('calculatePuttsPerRound', () => {
  it('normalizes an 18-hole round to itself', () => {
    expect(calculatePuttsPerRound(30, 18)).toBe(30);
  });

  it('normalizes a 9-hole round up to an 18-hole equivalent', () => {
    expect(calculatePuttsPerRound(16, 9)).toBe(32);
  });

  it('returns null when there are no holes with putts', () => {
    expect(calculatePuttsPerRound(0, 0)).toBeNull();
  });

  it('returns null when total putts is zero even if holes are present', () => {
    expect(calculatePuttsPerRound(0, 18)).toBeNull();
  });

  // The #917 regression: a round with some holes missing a recorded putts
  // value must divide by the holes that DO have one, not by every hole
  // played — dividing by "every hole played" dilutes the average downward
  // for any player with even one unlogged hole, which is exactly why Team
  // Stats (33.3) and the player profile (32.6) disagreed for the same player.
  it('divides by holes-with-putts, not total holes played', () => {
    // 16 holes logged (32 putts), 2 holes in the round have no recorded putts.
    // Correct: 32 / 16 * 18 = 36. The old player-cockpit formula divided by
    // 18 (every hole played) instead of 16, giving 32/18*18 = 32 — the wrong,
    // diluted number.
    expect(calculatePuttsPerRound(32, 16)).toBe(36);
  });
});

describe('aggregatePuttsFromHoles', () => {
  it('sums putts and counts only holes with a recorded, positive value', () => {
    const holes: PuttsPerRoundHole[] = [
      { putts: 2 },
      { putts: null }, // unlogged — excluded from both numerator and denominator
      { putts: 1 },
      { putts: 0 }, // treated as unlogged, not a real 0-putt hole
    ];
    expect(aggregatePuttsFromHoles(holes)).toEqual({ totalPutts: 3, holesWithPutts: 2 });
  });

  it('returns zeros for an empty list', () => {
    expect(aggregatePuttsFromHoles([])).toEqual({ totalPutts: 0, holesWithPutts: 0 });
  });
});

describe('calculatePuttsPerRoundFromHoles', () => {
  it('matches the Team Stats hole-level aggregation for a mixed-completeness round', () => {
    // One 18-hole round where 2 holes never got a putts value recorded.
    const holes: PuttsPerRoundHole[] = Array.from({ length: 16 }, (): PuttsPerRoundHole => ({ putts: 2 })).concat([
      { putts: null },
      { putts: null },
    ]);
    // 16 holes * 2 putts = 32 total, over 16 holes-with-putts, normalized to 18.
    expect(calculatePuttsPerRoundFromHoles(holes)).toBe(36);
  });

  it('returns null for an all-unlogged round', () => {
    const holes: PuttsPerRoundHole[] = [{ putts: null }, { putts: null }];
    expect(calculatePuttsPerRoundFromHoles(holes)).toBeNull();
  });
});
