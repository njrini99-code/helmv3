import { describe, expect, it } from 'vitest';
import { dateShares, gappedArea, gappedPath, lonePoints, valueRuns, weekShares } from '../chart';

/**
 * The trend lines' path (stats and charts audit 2026-11-15, CH-15): straight segments through the weeks that have a value, broken
 * where a week has none, as the shared line chart draws (`ui/charts/Line` `linePath`). The old path was a monotone curve bridged
 * across empty weeks, which drew values nobody measured.
 */
const x = (i: number) => i * 10;
const y = (v: number) => v;

describe('gappedPath · straight and broken (CH-15)', () => {
  it('[1, null, 3] gives two subpaths and no curves', () => {
    const d = gappedPath([1, null, 3], x, y);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toMatch(/C/);
  });

  it('joins neighbouring weeks with straight segments', () => {
    expect(gappedPath([1, 2, null, 4, 5], x, y)).toBe('M0,1 L10,2 M30,4 L40,5');
  });

  it('draws nothing for fewer than two values', () => {
    expect(gappedPath([null, 3, null], x, y)).toBe('');
    expect(gappedPath([], x, y)).toBe('');
  });

  it('a lone week between gaps is a point to mark, and the runs say where the line breaks', () => {
    expect(valueRuns([1, null, 3, 4, null, 6])).toEqual([[0], [2, 3], [5]]);
    expect(lonePoints([1, null, 3, 4, null, 6])).toEqual([0, 5]);
  });

  it('fills under each run of two or more down to the base, never across a gap', () => {
    const d = gappedArea([1, 2, null, 4, null, 6, 7], x, y, 20);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d).toContain('M0,1 L10,2 L10,20 L0,20 Z');
  });
});

describe('weekShares · weeks by their dates', () => {
  it('puts the 1st, 2nd and 30th of October a month apart, edge to edge', () => {
    const [a, b, c] = weekShares(3, ['2026-10-01', '2026-10-02', '2026-10-30']);
    expect(a).toBe(0);
    expect(c).toBe(1);
    expect(b! - a!).toBeLessThan(0.1 * (c! - b!));
  });

  it('falls back to even spacing when a date is missing', () => {
    expect(weekShares(3, ['2026-10-01', null, '2026-10-30'])).toEqual([0, 0.5, 1]);
  });
});

describe('dateShares · rounds by their dates, never on one spot (CH-11)', () => {
  it('spaces rounds by time, edge to edge', () => {
    const [a, b, c] = dateShares(['2026-10-01', '2026-10-11', '2026-10-31']);
    expect(a).toBe(0);
    expect(c).toBe(1);
    expect(b).toBeCloseTo(1 / 3, 5);
  });

  it('two rounds on one day keep half an even gap between them', () => {
    const s = dateShares(['2026-10-01', '2026-10-01', '2026-10-31']);
    expect(s[1]! - s[0]!).toBeGreaterThan(0.15);
    expect(s[2]).toBe(1);
  });

  it('falls back to even spacing when a date is missing', () => {
    expect(dateShares(['2026-10-01', undefined, '2026-10-31'])).toEqual([0, 0.5, 1]);
  });
});
