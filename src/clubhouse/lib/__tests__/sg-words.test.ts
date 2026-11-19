import { describe, expect, it } from 'vitest';
import { sgExtremeWords, sgPartsRoundOff, sgScale, sgShare, SG_LEG_LABEL } from '../sg';

describe('strokes gained wording that cannot contradict its figure (L-013)', () => {
  it('the best player above zero gains most; below zero is least behind; zero breaks even with no figure', () => {
    expect(sgExtremeWords('gains', 0.9, false)).toEqual({ words: 'gains most', figure: true });
    expect(sgExtremeWords('gains', 0.9, true)).toEqual({ words: 'gain most', figure: true });
    expect(sgExtremeWords('gains', -0.8, false)).toEqual({ words: 'is least behind', figure: true });
    expect(sgExtremeWords('gains', -0.8, true)).toEqual({ words: 'are least behind', figure: true });
    expect(sgExtremeWords('gains', 0.02, false)).toEqual({ words: 'breaks even', figure: false });
    expect(sgExtremeWords('gains', -0.04, true)).toEqual({ words: 'break even', figure: false });
  });

  it('the worst player below zero loses most; above zero gains least', () => {
    expect(sgExtremeWords('loses', -2.1, false)).toEqual({ words: 'loses most', figure: true });
    expect(sgExtremeWords('loses', -2.1, true)).toEqual({ words: 'lose most', figure: true });
    expect(sgExtremeWords('loses', 0.4, false)).toEqual({ words: 'gains least', figure: true });
    expect(sgExtremeWords('loses', 0, false)).toEqual({ words: 'breaks even', figure: false });
  });
});

describe('strokes gained parts and totals (L-060)', () => {
  it('says so when the printed parts do not add to the printed total', () => {
    expect(sgPartsRoundOff([-0.3, -1.7, -0.7, -3.0], -5.8)).toBe(true);
    expect(sgPartsRoundOff([-0.3, -1.7, -0.7, -3.1], -5.8)).toBe(false);
    expect(sgPartsRoundOff([null, null], -5.8)).toBe(false);
    expect(sgPartsRoundOff([-1, -1], null)).toBe(false);
  });

  it('one name for each part', () => {
    expect(Object.values(SG_LEG_LABEL)).toEqual(['Off the tee', 'Approach', 'Around the green', 'Putting']);
  });
});

describe('the bars scale to the largest figure, not to 1.0 (L-014)', () => {
  it('a bar of −3.1 is longer than one of −1.7', () => {
    const scale = sgScale([-1.7, -2.7, 0, -3.1]);
    expect(scale).toBe(4);
    expect(sgShare(-3.1, scale)).toBeGreaterThan(sgShare(-1.7, scale));
    expect(sgShare(-3.1, scale)).toBeLessThan(1);
  });
});
