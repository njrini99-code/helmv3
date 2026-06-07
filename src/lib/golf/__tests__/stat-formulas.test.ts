import { describe, it, expect } from 'vitest';
import {
  round,
  pct,
  computeFairwayPct,
  computeGirPct,
  computeScramblingPct,
  computeSandSavePct,
  computePuttsPerRound,
  computePerRound18,
  computeScoringAverage,
  computeScoringAverageVsPar,
} from '../stat-formulas';

describe('stat-formulas (canonical)', () => {
  describe('pct', () => {
    it('returns null on a zero/empty denominator (no data, not 0%)', () => {
      expect(pct(0, 0)).toBeNull();
      expect(pct(5, 0)).toBeNull();
      expect(pct(1, -1)).toBeNull();
    });
    it('rounds to one decimal place by default', () => {
      expect(pct(1, 3)).toBe(33.3);
      expect(pct(2, 3)).toBe(66.7);
    });
    it('matches the verified prod cache values', () => {
      // STAGE 3: driving accuracy = 121/199 = 60.8% (not 121/203 = 59.6%)
      expect(computeFairwayPct(121, 199)).toBe(60.8);
      expect(computeFairwayPct(121, 203)).toBe(59.6);
      // STAGE 2: Nick 3-5 ft make % = 26/43 = 60.5%
      expect(pct(26, 43)).toBe(60.5);
      // STAGE 4: team sand save = 42/248 = 16.9% (ungated)
      expect(computeSandSavePct(42, 248)).toBe(16.9);
    });
  });

  it('computeGirPct: Nick 169/261 = 64.75 → 64.8 (1dp)', () => {
    expect(computeGirPct(169, 261)).toBe(64.8);
  });

  it('computeScramblingPct', () => {
    expect(computeScramblingPct(31, 92)).toBe(33.7);
    expect(computeScramblingPct(0, 0)).toBeNull();
  });

  it('computePuttsPerRound: 18-hole normalized', () => {
    // 540 putts over 270 holes (15 rounds) → 36.0... use a clean case
    expect(computePuttsPerRound(290, 270)).toBe(round((290 / 270) * 18, 2));
    expect(computePuttsPerRound(36, 18)).toBe(36);
    expect(computePuttsPerRound(10, 0)).toBeNull();
  });

  it('computePerRound18', () => {
    expect(computePerRound18(9, 18)).toBe(9);
    expect(computePerRound18(0, 0)).toBeNull();
  });

  it('computeScoringAverage / vs par over 18-hole rounds', () => {
    expect(computeScoringAverage(1125, 15)).toBe(75);
    expect(computeScoringAverageVsPar(52.5, 15)).toBe(3.5);
    expect(computeScoringAverage(100, 0)).toBeNull();
    expect(computeScoringAverageVsPar(10, 0)).toBeNull();
  });
});
