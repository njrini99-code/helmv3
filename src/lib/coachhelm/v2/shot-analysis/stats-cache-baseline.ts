/**
 * An `SGBaseline` built from the expected-strokes table behind the stats cache
 * (`@/lib/golf/strokes-gained`, kept in lockstep with the DB function
 * `public.sg_expected_strokes()`), so a shot-level instrument such as the
 * approach ladder uses the same yardstick as the strokes-gained waterfall
 * next to it (owner decision OD-12, 2026-09-24).
 *
 * `SGBaseline` is bucketed, so each bucket takes the table's value at the
 * bucket's midpoint. `recovery` has no row in that table and keeps the
 * shot-level default.
 */
import { getExpectedStrokes, type LieType } from '@/lib/golf/strokes-gained';
import { buildDefaultBaseline, type SGBaseline } from './shot-level-sg';

const TABLE_LIES: ReadonlySet<string> = new Set<LieType>(['tee', 'fairway', 'rough', 'sand']);

/** Representative distance for a bucket label: yards off the green, feet on it. */
function bucketMidpoint(label: string): number | null {
  if (label.endsWith('+')) {
    const min = Number(label.slice(0, -1));
    return Number.isFinite(min) ? min * 1.1 : null;
  }
  const [lo, hi] = label.split('-').map(Number);
  if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return (lo + hi) / 2;
}

export function buildStatsCacheSgBaseline(): SGBaseline {
  const strokesToHole = { ...buildDefaultBaseline().strokesToHole };
  for (const key of Object.keys(strokesToHole)) {
    const sep = key.indexOf('_');
    const lie = key.slice(0, sep);
    const mid = bucketMidpoint(key.slice(sep + 1));
    if (mid == null) continue;
    if (lie === 'green') {
      // Green buckets are in feet; getExpectedStrokes takes yards.
      strokesToHole[key] = getExpectedStrokes('green', mid / 3, true);
    } else if (TABLE_LIES.has(lie)) {
      strokesToHole[key] = getExpectedStrokes(lie as LieType, mid);
    }
  }
  return { strokesToHole };
}
