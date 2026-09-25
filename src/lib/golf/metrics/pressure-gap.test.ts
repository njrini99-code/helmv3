import { describe, expect, it } from 'vitest';
import { computePressureGap, splitPressureRounds } from './pressure-gap';

const r = (round_type: string | null, score_to_par: number | null, holes_played: number | null = 18) => ({
  round_type,
  score_to_par,
  holes_played,
});

describe('computePressureGap', () => {
  it('is pressure mean minus practice mean (positive = worse under pressure)', () => {
    const gap = computePressureGap(
      [r('tournament', 4), r('qualifier', 6), r('practice', 1), r('practice', 3)],
      { minPerSide: 2 },
    );
    expect(gap).toEqual({ gap: 3, pressureAverage: 5, practiceAverage: 2, pressureRounds: 2, practiceRounds: 2 });
  });

  it('scales 9-hole rounds to 18 and treats a missing hole count as 18', () => {
    const { pressure, practice } = splitPressureRounds([
      r('practice', 3, 9),
      r('tournament', 2, null),
      { round_type: 'tournament', score_to_par: 5 },
    ]);
    expect(practice).toEqual([6]);
    expect(pressure).toEqual([2, 5]);
  });

  it('counts the legacy "qualifying" spelling as pressure and ignores other types', () => {
    const { pressure, practice } = splitPressureRounds([
      r('qualifying', 1),
      r('casual', 9),
      r(null, 9),
      r('practice', 0),
    ]);
    expect(pressure).toEqual([1]);
    expect(practice).toEqual([0]);
  });

  it('skips rounds with no to par and returns null under the floor', () => {
    const rounds = [r('tournament', 4), r('tournament', null), r('practice', 1), r('practice', 2)];
    expect(computePressureGap(rounds, { minPerSide: 2 })).toBeNull();
    expect(computePressureGap(rounds, { minPerSide: 1 })?.pressureRounds).toBe(1);
  });
});
