import { describe, expect, it } from 'vitest';
import { parseColor, pressWashColor, PRESS_FALLBACK_INK } from '../press';

// The shared pressed look (dsx-08): a control whose sheet draws no pressed rule still answers the finger. These pin the
// colour it takes on each kind of surface.
const IVORY = 'rgb(250, 247, 239)';
const LINEN = '#ebe4d2';
const INK = 'rgb(26, 32, 28)';

describe('parseColor', () => {
  it('reads the forms getComputedStyle returns', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('rgb(1 2 3 / 0.25)')).toEqual([1, 2, 3, 0.25]);
    expect(parseColor('color(srgb 1 0 0.5)')).toEqual([255, 0, 127.5, 1]);
    expect(parseColor('transparent')).toBeNull();
  });
});

describe('pressWashColor', () => {
  it('washes an ivory surface with the linen wash, as a row takes it', () => {
    expect(pressWashColor(IVORY, 'rgb(235, 228, 210)', INK)).toBe('rgb(235, 228, 210)');
  });

  it('leans a green plate toward its own ink instead of painting linen on it', () => {
    const green = 'rgb(31, 74, 52)';
    const plateInk = 'rgb(244, 240, 228)';
    const out = parseColor(pressWashColor(green, 'rgb(235, 228, 210)', plateInk)!)!;
    expect(out[0]).toBeCloseTo(31 + (244 - 31) * PRESS_FALLBACK_INK, -1);
    expect(out[1]).toBeGreaterThan(74);
  });

  it('still answers on a fill that already is the wash', () => {
    const out = pressWashColor('rgb(235, 228, 210)', 'rgb(235, 228, 210)', INK);
    expect(out).not.toBe('rgb(235, 228, 210)');
    expect(parseColor(out!)![0]).toBeLessThan(235);
  });

  it('gives nothing when the surface cannot be read', () => {
    expect(pressWashColor('', LINEN, INK)).toBeNull();
  });
});
