import { describe, it, expect } from 'vitest';
import { EM_DASH, displayValue, durationBarPercent, deriveTraceTotalMs } from '../trace-view-helpers';

describe('displayValue', () => {
  it('renders the em dash for null, undefined, and empty string', () => {
    expect(displayValue(null)).toBe(EM_DASH);
    expect(displayValue(undefined)).toBe(EM_DASH);
    expect(displayValue('')).toBe(EM_DASH);
  });

  it('passes through a real value unchanged, including a legitimate 0', () => {
    expect(displayValue('golf_shots')).toBe('golf_shots');
    expect(displayValue(0)).toBe(0);
  });
});

describe('durationBarPercent', () => {
  it('computes a proportional share of the trace total, rounded to one decimal', () => {
    expect(durationBarPercent(297, 1000)).toBe(29.7);
    expect(durationBarPercent(250, 1000)).toBe(25);
  });

  it('never exceeds 100, even when a step somehow outlasts the reference total', () => {
    // Can happen honestly: the reference is a sum-of-roots fallback, and one
    // root's own recorded duration can exceed that fallback due to rounding.
    expect(durationBarPercent(1500, 1000)).toBe(100);
  });

  it('is zero for a step with no recorded duration — never a fabricated sliver', () => {
    expect(durationBarPercent(null, 1000)).toBe(0);
  });

  it('is zero when there is no positive total to measure against', () => {
    expect(durationBarPercent(297, 0)).toBe(0);
    expect(durationBarPercent(297, -10)).toBe(0);
  });

  it('treats a negative or non-finite duration as unusable rather than inverting the bar', () => {
    expect(durationBarPercent(-5, 1000)).toBe(0);
    expect(durationBarPercent(Number.NaN, 1000)).toBe(0);
    expect(durationBarPercent(297, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('handles a genuine zero-duration step as an empty (not full) bar', () => {
    expect(durationBarPercent(0, 1000)).toBe(0);
  });
});

describe('deriveTraceTotalMs', () => {
  it('prefers the authoritative run duration when it is known', () => {
    expect(deriveTraceTotalMs(439, [2, 17, 8, 412])).toBe(439);
  });

  it('falls back to the sum of root-level durations when the run duration is unknown', () => {
    expect(deriveTraceTotalMs(null, [2, 17, 8, 412])).toBe(439);
  });

  it('treats a missing root duration as 0 rather than throwing off the sum', () => {
    expect(deriveTraceTotalMs(null, [2, null, 8, 412])).toBe(422);
  });

  it('is 0, not NaN or a crash, when nothing is known at all', () => {
    expect(deriveTraceTotalMs(null, [])).toBe(0);
    expect(deriveTraceTotalMs(null, [null, null])).toBe(0);
  });

  it('ignores a non-finite run duration rather than propagating it', () => {
    expect(deriveTraceTotalMs(Number.NaN, [2, 17])).toBe(19);
  });
});
