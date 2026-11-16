import { describe, expect, it } from 'vitest';
import { barAxis, barLength, type TrendPoint } from '../history-model';

/**
 * The phone History bars (stats and charts audit 2026-11-15, CH-02): a figure against the rating or the field can be either side
 * of zero, so each bar runs from a zero rule, better to one side and worse to the other, every bar on one shared scale. The old
 * bars ran from 14% to 100% of the track across the min-max range, so +5.0 against +5.4 drew as 1 against 7.
 */
const pt = (value: number | null): TrendPoint => ({ value, scorecardsOnly: false, rounds: 3, players: 5, event: { id: String(value) } as TrendPoint['event'] });

describe('barLength · bars from zero on one scale (CH-02)', () => {
  it('+5.0 and +5.4 draw lengths in the ratio of the figures, within 10%', () => {
    const [a, b] = barLength([pt(5.0), pt(5.4)]);
    expect(a!.side).toBe('worse');
    expect(b!.side).toBe('worse');
    expect(a!.len / b!.len).toBeCloseTo(5.0 / 5.4, 5);
    expect(Math.abs(a!.len - b!.len)).toBeLessThan(0.1);
  });

  it('a figure better than the mark and one worse sit on opposite sides of the rule', () => {
    const [a, b] = barLength([pt(-0.3), pt(0.2)]);
    expect(a!.side).toBe('better');
    expect(b!.side).toBe('worse');
    expect(a!.len).toBe(1);
    expect(b!.len).toBeCloseTo(0.2 / 0.3, 5);
  });

  it('no floor: a figure of zero draws no bar, and a missing figure has none', () => {
    const [zero, , none] = barLength([pt(0), pt(2), pt(null)]);
    expect(zero).toEqual({ len: 0, side: 'even' });
    expect(none).toBeNull();
  });
});

describe('barAxis · the track holds the figures’ range with zero in it (CH-02)', () => {
  it('a season all over the mark gives the worse side the whole track', () => {
    expect(barAxis([pt(5.0), pt(5.4)])).toEqual({ zero: 1, unit: 1 });
  });

  it('a mixed season splits the track in proportion, and the longest bar fills its side', () => {
    const { zero, unit } = barAxis([pt(-1), pt(3)]);
    expect(zero).toBeCloseTo(0.75, 5);
    expect(unit).toBeCloseTo(0.75, 5);
  });
});
