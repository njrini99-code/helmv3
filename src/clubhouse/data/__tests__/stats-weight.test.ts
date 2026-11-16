import { describe, expect, it } from 'vitest';
import { MIN_TREND_POINTS, roundHalves } from '../stats-weight';

// Stats and charts audit, 15 Nov 2026, CH-10: with three points the middle one is in neither half, so "better over these weeks" was
// the last week against the first. A change needs two points a half.

type R = { player_id: string; v: number; holes_played: number };
const r = (player_id: string, v: number): R => ({ player_id, v, holes_played: 18 });
const pick = (x: R) => x.v;

describe('roundHalves needs two points a half (CH-10)', () => {
  it('reads no change from three groups', () => {
    expect(MIN_TREND_POINTS).toBe(4);
    expect(roundHalves([[r('a', 70)], [r('a', 75)], [r('a', 80)]], pick, 'score')).toBeNull();
  });

  it('reads one from four', () => {
    expect(roundHalves([[r('a', 70)], [r('a', 72)], [r('a', 74)], [r('a', 76)]], pick, 'score')!.delta).toBeCloseTo(4);
  });

  it('counts only the points with a value', () => {
    const empty = [{ player_id: 'a', v: null as unknown as number, holes_played: 18 }];
    expect(roundHalves([[r('a', 70)], empty, [r('a', 72)], [r('a', 74)]], (x) => x.v, 'score')).toBeNull();
  });
});
