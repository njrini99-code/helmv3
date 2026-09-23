/** RoundField's geometry: where a bar lands, and how tall it is. */
import { describe, it, expect } from 'vitest';

import { roundPositions, deviationCap } from './round-field';
import { stageRounds, stageState, type StageRound } from './player-home-logic';

const build = (scores: number[], dated = false) =>
  stageState(
    stageRounds(
      scores.map((v, i) => ({
        label: `R${i}`,
        value: v,
        ...(dated ? { date: `2026-0${(i % 9) + 1}-01` } : {}),
      })),
      null,
    ),
  );

describe('roundPositions', () => {
  it('insets ordinal spacing by half a step so the end bars are not clipped', () => {
    const xs = roundPositions(build([75, 76, 77, 78]));
    expect(xs).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(100);
  });

  it('centres a single round instead of pinning it to an edge', () => {
    expect(roundPositions(build([75]))).toEqual([50]);
  });

  it('is empty when there is nothing to plot', () => {
    expect(roundPositions(build([]))).toEqual([]);
  });

  it('uses real time spacing once every round carries a date', () => {
    const state = build([75, 76, 77], true);
    expect(state.axis).toBe('date');
    const xs = roundPositions(state);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(100);
    // Unequal gaps: Jan to Feb is shorter than Feb to Mar.
    expect(xs[1]! - xs[0]!).not.toBeCloseTo(xs[2]! - xs[1]!, 5);
  });

  it('survives a single-day date domain rather than dividing by zero', () => {
    const rounds = stageRounds(
      [
        { label: 'a', value: 75, date: '2026-06-01' },
        { label: 'b', value: 76, date: '2026-06-01' },
      ],
      null,
    );
    for (const x of roundPositions(stageState(rounds))) expect(Number.isFinite(x)).toBe(true);
  });
});

describe('deviationCap', () => {
  const rounds = (scores: number[]): StageRound[] => stageRounds(
    scores.map((v, i) => ({ label: `R${i}`, value: v })),
    null,
  );

  it('follows the player\'s own largest swing', () => {
    expect(deviationCap(rounds([70, 76, 82]), 76)).toBe(6);
  });

  it('never drops below 3, so a steady player still gets visible bars', () => {
    expect(deviationCap(rounds([76, 76, 77]), 76)).toBe(3);
  });

  it('stops at 12, so one blow-up round cannot flatten a season', () => {
    expect(deviationCap(rounds([76, 77, 140]), 76)).toBe(12);
  });

  it('is stable with nothing to measure', () => {
    expect(deviationCap([], 76)).toBe(3);
  });
});
