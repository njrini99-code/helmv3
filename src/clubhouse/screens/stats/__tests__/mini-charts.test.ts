import { describe, expect, it } from 'vitest';
import { TICKER_MIN_SPAN, tickerBars } from '../MiniCharts';

/**
 * My stats round ticker (stats and charts audit 2026-11-15, CH-09): a round is a mark at its score's height, all marks one size, on a
 * range at least a few strokes wide, so 72 against 73 is a small step and not a bar three times the other. The old bars ran from three
 * strokes under the best round, and every round of a flat run was marked best and painted green.
 */
describe('tickerBars · positions, not lengths (CH-09)', () => {
  it('three rounds of 72 have no best', () => {
    expect(tickerBars([{ id: 'a', score: 72 }, { id: 'b', score: 72 }, { id: 'c', score: 72 }]).map((b) => b.best)).toEqual([false, false, false]);
  });

  it('72 and 73 draw marks of one size (ratio within 15% of 1), one stroke apart on a range of at least the minimum span', () => {
    const H = 64;
    const [a, b] = tickerBars([{ id: 'a', score: 72 }, { id: 'b', score: 73 }], 300, H);
    expect(a!.h / b!.h).toBeGreaterThan(0.85);
    expect(a!.h / b!.h).toBeLessThan(1.15);
    // The lower score sits higher, by one stroke of a range no narrower than the minimum span.
    expect(a!.y).toBeLessThan(b!.y);
    expect(b!.y - a!.y).toBeLessThanOrEqual((H - a!.h) / TICKER_MIN_SPAN + 1e-9);
  });

  it('a unique best is still marked', () => {
    const bars = tickerBars([{ id: 'a', score: 74 }, { id: 'b', score: 71 }, { id: 'c', score: 76 }]);
    expect(bars.map((b) => b.best)).toEqual([false, true, false]);
  });

  it('a wide spread uses the whole height', () => {
    const H = 64;
    const bars = tickerBars([{ id: 'a', score: 68 }, { id: 'b', score: 84 }], 300, H);
    expect(bars[0]!.y).toBeCloseTo(0, 5);
    expect(bars[1]!.y + bars[1]!.h).toBeCloseTo(H, 5);
  });
});
