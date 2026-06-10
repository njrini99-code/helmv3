import { describe, it, expect } from 'vitest';
import { roundsWeightedMean } from './team-stats-table';

describe('roundsWeightedMean', () => {
  it('weights each value by its round count (Σ value×rounds ÷ Σ rounds)', () => {
    // A 40-round starter at 70.0 must dominate a 2-round walk-on at 80.0.
    const result = roundsWeightedMean([
      { value: 70, rounds: 40 },
      { value: 80, rounds: 2 },
    ]);
    expect(result).toBeCloseTo((70 * 40 + 80 * 2) / 42, 10);
    // Sanity: NOT the unweighted mean of 75.
    expect(result).not.toBeCloseTo(75, 1);
  });

  it('matches the plain mean when every player has the same round count', () => {
    const result = roundsWeightedMean([
      { value: 72, rounds: 10 },
      { value: 76, rounds: 10 },
    ]);
    expect(result).toBeCloseTo(74, 10);
  });

  it('skips null and NaN values without disturbing the weights', () => {
    const result = roundsWeightedMean([
      { value: 70, rounds: 10 },
      { value: null, rounds: 50 },
      { value: Number.NaN, rounds: 50 },
      { value: 74, rounds: 30 },
    ]);
    expect(result).toBeCloseTo((70 * 10 + 74 * 30) / 40, 10);
  });

  it('returns null when no entry carries a value', () => {
    expect(roundsWeightedMean([])).toBeNull();
    expect(
      roundsWeightedMean([
        { value: null, rounds: 5 },
        { value: null, rounds: 0 },
      ]),
    ).toBeNull();
  });

  it('falls back to the unweighted mean when no contributing entry has rounds', () => {
    // Degenerate data — values present but zero round counts.
    const result = roundsWeightedMean([
      { value: 70, rounds: 0 },
      { value: 80, rounds: 0 },
    ]);
    expect(result).toBeCloseTo(75, 10);
  });

  it('ignores zero-round entries when at least one entry has rounds', () => {
    const result = roundsWeightedMean([
      { value: 70, rounds: 12 },
      { value: 99, rounds: 0 },
    ]);
    expect(result).toBeCloseTo(70, 10);
  });
});
