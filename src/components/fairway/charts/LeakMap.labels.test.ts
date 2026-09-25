import { describe, it, expect } from 'vitest';
import { compactBandLabels } from './LeakMap';

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
