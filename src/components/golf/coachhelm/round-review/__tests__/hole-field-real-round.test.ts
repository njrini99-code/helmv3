/**
 * ============================================================================
 * The full path, against a real round's real rows.
 * ----------------------------------------------------------------------------
 * Round 2f343331-b1e6-49c6-9dc0-553166a90213: 18 `golf_holes` rows, 95 shots,
 * 95 strokes at Great Dunes Course on 2026-03-20. The rows below are copied
 * verbatim out of the database (par, score, putts, fairway_hit, gir), so this
 * file is the hole-by-hole path proved against production data rather than
 * against numbers chosen to make the assertions convenient.
 *
 * It cannot be proved in a browser with the credentials this repo has: that
 * round belongs to a player on Lynchburg Women's Golf (organization
 * 119634a3-b6db-4241-9e8a-d95b0447c4ac) and the coach persona staffs only
 * Demo University Golf (f97a9346-52ef-4f27-9ee7-4cf1e20fc79a), so the page's
 * team-membership check correctly refuses it. This is the honest substitute:
 * the same helpers, the same data, asserted rather than screenshotted.
 *
 * The round is also a genuine tie-break fixture. Three 3-hole windows tie at
 * 6 dropped shots (3-5, 4-6, 5-7), so it pins which one the verdict names,
 * and its only run without a dropped shot is level rather than under par, so
 * it exercises the wording that cannot say "0 under".
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import type { HoleBreakdown, RoundReviewContent } from '@/app/golf/actions/round-review-system';
import {
  bestStretch,
  buildVerdict,
  cumulativeLine,
  holeColumns,
  holeDeltasFromMomentum,
  nineDivider,
  worstWindow,
} from '../round-shape';
import { holeFieldCap } from '../HoleField';

/** [hole, par, score, putts, fairwayHit, gir] straight from `golf_holes`. */
const ROWS: Array<[number, number, number, number, boolean | null, boolean]> = [
  [1, 4, 5, 1, false, false],
  [2, 4, 5, 2, false, false],
  [3, 3, 5, 2, null, false],
  [4, 5, 6, 2, false, false],
  [5, 3, 6, 3, null, false],
  [6, 4, 6, 3, true, false],
  [7, 3, 4, 3, null, true],
  [8, 5, 6, 3, false, true],
  [9, 4, 6, 2, false, false],
  [10, 4, 5, 2, false, false],
  [11, 4, 6, 3, true, false],
  [12, 4, 6, 2, false, false],
  [13, 5, 6, 2, true, false],
  [14, 4, 6, 3, false, false],
  [15, 5, 5, 2, true, true],
  [16, 4, 4, 2, true, true],
  [17, 3, 4, 2, null, false],
  [18, 4, 4, 1, true, false],
];

const HOLES: HoleBreakdown[] = ROWS.map(([hole, par, score, putts, fairwayHit, gir]) => ({
  hole,
  par,
  score,
  scoreToPar: score - par,
  putts,
  fairwayHit,
  gir,
  threePutt: putts >= 3,
  onePutt: putts === 1,
  penalties: 0,
  scrambleAttempt: false,
  scrambleSuccess: false,
  sandSaveAttempt: false,
  sandSaveSuccess: false,
  driveClub: null,
  driveDist: null,
  driveMiss: null,
  firstPuttFeet: null,
  approachClub: null,
  approachDist: null,
  approachMiss: null,
}));

/** The rolling total the server stores, rebuilt from the same rows. */
const MOMENTUM: RoundReviewContent['momentumData'] = (() => {
  let cumulative = 0;
  return HOLES.map((h) => {
    cumulative += h.scoreToPar;
    return { hole: h.hole, rollingScoreToPar: cumulative };
  });
})();

describe('round 2f343331 — the real 18-hole path', () => {
  it('is the round the database says it is', () => {
    expect(HOLES).toHaveLength(18);
    expect(HOLES.reduce((n, h) => n + h.score, 0)).toBe(95);
    expect(HOLES.reduce((n, h) => n + h.par, 0)).toBe(72);
    expect(MOMENTUM[MOMENTUM.length - 1]!.rollingScoreToPar).toBe(23);
  });

  it('draws one column per hole, with the par row labelled once', () => {
    const columns = holeColumns(HOLES);
    expect(columns).toHaveLength(18);
    expect(columns[0]!.overline).toBe('Par 4');
    expect(columns[1]!.overline).toBe('4');
    expect(columns.map((c) => c.label)).toEqual(HOLES.map((h) => String(h.hole)));
    // Every bar is over par or level. Nothing on this card went under.
    expect(columns.every((c) => (c.value ?? 0) >= 0)).toBe(true);
    expect(columns.some((c) => c.value === 0)).toBe(true);
  });

  it('caps the bars on the round’s own worst hole, so nothing is clipped', () => {
    // The worst single hole is +3 (hole 5, a 6 on a par 3), which is also the
    // floor the cap never drops below.
    expect(holeFieldCap(holeColumns(HOLES))).toBe(3);
  });

  it('recovers each hole’s score to par from the stored rolling total', () => {
    const deltas = holeDeltasFromMomentum(MOMENTUM);
    expect(deltas.map((d) => d.delta)).toEqual(HOLES.map((h) => h.scoreToPar));
  });

  it('names the only run that held, and says so without claiming it went under', () => {
    const deltas = holeDeltasFromMomentum(MOMENTUM);
    // Holes 15 and 16 are the round's only back-to-back holes without a
    // dropped shot. Hole 18 is level too, but one hole is not a stretch.
    expect(bestStretch(deltas)).toEqual({ from: 15, to: 16, strokes: 0, holes: 2 });
  });

  it('breaks the three-way tie for the worst window on the earliest start', () => {
    const deltas = holeDeltasFromMomentum(MOMENTUM);
    // Holes 3-5, 4-6 and 5-7 all cost 6. The verdict names the first.
    expect(worstWindow(deltas)).toEqual({ from: 3, to: 5, strokes: 6, holes: 3 });
  });

  it('plots the cumulative line across all 18 columns, finishing at +23', () => {
    const line = cumulativeLine(MOMENTUM, HOLES.map((h) => h.hole));
    expect(line).not.toBeNull();
    expect(line!.points).toHaveLength(18);
    expect(line!.last).toBe(23);
    expect(line!.min).toBe(1);
    expect(line!.max).toBe(23);
    // The worst point of the round sits at the bottom of the box, the best at
    // the top, and every x stays inside the instrument.
    expect(line!.points[0]!.y).toBe(100);
    expect(line!.points[17]!.y).toBe(0);
    for (const point of line!.points) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(100);
    }
  });

  it('splits the nines on the real front and back totals', () => {
    const front = HOLES.slice(0, 9);
    const back = HOLES.slice(9);
    const half = (rows: HoleBreakdown[]) => ({
      score: rows.reduce((n, h) => n + h.score, 0),
      putts: rows.reduce((n, h) => n + h.putts, 0),
      gir: rows.filter((h) => h.gir).length,
      girTotal: rows.length,
      fairways: rows.filter((h) => h.fairwayHit === true).length,
      fairwayTotal: rows.filter((h) => h.fairwayHit !== null).length,
    });
    const split: RoundReviewContent['frontBackSplit'] = { front: half(front), back: half(back) };
    expect(split.front.score).toBe(49);
    expect(split.back.score).toBe(46);
    expect(nineDivider(HOLES, split)).toEqual({
      afterIndex: 8,
      frontLabel: 'OUT 49',
      backLabel: 'IN 46',
    });
  });

  it('reads the round back as one sentence a coach could say out loud', () => {
    const text = buildVerdict({
      totalScore: 95,
      scoreToPar: 23,
      courseName: 'Great Dunes Course',
      deltas: holeDeltasFromMomentum(MOMENTUM),
      strokesToGain: [],
    })
      .map((part) => part.text)
      .join('');
    expect(text).toBe(
      '95 (+23) at Great Dunes Course. The round held through holes 15 to 16, ' +
        '2 holes without a dropped shot. Holes 3 to 5 cost 6 shots.',
    );
  });
});
