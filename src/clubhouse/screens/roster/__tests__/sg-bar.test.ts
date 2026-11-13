import { describe, expect, it } from 'vitest';
import { sgBarScale, sgBarWidth } from '../format';

/**
 * Coach audit 13 Nov 2026 (§8 #2): the strokes-gained bar was capped at ±3, and every Guilford player is past −3, so every
 * bar was full and the bars showed no difference. The bar's half-width (0 to 50%) is now measured against the team's
 * largest strokes gained, never less than 3.
 */
describe('sgBarWidth', () => {
  it('measures against the scale: −3.3 of 7.5 is 22%, −7.5 is the full half', () => {
    expect(sgBarWidth(-3.3, 7.5)).toBe(22);
    expect(sgBarWidth(-7.5, 7.5)).toBe(50);
    expect(sgBarWidth(1.5, 7.5)).toBe(10);
  });

  it('no strokes gained draws no bar', () => {
    expect(sgBarWidth(null, 7.5)).toBe(0);
  });

  it('never past the half', () => {
    expect(sgBarWidth(-9, 7.5)).toBe(50);
  });
});

describe('sgBarScale', () => {
  it('is the largest strokes gained on the list, either sign', () => {
    expect(sgBarScale([-3.3, -7.5, 1.2, null])).toBe(7.5);
  });

  it('is never under 3, so a close team still reads close', () => {
    expect(sgBarScale([0.4, -1.1])).toBe(3);
    expect(sgBarScale([])).toBe(3);
  });
});
