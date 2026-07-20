/**
 * ============================================================================
 * BandHistogram — pure scale/ramp helper tests
 * ----------------------------------------------------------------------------
 * Covers the pct→ramp-band bucketing (null must stay distinct from a real
 * 0%), the n/pct height-fraction fallback rule, ghost-band detection, and the
 * benchmark offset clamp.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import {
  computeBenchmarkTop,
  computeBarHeightFraction,
  computeBenchmarkOffsetPct,
  computeMaxN,
  computePctTrackOffset,
  isGhostBand,
  rampBandForPct,
} from './BandHistogram';

describe('rampBandForPct', () => {
  it('null/undefined/NaN → band 0 (no data — distinct from a real 0%)', () => {
    expect(rampBandForPct(null)).toBe(0);
    expect(rampBandForPct(undefined)).toBe(0);
    expect(rampBandForPct(Number.NaN)).toBe(0);
  });

  it('a real 0% is band 1, never band 0 (it IS data — zero occurrences)', () => {
    expect(rampBandForPct(0)).toBe(1);
  });

  it('steps through the quartile thresholds', () => {
    expect(rampBandForPct(10)).toBe(1);
    expect(rampBandForPct(25)).toBe(2);
    expect(rampBandForPct(50)).toBe(3);
    expect(rampBandForPct(75)).toBe(4);
    expect(rampBandForPct(100)).toBe(4);
  });
});

describe('computeMaxN', () => {
  it('returns the largest finite n across bands', () => {
    expect(computeMaxN([{ n: 4 }, { n: 12 }, { n: null }, { n: 7 }])).toBe(12);
  });

  it('returns 0 when no band has a finite n', () => {
    expect(computeMaxN([{ n: null }, { n: Number.NaN }])).toBe(0);
    expect(computeMaxN([])).toBe(0);
  });
});

describe('isGhostBand', () => {
  it('true only when BOTH n and pct are missing', () => {
    expect(isGhostBand({ n: null, pct: null })).toBe(true);
    expect(isGhostBand({ n: 0, pct: null })).toBe(false);
    expect(isGhostBand({ n: null, pct: 0 })).toBe(false);
  });
});

describe('computeBarHeightFraction', () => {
  it('prefers n, scaled against the group max, when n is present', () => {
    expect(computeBarHeightFraction({ n: 5, pct: 90 }, 10)).toBeCloseTo(0.5);
  });

  it('falls back to pct/100 when n is absent', () => {
    expect(computeBarHeightFraction({ n: null, pct: 40 }, 10)).toBeCloseTo(0.4);
  });

  it('a ghost band (neither n nor pct) is exactly 0', () => {
    expect(computeBarHeightFraction({ n: null, pct: null }, 10)).toBe(0);
  });

  it('never exceeds 1 even if n somehow exceeds maxN', () => {
    expect(computeBarHeightFraction({ n: 15, pct: null }, 10)).toBe(1);
  });

  it('n present but maxN is 0 (defensive) falls back to pct rather than dividing by zero', () => {
    expect(computeBarHeightFraction({ n: 5, pct: 60 }, 0)).toBeCloseTo(0.6);
  });
});

describe('computeBenchmarkOffsetPct', () => {
  it('null/undefined/non-finite → no benchmark line', () => {
    expect(computeBenchmarkOffsetPct(null)).toBeNull();
    expect(computeBenchmarkOffsetPct(undefined)).toBeNull();
    expect(computeBenchmarkOffsetPct(Number.NaN)).toBeNull();
  });

  it('clamps into [0, 100]', () => {
    expect(computeBenchmarkOffsetPct(-10)).toBe(0);
    expect(computeBenchmarkOffsetPct(140)).toBe(100);
    expect(computeBenchmarkOffsetPct(42)).toBe(42);
  });
});

describe('computePctTrackOffset', () => {
  it('100 (top of the track) -> 0px offset from the top', () => {
    expect(computePctTrackOffset(100)).toBe(0);
  });

  it('0 (bottom of the track) -> the full track height', () => {
    expect(computePctTrackOffset(0)).toBeGreaterThan(0);
    expect(computePctTrackOffset(50)).toBeCloseTo(computePctTrackOffset(0) / 2);
  });

  it('is monotonically decreasing in pct (a higher rate sits higher, smaller offset)', () => {
    const low = computePctTrackOffset(10);
    const mid = computePctTrackOffset(50);
    const high = computePctTrackOffset(90);
    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
  });

  it('depends only on pct, never on n/volume — the property the benchmark-comparison bug violated', () => {
    // Before the fix, a band's on-screen vertical position (bar height) was
    // n/maxN when n was present, so two bands with the SAME pct but wildly
    // different n rendered at different heights relative to a pct benchmark.
    // The marker computed here is a pure function of pct alone.
    const highVolumeLowRate = computePctTrackOffset(40);
    const lowVolumeHighRate = computePctTrackOffset(95);
    expect(lowVolumeHighRate).toBeLessThan(highVolumeLowRate);
  });
});

describe('computeBenchmarkTop', () => {
  it('is the track offset shifted by one fixed pct-label slot + column gap — never by per-column content', () => {
    // The row guarantees an identical track top for every column (items-start
    // + fixed-height label/n slots), so the overlay's position is a constant
    // shift of the shared track scale. If this relationship breaks, the
    // benchmark line stops landing on the columns' rate markers.
    const slotShift = computeBenchmarkTop(100); // track offset at 100 is 0
    expect(slotShift).toBeGreaterThan(0);
    expect(computeBenchmarkTop(0)).toBeCloseTo(slotShift + computePctTrackOffset(0));
    expect(computeBenchmarkTop(50)).toBeCloseTo(slotShift + computePctTrackOffset(50));
  });

  it('preserves the track scale: equal pct steps map to equal pixel steps', () => {
    const step1 = computeBenchmarkTop(25) - computeBenchmarkTop(50);
    const step2 = computeBenchmarkTop(50) - computeBenchmarkTop(75);
    expect(step1).toBeCloseTo(step2);
  });
});
