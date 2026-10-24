import { describe, expect, it } from 'vitest';
import { tourMark } from '../sg';
import { legStatText } from '../../screens/home/TeamLegs';

/** Row 110 (A8.3): a women's team's Tour averages are the women's Tour's, and every figure set beside one says so. */
describe('tourMark', () => {
  it("names the women's Tour for a women's team, the Tour otherwise", () => {
    expect(tourMark('lpga')).toBe("Women's Tour");
    expect(tourMark('pga')).toBe('Tour');
    expect(tourMark(undefined)).toBe('Tour');
  });
  it("Coach Home's part stat labels its Tour average by the team's tour", () => {
    const stat = { label: 'Greens' as const, value: 61, unit: '%' as const, digits: 0, tour: 66 };
    expect(legStatText(stat, 'lpga')).toBe("Greens 61% · Women's Tour 66%");
    expect(legStatText(stat, 'pga')).toBe('Greens 61% · Tour 66%');
  });
});
