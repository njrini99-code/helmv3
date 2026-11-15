import { describe, expect, it } from 'vitest';
import { filterFor } from '../../../data/stats-filter';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import { changeBars } from '../shs-figures';

const withCompare = {
  ...PREVIEW_PLAYER,
  filter: filterFor('last10'),
  extra: {
    ...PREVIEW_PLAYER.extra,
    compare: {
      lastRounds: 10,
      previousRounds: 10,
      rows: [
        { label: 'Scoring avg', last: 76.3, previous: 78.2, se: 1.5, lowerIsBetter: true, digits: 1, unit: '' as const },
        { label: 'Fairways hit', last: 42.9, previous: 56.1, se: 4, lowerIsBetter: false, digits: 1, unit: '%' as const },
      ],
    },
  },
} as unknown as typeof PREVIEW_PLAYER;

describe('What changed bars', () => {
  it('compare what the sentence names, with its unit and its own direction', () => {
    const bars = changeBars(withCompare, 'Fairways hit');
    expect(bars.map((b) => [b.value, b.unit])).toEqual([[42.9, '%'], [56.1, '%']]);
    expect(bars[0]!.tone).toBe('loss');
  });
  it('fall back to scoring when the sentence names nothing', () => {
    expect(changeBars(withCompare).map((b) => b.value)).toEqual([76.3, 78.2]);
  });
});
