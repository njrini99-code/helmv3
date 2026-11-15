import { describe, expect, it } from 'vitest';
import { filterFor } from '../../../data/stats-filter';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import { changeBars, COMPARE_SPAN } from '../shs-figures';

/**
 * My stats phone, What changed (stats and charts audit 2026-11-15, CH-04): a rate's bar is its length from zero, the rate itself, and
 * a score is never a length (74 strokes from zero would draw two near-equal bars); it is a dot on a short fixed scale. The old bars
 * took a 30% floor plus 70% of a range that started six strokes under the lower value.
 */
const withRows = (rows: Array<{ label: string; last: number; previous: number; se: number; lowerIsBetter: boolean; unit: '' | '%' }>) =>
  ({
    ...PREVIEW_PLAYER,
    filter: filterFor('last10'),
    extra: { ...PREVIEW_PLAYER.extra, compare: { lastRounds: 5, previousRounds: 5, rows: rows.map((r) => ({ ...r, digits: 1 })) } },
  }) as unknown as typeof PREVIEW_PLAYER;

describe('changeBars · lengths from zero, positions for scores (CH-04)', () => {
  it('a rate draws its own value as the width: greens 40% and 20% are 40 and 20', () => {
    const bars = changeBars(withRows([{ label: 'Greens in regulation', last: 40, previous: 20, se: 4, lowerIsBetter: false, unit: '%' }]), 'Greens in regulation');
    expect(bars.map((b) => b.width)).toEqual([40, 20]);
    expect(bars.every((b) => b.at == null)).toBe(true);
  });

  it('a rate of zero draws no bar', () => {
    const bars = changeBars(withRows([{ label: 'Fairways hit', last: 0, previous: 25, se: 6, lowerIsBetter: false, unit: '%' }]), 'Fairways hit');
    expect(bars[0]!.width).toBe(0);
  });

  it('a scoring average has no length: two dots on the measure’s fixed span, 0.8 of a stroke apart', () => {
    const bars = changeBars(withRows([{ label: 'Scoring avg', last: 74.2, previous: 75.0, se: 1.2, lowerIsBetter: true, unit: '' }]));
    expect(bars.map((b) => b.width)).toEqual([null, null]);
    const [now, was] = bars.map((b) => b.at!);
    // Better is right: the lower score sits to the right of the higher one.
    expect(now).toBeGreaterThan(was!);
    expect(now! - was!).toBeCloseTo((0.8 / COMPARE_SPAN['Scoring avg']!) * 100, 5);
  });

  it('the two dots sit either side of the middle, so a small change reads small at any level', () => {
    const at = (last: number, previous: number) => changeBars(withRows([{ label: 'Scoring avg', last, previous, se: 1.2, lowerIsBetter: true, unit: '' }])).map((b) => b.at!);
    expect(at(74.2, 75)).toEqual(at(84.2, 85));
    const [now, was] = at(74.2, 75);
    expect((now! + was!) / 2).toBeCloseTo(50, 5);
  });
});
