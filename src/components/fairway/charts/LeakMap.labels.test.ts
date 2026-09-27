import { describe, it, expect } from 'vitest';
import { compactBandLabels, thinBandLabels } from './LeakMap';

const PUTT = ['0-3 ft', '3-5 ft', '5-10 ft', '10-15 ft', '15-25 ft', '25+ ft'];

describe('compactBandLabels', () => {
  it('keeps full labels when every one fits its band', () => {
    expect(compactBandLabels(PUTT, 90, 11)).toEqual(PUTT);
  });

  it('drops the repeated unit on a crowded phone axis, keeping it on the last band', () => {
    expect(compactBandLabels(PUTT, 43, 11)).toEqual(['0-3', '3-5', '5-10', '10-15', '15-25', '25+ ft']);
  });

  it('leaves labels without a trailing unit alone', () => {
    expect(compactBandLabels(['Inside 100', 'Long'], 20, 11)).toEqual(['Inside 100', 'Long']);
  });
});

describe('thinBandLabels', () => {
  const compactPutt = ['0-3', '3-5', '5-10', '10-15', '15-25', '25+ ft'];

  it('keeps all six putt labels on a full-width 390px card (~33px bands)', () => {
    expect(thinBandLabels(compactBandLabels(PUTT, 33, 11), 33, 11)).toEqual(compactPutt);
  });

  it('shows every k-th label back from the unit-carrying last band when bands are too narrow (Team Stats baseline)', () => {
    expect(thinBandLabels(compactPutt, 13, 11)).toEqual(['', '', '5-10', '', '', '25+ ft']);
  });

  it('thins the three approach bands instead of running them together', () => {
    expect(thinBandLabels(['50-125', '125-175', '175+ yd'], 24, 11)).toEqual(['50-125', '', '175+ yd']);
  });

  it('falls back to the last label alone when no pair fits', () => {
    expect(thinBandLabels(['0-3', '3-5', '25+ ft'], 5, 11)).toEqual(['', '', '25+ ft']);
  });

  it('never leaves two shown labels overlapping (estimated footprint), across widths', () => {
    const fontSize = 11;
    const w = (t: string) => t.length * fontSize * 0.52;
    for (let step = 4; step <= 60; step += 1) {
      const shown = thinBandLabels(compactPutt, step, fontSize)
        .map((label, i) => ({ label, i }))
        .filter((s) => s.label !== '');
      for (let j = 1; j < shown.length; j++) {
        const a = shown[j - 1];
        const b = shown[j];
        if (!a || !b) throw new Error('unreachable');
        expect((b.i - a.i) * step).toBeGreaterThanOrEqual((w(a.label) + w(b.label)) / 2);
      }
      expect(shown.at(-1)?.label).toBe('25+ ft');
    }
  });

  it('passes empty and single-band inputs through', () => {
    expect(thinBandLabels([], 10, 11)).toEqual([]);
    expect(thinBandLabels(['25+ ft'], 2, 11)).toEqual(['25+ ft']);
  });
});
