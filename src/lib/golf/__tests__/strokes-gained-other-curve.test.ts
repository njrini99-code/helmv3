import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/golf/strokes-gained';
import { getBenchmarkData } from '@/lib/golf/sg-benchmarks';
import { getExpectedStrokes as statsExpected } from '@/lib/utils/golf-stats-calculator-shots';

// The 'other' and 'recovery' curves of held 20261023170000 live in three TS
// tables; they must agree with each other (and with sg_expected_strokes()).
describe("'other' and 'recovery' curves stay in lockstep", () => {
  const yards = [20, 35, 50, 60, 75, 90, 100, 130, 150, 200, 260, 320, 400, 540];

  it('strokes-gained.ts matches the Stats engine table', () => {
    for (const lie of ['other', 'recovery'] as const) {
      for (const d of yards) expect(getExpectedStrokes(lie, d)).toBeCloseTo(statsExpected(lie, d), 6);
    }
  });

  it('sg-benchmarks.ts PGA Tour copy matches strokes-gained.ts', () => {
    const tour = getBenchmarkData('pga_tour');
    for (const lie of ['other', 'recovery'] as const) {
      for (const d of yards) expect(getExpectedStrokes(lie, d, false, 'pga_tour')).toBeCloseTo(getExpectedStrokes(lie, d), 6);
      expect(Object.keys(tour[lie]).length).toBeGreaterThan(0);
    }
  });

  it('matches the migration VERIFY anchors and equals rough at 50 yd and in', () => {
    expect(getExpectedStrokes('other', 200)).toBeCloseTo(3.65, 6);
    expect(getExpectedStrokes('recovery', 100)).toBeCloseTo(3.8, 6);
    for (const d of [20, 35, 50]) expect(getExpectedStrokes('other', d)).toBeCloseTo(getExpectedStrokes('rough', d), 2);
  });
});
