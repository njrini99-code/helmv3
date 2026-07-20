import { describe, it, expect } from 'vitest';
import {
  clampPct,
  rampBandForRank,
  rampBandForValue,
  gradeDotsForDelta,
  holeBar,
  mapLegacyStatsTab,
} from '../logic';

describe('clampPct', () => {
  it('clamps below 0 to 0', () => {
    expect(clampPct(-5)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(clampPct(140)).toBe(100);
  });
});

describe('rampBandForRank', () => {
  it('best rank of many → band 4', () => {
    expect(rampBandForRank(1, 6)).toBe(4);
  });

  it('worst rank of many → band 1', () => {
    expect(rampBandForRank(6, 6)).toBe(1);
  });

  it('mid-pack rank → band 4 (rank 2 of 6 sits at the q<=0.2 boundary)', () => {
    expect(rampBandForRank(2, 6)).toBe(4);
  });

  it('single-subject field (of<=1) → band 4', () => {
    expect(rampBandForRank(1, 1)).toBe(4);
  });
});

describe('rampBandForValue', () => {
  const thresholds: [number, number, number] = [35, 60, 85];

  it('null value → band 0', () => {
    expect(rampBandForValue(null, thresholds)).toBe(0);
  });

  it('value at/above top threshold → band 4', () => {
    expect(rampBandForValue(90, thresholds)).toBe(4);
  });

  it('value below bottom threshold → band 1', () => {
    expect(rampBandForValue(10, thresholds)).toBe(1);
  });
});

describe('gradeDotsForDelta', () => {
  it('delta -3 → 5 (career day)', () => {
    expect(gradeDotsForDelta(-3)).toBe(5);
  });

  it('delta 0 → 4', () => {
    expect(gradeDotsForDelta(0)).toBe(4);
  });

  it('delta 13 → 1', () => {
    expect(gradeDotsForDelta(13)).toBe(1);
  });

  it('delta 20 → 0', () => {
    expect(gradeDotsForDelta(20)).toBe(0);
  });
});

describe('holeBar', () => {
  it('double bogey (score 7 on par 4) → max height, double tone', () => {
    expect(holeBar({ n: 7, par: 4, score: 7 })).toEqual({ heightPx: 88, tone: 'double' });
  });

  it('par → min height, par tone', () => {
    expect(holeBar({ n: 1, par: 4, score: 4 })).toEqual({ heightPx: 10, tone: 'par' });
  });

  it('birdie → birdie tone', () => {
    const result = holeBar({ n: 3, par: 4, score: 3 });
    expect(result.tone).toBe('birdie');
  });
});

describe('mapLegacyStatsTab', () => {
  it('analysis → standing', () => {
    expect(mapLegacyStatsTab('analysis')).toBe('standing');
  });

  it('scrambling → short-game', () => {
    expect(mapLegacyStatsTab('scrambling')).toBe('short-game');
  });

  it('unmapped tab → null', () => {
    expect(mapLegacyStatsTab('bogus')).toBeNull();
  });

  it('undefined → null', () => {
    expect(mapLegacyStatsTab(undefined)).toBeNull();
  });
});
