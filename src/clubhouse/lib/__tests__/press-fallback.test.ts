import { describe, expect, it } from 'vitest';
import { parseColor, pressWashColor, PRESS_FALLBACK_INK } from '../press';

// The shared pressed look (dsx-08): a control whose sheet draws no pressed rule still answers the finger. These pin the
// colour it takes on each kind of surface.
const IVORY = 'rgb(250, 247, 239)';
const LINEN = '#ebe4d2';
const INK = 'rgb(26, 32, 28)';

const near = (got: ReturnType<typeof parseColor>, want: number[]) => {
  expect(got).not.toBeNull();
  got!.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, 0));
};

describe('parseColor', () => {
  it('reads the forms getComputedStyle returns', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('rgb(1 2 3 / 0.25)')).toEqual([1, 2, 3, 0.25]);
    expect(parseColor('rgb(100% 0% 50% / 50%)')).toEqual([255, 0, 127.5, 0.5]);
    expect(parseColor('color(srgb 1 0 0.5)')).toEqual([255, 0, 127.5, 1]);
    expect(parseColor('color(srgb 1 0 0.5 / 0.4)')).toEqual([255, 0, 127.5, 0.4]);
    // getComputedStyle's own clear, and the keyword a custom property keeps, read alike.
    expect(parseColor('transparent')).toEqual(parseColor('rgba(0, 0, 0, 0)'));
  });

  // A custom property (`--ch-sel: var(--ch-bg-selected)`) comes back as its token was written: a hex. Before dsx-08's fix
  // none of these read, so the linen wash never showed on a press.
  it('reads every hex form', () => {
    expect(parseColor(LINEN)).toEqual([235, 228, 210, 1]);
    expect(parseColor(' #EBE4D2 ')).toEqual([235, 228, 210, 1]);
    expect(parseColor('#ebe4d280')).toEqual([235, 228, 210, 128 / 255]);
    expect(parseColor('#fa0')).toEqual([255, 170, 0, 1]);
    expect(parseColor('#fa08')).toEqual([255, 170, 0, 136 / 255]);
  });

  it('reads the oklab a color-mix(in oklab …) computes to, and oklch', () => {
    near(parseColor('oklab(1 0 0)'), [255, 255, 255, 1]);
    near(parseColor('oklab(0 0 0 / 0.5)'), [0, 0, 0, 0.5]);
    // The sRGB primaries, as OKLab and OKLCh give them.
    near(parseColor('oklab(0.62796 0.22486 0.12585)'), [255, 0, 0, 1]);
    near(parseColor('oklch(0.86644 0.29483 142.4953)'), [0, 255, 0, 1]);
    near(parseColor('oklch(45.2% 0.3132 264.05deg / 25%)'), [0, 0, 255, 0.25]);
  });

  it('gives nothing for what is not a colour it can read', () => {
    for (const c of ['', 'currentcolor', 'none', 'var(--ch-sel)', '#ebe4d', '#ggg', 'rgb(1, 2)', 'color(display-p3 1 0 0)', 'color-mix(in oklab, #000 50%, #fff)', 'linear-gradient(red, blue)'])
      expect(parseColor(c)).toBeNull();
  });
});

describe('pressWashColor', () => {
  it('washes an ivory surface with the linen wash, as a row takes it', () => {
    expect(pressWashColor(IVORY, 'rgb(235, 228, 210)', INK)).toBe('rgb(235, 228, 210)');
  });

  it('takes the wash as the token holds it, a hex', () => {
    expect(pressWashColor(IVORY, LINEN, INK)).toBe('rgb(235, 228, 210)');
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
