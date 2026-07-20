import { describe, it, expect } from 'vitest';
import { rankHoleAnalyses, DEFAULT_MIN_PLAYS } from './worst-hole-ranking';
import type { HoleAnalysis } from '@/app/golf/actions/stats-data-types';

function hole(overrides: Partial<HoleAnalysis> & { holeNumber: number }): HoleAnalysis {
  return {
    par: 4,
    averageScore: 4,
    averageToPar: 0,
    timesPlayed: DEFAULT_MIN_PLAYS,
    birdieOrBetter: 0,
    pars: 0,
    bogeys: 0,
    doublePlus: 0,
    trend: 'stable',
    ...overrides,
  };
}

describe('rankHoleAnalyses', () => {
  it('excludes holes below the sample floor even when they are the most extreme', () => {
    const holes = [
      hole({ holeNumber: 1, averageToPar: 3, timesPlayed: 1 }), // one blow-up, excluded
      hole({ holeNumber: 2, averageToPar: 0.5, timesPlayed: 5 }),
      hole({ holeNumber: 3, averageToPar: 0.2, timesPlayed: 5 }),
    ];
    const { worstHoles } = rankHoleAnalyses(holes);
    expect(worstHoles.map((h) => h.holeNumber)).not.toContain(1);
    expect(worstHoles[0]?.holeNumber).toBe(2);
  });

  it('includes holes at or above the floor', () => {
    const holes = [
      hole({ holeNumber: 1, averageToPar: 1, timesPlayed: DEFAULT_MIN_PLAYS }),
    ];
    const { worstHoles, bestHoles } = rankHoleAnalyses(holes);
    expect(worstHoles.map((h) => h.holeNumber)).toContain(1);
    expect(bestHoles.map((h) => h.holeNumber)).toContain(1);
  });

  it('caps worstHoles and bestHoles at 5 entries', () => {
    const holes = Array.from({ length: 18 }, (_, i) =>
      hole({ holeNumber: i + 1, averageToPar: i, timesPlayed: 10 }),
    );
    const { worstHoles, bestHoles } = rankHoleAnalyses(holes);
    expect(worstHoles).toHaveLength(5);
    expect(bestHoles).toHaveLength(5);
  });

  it('returns empty lists when nothing clears the floor', () => {
    const holes = [
      hole({ holeNumber: 1, averageToPar: 2, timesPlayed: 1 }),
      hole({ holeNumber: 2, averageToPar: -1, timesPlayed: 2 }),
    ];
    const { worstHoles, bestHoles } = rankHoleAnalyses(holes, 3);
    expect(worstHoles).toEqual([]);
    expect(bestHoles).toEqual([]);
  });

  it('orders worstHoles worst-first and bestHoles best-first', () => {
    const holes = [
      hole({ holeNumber: 1, averageToPar: 1.5, timesPlayed: 4 }),
      hole({ holeNumber: 2, averageToPar: -0.5, timesPlayed: 4 }),
      hole({ holeNumber: 3, averageToPar: 0.8, timesPlayed: 4 }),
    ];
    const { worstHoles, bestHoles } = rankHoleAnalyses(holes);
    expect(worstHoles.map((h) => h.holeNumber)).toEqual([1, 3, 2]);
    expect(bestHoles.map((h) => h.holeNumber)).toEqual([2, 3, 1]);
  });

  it('respects a custom minPlays floor', () => {
    const holes = [
      hole({ holeNumber: 1, averageToPar: 2, timesPlayed: 5 }),
      hole({ holeNumber: 2, averageToPar: 1, timesPlayed: 9 }),
    ];
    const { worstHoles } = rankHoleAnalyses(holes, 10);
    expect(worstHoles).toEqual([]);
  });
});
