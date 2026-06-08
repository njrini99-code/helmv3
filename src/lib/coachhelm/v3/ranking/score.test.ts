import { describe, it, expect } from 'vitest';
import { isFloorExemptMetric, priorityFloorScore, sampleDamping, DAMP_MIN } from './score';

describe('isFloorExemptMetric', () => {
  it('exempts every par-scoring metric (descriptive, ×10 leverage family)', () => {
    expect(isFloorExemptMetric('scoring_par_3')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_4')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_5')).toBe(true);
  });

  it('exempts the warmup opening-hole metric', () => {
    expect(isFloorExemptMetric('opening_hole_delta')).toBe(true);
  });

  it('does NOT exempt an actionable diagnostic metric', () => {
    expect(isFloorExemptMetric('approach_proximity_175_plus_ft')).toBe(false);
    expect(isFloorExemptMetric('putts_made_5_10ft_pct')).toBe(false);
    expect(isFloorExemptMetric('scrambling_pct_sand')).toBe(false);
  });

  it('respects the anchored single-digit boundary of the par-scoring regex', () => {
    expect(isFloorExemptMetric('scoring_par_')).toBe(false); // no digit
    expect(isFloorExemptMetric('scoring_par_34')).toBe(false); // two digits
    expect(isFloorExemptMetric('scoring_par_3x')).toBe(false); // trailing junk
  });

  it('treats undefined / empty metric as not exempt (gets a floor)', () => {
    expect(isFloorExemptMetric(undefined)).toBe(false);
    expect(isFloorExemptMetric('')).toBe(false);
  });
});

describe('priorityFloorScore', () => {
  it('ranks urgent > high > medium > low and is strictly monotonic', () => {
    const u = priorityFloorScore('urgent');
    const h = priorityFloorScore('high');
    const m = priorityFloorScore('medium');
    const l = priorityFloorScore('low');
    expect(u).toBeGreaterThan(h);
    expect(h).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(0); // even 'low' must be orderable, never 0
  });

  it('pins the exact floor for each priority (catches a constant typo)', () => {
    expect(priorityFloorScore('urgent')).toBe(4);
    expect(priorityFloorScore('high')).toBe(3);
    expect(priorityFloorScore('medium')).toBe(2);
    expect(priorityFloorScore('low')).toBe(1);
    expect(priorityFloorScore(undefined)).toBe(1); // falls back to 'low'
  });

  it('defaults an absent priority to the low floor', () => {
    expect(priorityFloorScore(undefined)).toBe(priorityFloorScore('low'));
  });
});

describe('sampleDamping', () => {
  it('returns 1.0 once sample meets the reference depth (no penalty)', () => {
    expect(sampleDamping(12)).toBe(1);
    expect(sampleDamping(50)).toBe(1);
  });

  it('damps a thin sample below 1 but keeps it positive', () => {
    const thin = sampleDamping(3);
    expect(thin).toBeLessThan(1);
    expect(thin).toBeGreaterThan(0);
  });

  it('damps a 5-round sample harder than a 12-round sample', () => {
    expect(sampleDamping(5)).toBeLessThan(sampleDamping(12));
  });

  it('treats absent/zero/NaN sample as fully damped-out to the exact floor', () => {
    expect(sampleDamping(undefined)).toBe(DAMP_MIN);
    expect(sampleDamping(0)).toBe(DAMP_MIN);
    expect(sampleDamping(Number.NaN)).toBe(DAMP_MIN);
  });
});
