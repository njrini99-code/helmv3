import { describe, expect, it } from 'vitest';
import { HOLE_BAR_CAP, holeBars } from '../RoundsShowcase';

/**
 * The qualifier round's shape (stats and charts audit 2026-11-15, CH-17): bars run a unit a stroke from par up to a cap, and a hole
 * past the cap is marked as cut, never drawn as the same hole as one at the cap with nothing to say so.
 */
describe('holeBars · a clamp is marked (CH-17)', () => {
  it('+3 and +4 draw at the cap, both marked clipped; +2 is not', () => {
    const [two, three, four] = holeBars([2, 3, 4], 11);
    expect(two).toEqual({ even: false, under: false, h: 22, clipped: false });
    expect(three).toEqual({ even: false, under: false, h: HOLE_BAR_CAP * 11, clipped: true });
    expect(four).toEqual({ even: false, under: false, h: HOLE_BAR_CAP * 11, clipped: true });
  });

  it('under par runs the other way, par is a dot, and a hole with no score draws nothing', () => {
    const [eagle, par, none] = holeBars([-2, 0, null], 11);
    expect(eagle).toEqual({ even: false, under: true, h: 22, clipped: false });
    expect(par).toEqual({ even: true });
    expect(none).toBeNull();
  });
});
