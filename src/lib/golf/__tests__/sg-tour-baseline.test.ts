import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SG_TOUR_BASELINE, type SgTourLie } from '@/lib/golf/sg-tour-baseline';
import { getExpectedStrokes } from '@/lib/golf/strokes-gained';
import { getBenchmarkData } from '@/lib/golf/sg-benchmarks';
import { getExpectedStrokes as statsExpected } from '@/lib/utils/golf-stats-calculator-shots';

// SC-03: one Tour curve. The TypeScript table is Broadie's Table B.1
// (Interfaces 42(2), Appendix B) and must equal what public.sg_expected_strokes()
// holds in the schema file (20261115215000), so the Stats pages (TypeScript)
// and the stored strokes gained (SQL) price a shot the same way.

const SCHEMA = readFileSync(path.join(process.cwd(), 'supabase/schemas/functions/public.sql'), 'utf8');

/** The {distance: strokes} rows of each lie branch of one sg_expected_strokes overload. */
function sqlCurves(signature: string): Partial<Record<SgTourLie, Record<number, number>>> {
  const start = SCHEMA.indexOf(signature);
  expect(start, `schema holds ${signature}`).toBeGreaterThan(-1);
  const body = SCHEMA.slice(start, SCHEMA.indexOf('\n$$;', start));
  const curves: Partial<Record<SgTourLie, Record<number, number>>> = {};
  const branch = /(?:IF|ELSIF) p_lie = '(\w+)' THEN[\s\S]*?v_distances := ARRAY\[([^\]]+)\][\s\S]*?v_strokes\s+:= ARRAY\[([^\]]+)\]/g;
  for (const m of body.matchAll(branch)) {
    const ds = m[2]!.split(',').map((x) => Number(x.trim()));
    const ss = m[3]!.split(',').map((x) => Number(x.trim()));
    expect(ds.length, `${m[1]}: as many distances as strokes`).toBe(ss.length);
    curves[m[1] as SgTourLie] = Object.fromEntries(ds.map((d, i) => [d, ss[i]!]));
  }
  return curves;
}

const THREE_ARG = 'CREATE OR REPLACE FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric DEFAULT 1.0)';
const TWO_ARG = 'CREATE OR REPLACE FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) RETURNS';
const LIES: SgTourLie[] = ['tee', 'fairway', 'rough', 'sand', 'other', 'recovery', 'green'];

describe('the Tour curve: one table, the same in TypeScript and SQL', () => {
  for (const [label, signature] of [['scaled', THREE_ARG], ['unscaled', TWO_ARG]] as const) {
    it(`sg_expected_strokes (${label}) holds exactly the TypeScript rows`, () => {
      const sql = sqlCurves(signature);
      for (const lie of LIES) {
        const rows = { ...sql[lie] };
        // The SQL green row ends at 0 ft = 0 strokes (holed); the TS engines add it where they use it.
        if (lie === 'green') delete rows[0];
        expect(rows, lie).toEqual(SG_TOUR_BASELINE[lie]);
      }
    });
  }

  it('the Table B.1 pins (SC-03), within 0.01', () => {
    const pins: [SgTourLie, number, number][] = [
      ['tee', 260, 3.45], ['tee', 280, 3.65], ['tee', 440, 4.08], ['tee', 460, 4.17], ['tee', 500, 4.41],
      ['fairway', 40, 2.6], ['fairway', 60, 2.7], ['fairway', 540, 4.66],
      ['rough', 40, 2.78], ['rough', 60, 2.91], ['rough', 80, 2.96],
      ['sand', 40, 2.82], ['sand', 60, 3.15], ['sand', 80, 3.24], ['sand', 140, 3.22], ['sand', 160, 3.28], ['sand', 540, 5.68],
    ];
    for (const [lie, yards, strokes] of pins) {
      expect(Math.abs(getExpectedStrokes(lie, yards) - strokes), `strokes-gained.ts ${lie} ${yards}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(statsExpected(lie, yards) - strokes), `stats engine ${lie} ${yards}`).toBeLessThanOrEqual(0.01);
    }
    expect(statsExpected('green', 1, 3)).toBeCloseTo(1.04, 6);
    expect(statsExpected('green', 30, 90)).toBeCloseTo(2.4, 6);
    expect(getExpectedStrokes('green', 1)).toBeCloseTo(1.04, 6);
    expect(getExpectedStrokes('green', 30)).toBeCloseTo(2.4, 6);
  });

  it("'other' is the owner's rule on the published rough and recovery rows", () => {
    const { rough, recovery, other } = SG_TOUR_BASELINE;
    expect(Object.keys(other)).toEqual(Object.keys(rough));
    for (const d of Object.keys(other).map(Number)) {
      const w = Math.min(Math.max((0.5 * (d - 50)) / 50, 0), 0.5);
      expect(other[d]!, `${d} yd`).toBeCloseTo(rough[d]! + w * (recovery[d]! - rough[d]!), 3);
    }
  });

  it('every TypeScript engine reads the same curve, between the rows too', () => {
    const tour = getBenchmarkData('pga_tour');
    for (const lie of LIES.filter((l) => l !== 'green')) {
      expect(tour[lie]).toEqual(SG_TOUR_BASELINE[lie]);
      for (const yards of [5, 10, 15, 37, 65, 95, 110, 150, 233, 287, 395, 444, 530, 610]) {
        expect(getExpectedStrokes(lie, yards), `${lie} ${yards}`).toBeCloseTo(statsExpected(lie, yards), 6);
      }
    }
    for (const feet of [1, 2, 3, 4, 7, 12, 25, 45, 75, 90]) {
      // strokes-gained.ts takes the putt in yards and rounds it to whole feet.
      expect(getExpectedStrokes('green', feet / 3), `green ${feet} ft`).toBeCloseTo(statsExpected('green', 0, feet), 6);
    }
  });

  it('below the first row a lie holds it: 10 yd off the ground, 100 yd off the tee (SC-11)', () => {
    expect(statsExpected('fairway', 4)).toBeCloseTo(2.18, 6);
    expect(statsExpected('sand', 6)).toBeCloseTo(2.43, 6);
    expect(statsExpected('tee', 85)).toBeCloseTo(2.92, 6);
  });
});
