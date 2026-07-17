import { describe, it, expect } from 'vitest';
import { toneVsBenchmark, relativeTones, skewTone } from './FairwayStatsCockpit';

// ── toneVsBenchmark (P921 #2 — DetailGrid tone vs a real PGA/team baseline) ───

describe('toneVsBenchmark', () => {
  it('reads good when meaningfully ahead of the benchmark (higher_better)', () => {
    expect(toneVsBenchmark(70, 60, 'higher_better')).toBe('good');
  });

  it('reads warn when meaningfully behind the benchmark (higher_better)', () => {
    expect(toneVsBenchmark(50, 60, 'higher_better')).toBe('warn');
  });

  it('reads neutral inside the dead zone (higher_better)', () => {
    expect(toneVsBenchmark(61, 60, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(58, 60, 'higher_better')).toBe('neutral');
  });

  it('flips ahead/behind for lower_better metrics (e.g. proximity, miss bias)', () => {
    // Lower is better: a smaller value than the benchmark is 'good'.
    expect(toneVsBenchmark(10, 20, 'lower_better')).toBe('good');
    expect(toneVsBenchmark(30, 20, 'lower_better')).toBe('warn');
    expect(toneVsBenchmark(21, 20, 'lower_better')).toBe('neutral');
  });

  it('never fabricates a comparison — neutral when either input is missing', () => {
    expect(toneVsBenchmark(null, 60, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(70, null, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(null, null, 'higher_better')).toBe('neutral');
  });

  it('respects a custom deadzone', () => {
    expect(toneVsBenchmark(65, 60, 'higher_better', 10)).toBe('neutral');
    expect(toneVsBenchmark(71, 60, 'higher_better', 10)).toBe('good');
  });
});

// ── relativeTones (P921 #2 — GirByDistanceBoard self-referential read) ────────

describe('relativeTones', () => {
  it('flags the strongest band good and the weakest band warn when the spread is real', () => {
    const tones = relativeTones([40, 70, 55]);
    expect(tones).toEqual(['warn', 'good', 'neutral']);
  });

  it('stays all-neutral with fewer than 3 real values', () => {
    expect(relativeTones([40, 70])).toEqual(['neutral', 'neutral']);
    expect(relativeTones([40])).toEqual(['neutral']);
    expect(relativeTones([])).toEqual([]);
  });

  it('stays all-neutral when the spread is inside minGap (noise, not a trend)', () => {
    expect(relativeTones([50, 52, 54])).toEqual(['neutral', 'neutral', 'neutral']);
  });

  it('treats nulls as honest gaps, never fabricating a tone for missing data', () => {
    const tones = relativeTones([40, null, 70, 55]);
    expect(tones).toEqual(['warn', 'neutral', 'good', 'neutral']);
  });

  it('respects a custom minGap', () => {
    expect(relativeTones([50, 55, 60], 20)).toEqual(['neutral', 'neutral', 'neutral']);
    expect(relativeTones([50, 55, 60], 5)).toEqual(['warn', 'neutral', 'good']);
  });
});

// ── skewTone (P921 #2 — TeeMissByClub L/R symmetry read, no external baseline) ─

describe('skewTone', () => {
  it('warns when a share is meaningfully lopsided', () => {
    expect(skewTone(70)).toBe('warn');
    expect(skewTone(62)).toBe('warn');
  });

  it('reads neutral for a roughly even split', () => {
    expect(skewTone(50)).toBe('neutral');
    expect(skewTone(55)).toBe('neutral');
  });

  it('never reads good — a missed fairway is never a positive outcome', () => {
    expect(skewTone(0)).toBe('neutral');
    expect(skewTone(100)).toBe('warn');
  });

  it('is neutral (never fabricated) when the value is missing', () => {
    expect(skewTone(null)).toBe('neutral');
  });

  it('respects a custom threshold', () => {
    expect(skewTone(55, 70)).toBe('neutral');
    expect(skewTone(75, 70)).toBe('warn');
  });
});
