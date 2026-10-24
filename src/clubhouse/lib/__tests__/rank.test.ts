import { describe, expect, it } from 'vitest';
import { displayPlaces, placeLabel } from '../rank';

/** B13: one rank rule, on the value as shown. */
describe('displayPlaces', () => {
  it('ties at the shown precision and counts them all for the next place', () => {
    const p = displayPlaces([71.04, 72.26, 72.3, 73.0]);
    expect(p.map((x) => x && placeLabel(x))).toEqual(['1', 'T2', 'T2', '4']);
  });
  it('keys on the printed figure, so an x.x5 value that prints "72.3" ties with 72.3', () => {
    // 72.35 prints "72.3" (toFixed) but Math.round(723.5) is 724: a rounded key would put it behind the other 72.3.
    expect((72.35).toFixed(1)).toBe('72.3');
    const p = displayPlaces([72.35, 72.3, 72.4]);
    expect(p.map((x) => x && placeLabel(x))).toEqual(['T1', 'T1', '3']);
  });
  it('higher is better when asked, and a missing value has no place', () => {
    expect(displayPlaces([0.4, null, 1.2], 1, true)).toEqual([{ place: 2, tied: false }, null, { place: 1, tied: false }]);
  });
});
