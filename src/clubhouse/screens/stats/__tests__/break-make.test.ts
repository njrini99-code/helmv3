import { describe, expect, it } from 'vitest';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { breakMake } from '../break-make';

type Break = GolfStats['puttingByBreak']['straight'];
const band = (b: Partial<Break>): Break =>
  ({ totalPutts: 0, makePct0_3: null, makePct3_5: null, makePct5_10: null, count0_3: 0, count3_5: 0, count5_10: 0, ...b }) as Break;

describe('breakMake', () => {
  it('leaves out tap-ins: 128 straight putts inside 3 ft are no read of a straight putt', () => {
    // Braeden's last 10: every putt tagged "straight" was 3 ft or less (average 1.1 ft), so it drew 100%.
    expect(breakMake(band({ count0_3: 128, makePct0_3: 100 }))).toEqual({ rate: null, putts: 0 });
  });

  it('weights the 3–5 and 5–10 ft bands by their putts', () => {
    const r = breakMake(band({ count0_3: 7, makePct0_3: 100, count3_5: 10, makePct3_5: 60, count5_10: 28, makePct5_10: 39.3 }));
    expect(r.putts).toBe(38);
    expect(r.rate).toBeCloseTo((10 * 60 + 28 * 39.3) / 38, 5);
  });
});
