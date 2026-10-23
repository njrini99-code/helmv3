import { describe, expect, it } from 'vitest';
import { displayPlaces, placeLabel } from '../rank';

/** B13: one rank rule, on the value as shown. */
describe('displayPlaces', () => {
  it('ties at the shown precision and counts them all for the next place', () => {
    const p = displayPlaces([71.04, 72.26, 72.3, 73.0]);
    expect(p.map((x) => x && placeLabel(x))).toEqual(['1', 'T2', 'T2', '4']);
  });
  it('higher is better when asked, and a missing value has no place', () => {
    expect(displayPlaces([0.4, null, 1.2], 1, true)).toEqual([{ place: 2, tied: false }, null, { place: 1, tied: false }]);
  });
});
