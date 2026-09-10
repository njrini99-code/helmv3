/**
 * round-shape — pure-function tests (round-review.v3.md).
 *
 * The stage instrument, the masthead verdict and the readouts all read from
 * this module, so every honesty rule the spec sets is asserted here: a
 * scorecard-only round produces no series and no invented sentence, a
 * readout with no comparison average produces no delta, and the stretch
 * detection is deterministic on ties.
 */

import { describe, it, expect } from 'vitest';
import type { HoleBreakdown, RoundReviewContent } from '@/app/golf/actions/round-review-system';
import {
  bestStretch,
  buildFacts,
  buildLeakRows,
  buildReadouts,
  buildVerdict,
  compareToAverage,
  cumulativeLine,
  hasFairwayRow,
  holeColumns,
  humanizeClub,
  holeDeltasFromMomentum,
  nineDivider,
  polylinePoints,
  roundShapeCap,
  seasonColumns,
  topLeak,
  worstWindow,
} from '../round-shape';

/** `momentumData` from a list of per-hole deltas, the way the server builds it. */
function momentumFrom(deltas: number[]): RoundReviewContent['momentumData'] {
  let cumulative = 0;
  return deltas.map((delta, i) => {
    cumulative += delta;
    return { hole: i + 1, rollingScoreToPar: cumulative };
  });
}

function hole(overrides: Partial<HoleBreakdown> & { hole: number }): HoleBreakdown {
  return {
    par: 4,
    score: 4,
    scoreToPar: 0,
    putts: 2,
    fairwayHit: null,
    gir: false,
    threePutt: false,
    onePutt: false,
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
    ...overrides,
  };
}

describe('holeDeltasFromMomentum', () => {
  it('recovers each hole’s own score to par from the running cumulative', () => {
    const deltas = holeDeltasFromMomentum(momentumFrom([1, 0, -1, 2]));
    expect(deltas).toEqual([
      { hole: 1, delta: 1 },
      { hole: 2, delta: 0 },
      { hole: 3, delta: -1 },
      { hole: 4, delta: 2 },
    ]);
  });

  it('is empty for a scorecard-only round, which has no momentum at all', () => {
    expect(holeDeltasFromMomentum([])).toEqual([]);
  });
});

describe('bestStretch', () => {
  it('finds the longest run of holes that did not drop a shot', () => {
    // holes 3-6 are the only run of four non-positive holes.
    const deltas = holeDeltasFromMomentum(momentumFrom([1, 2, 0, -1, 0, -1, 3, 0, -1]));
    expect(bestStretch(deltas)).toEqual({ from: 3, to: 6, strokes: -2, holes: 4 });
  });

  it('breaks a tie on length by the run that went further under par', () => {
    // Two runs of three: holes 1-3 at level, holes 5-7 at two under.
    const deltas = holeDeltasFromMomentum(momentumFrom([0, 0, 0, 2, -1, 0, -1, 1]));
    expect(bestStretch(deltas)).toEqual({ from: 5, to: 7, strokes: -2, holes: 3 });
  });

  it('refuses to call a single hole a stretch', () => {
    const deltas = holeDeltasFromMomentum(momentumFrom([1, -1, 1, -1, 1]));
    expect(bestStretch(deltas)).toBeNull();
  });

  it('is null when every hole dropped a shot', () => {
    expect(bestStretch(holeDeltasFromMomentum(momentumFrom([1, 2, 1])))).toBeNull();
  });
});

describe('worstWindow', () => {
  it('finds the single worst three consecutive holes', () => {
    const deltas = holeDeltasFromMomentum(momentumFrom([0, 1, 0, 2, 3, 1, 0]));
    expect(worstWindow(deltas)).toEqual({ from: 4, to: 6, strokes: 6, holes: 3 });
  });

  it('is null when the round is shorter than the window', () => {
    expect(worstWindow(holeDeltasFromMomentum(momentumFrom([1, 2])))).toBeNull();
  });
});

describe('cumulativeLine', () => {
  it('plots each point on its own column centre, with over par higher up', () => {
    const line = cumulativeLine(momentumFrom([1, 1, -1]));
    expect(line).not.toBeNull();
    expect(line!.points.map((p) => p.value)).toEqual([1, 2, 1]);
    expect(line!.last).toBe(1);
    // Three columns: centres at 1/6, 3/6, 5/6 of the width.
    expect(line!.points.map((p) => Math.round(p.x))).toEqual([17, 50, 83]);
    // The worst reading (2 over) sits at the top of the box.
    expect(line!.points[1]!.y).toBe(0);
  });

  it('draws a flat round down the middle instead of dividing by zero', () => {
    const line = cumulativeLine(momentumFrom([0, 0, 0]));
    expect(line!.points.every((p) => p.y === 50)).toBe(true);
  });

  it('is null for a scorecard-only round', () => {
    expect(cumulativeLine([])).toBeNull();
  });
});

describe('polylinePoints', () => {
  it('serializes the points for the SVG attribute', () => {
    const line = cumulativeLine(momentumFrom([1, -1]))!;
    expect(polylinePoints(line.points)).toBe('25.00,0.00 75.00,100.00');
  });
});

describe('holeColumns and the instrument scale', () => {
  const holes = [
    hole({ hole: 1, par: 4, score: 3, scoreToPar: -1, fairwayHit: true, gir: true }),
    hole({ hole: 2, par: 5, score: 3, scoreToPar: -2, fairwayHit: false, driveMiss: 'left_short' }),
    hole({ hole: 3, par: 3, score: 5, scoreToPar: 2 }),
  ];

  it('marks an eagle or better as the deeper green', () => {
    const columns = holeColumns(holes);
    expect(columns[0]!.deep).toBe(false);
    expect(columns[1]!.deep).toBe(true);
  });

  it('keeps a par-3’s missing fairway target as null rather than a miss', () => {
    const columns = holeColumns(holes);
    expect(columns[2]!.fairway).toEqual({ hit: null, side: null });
    expect(columns[1]!.fairway).toEqual({ hit: false, side: 'left' });
  });

  it('prints the par row header once and bare numerals after it', () => {
    const columns = holeColumns(holes);
    expect(columns.map((c) => c.overline)).toEqual(['Par 4', '5', '3']);
  });

  it('never lets the scale fall below three strokes', () => {
    expect(roundShapeCap(holeColumns([hole({ hole: 1, scoreToPar: 1 })]))).toBe(3);
    expect(roundShapeCap(holeColumns(holes))).toBe(3);
    expect(roundShapeCap(holeColumns([hole({ hole: 1, scoreToPar: 5 })]))).toBe(5);
  });

  it('reports whether any hole logged an off-the-tee result at all', () => {
    expect(hasFairwayRow(holes)).toBe(true);
    expect(hasFairwayRow([hole({ hole: 1 })])).toBe(false);
  });
});

describe('humanizeClub', () => {
  it('never leaks the raw club token into the table', () => {
    expect(humanizeClub('non_driver')).toBe('Non-driver');
    expect(humanizeClub('driver')).toBe('Driver');
    expect(humanizeClub('three_wood')).toBe('Three wood');
    expect(humanizeClub(null)).toBeNull();
  });
});

describe('nineDivider', () => {
  const split = {
    front: { score: 38, putts: 16, gir: 4, girTotal: 9, fairways: 3, fairwayTotal: 7 },
    back: { score: 40, putts: 17, gir: 5, girTotal: 9, fairways: 4, fairwayTotal: 7 },
  };

  it('separates the nines with both halves’ scores', () => {
    const holes = Array.from({ length: 18 }, (_, i) => hole({ hole: i + 1 }));
    expect(nineDivider(holes, split)).toEqual({ afterIndex: 8, frontLabel: 'OUT 38', backLabel: 'IN 40' });
  });

  it('is absent on a nine-hole round, where there is no second half', () => {
    const holes = Array.from({ length: 9 }, (_, i) => hole({ hole: i + 1 }));
    expect(nineDivider(holes, { ...split, back: { ...split.back, score: 0 } })).toBeNull();
  });
});

describe('seasonColumns (the degraded stage)', () => {
  const rows = [
    { id: 'r3', round_date: '2026-06-01', score_to_par: 2 },
    { id: 'r2', round_date: '2026-05-20', score_to_par: -1 },
    { id: 'r1', round_date: '2026-05-10', score_to_par: 5 },
  ];

  it('reads oldest to newest and marks the round being reviewed', () => {
    const columns = seasonColumns(rows, 'r3');
    expect(columns.map((c) => c.key)).toEqual(['r1', 'r2', 'r3']);
    expect(columns.map((c) => c.marked)).toEqual([false, false, true]);
    expect(columns[0]!.overline).toBe('May 10');
  });

  it('refuses to draw a trajectory from fewer than two rounds', () => {
    expect(seasonColumns(rows.slice(0, 1), 'r3')).toEqual([]);
    expect(seasonColumns([], 'r3')).toEqual([]);
  });
});

describe('buildVerdict', () => {
  const base = { totalScore: 74, scoreToPar: 2, courseName: 'Pine Lakes' };

  function text(parts: { text: string }[]): string {
    return parts.map((p) => p.text).join('');
  }

  it('collapses to the honest scorecard-only sentence when there are no holes', () => {
    const parts = buildVerdict({ ...base, deltas: [], strokesToGain: [] });
    expect(text(parts)).toBe('74 (+2) at Pine Lakes. Scorecard only, so there is no hole-by-hole read yet.');
  });

  it('never invents a stretch or a cost clause after the scorecard-only sentence', () => {
    const parts = buildVerdict({
      ...base,
      deltas: [],
      strokesToGain: [{ category: 'Putting', potentialStrokes: 1.2, description: '' }],
    });
    expect(text(parts)).not.toContain('Putting');
  });

  it('names the best stretch and the biggest leak from real fields', () => {
    const deltas = holeDeltasFromMomentum(momentumFrom([1, 0, -1, 0, -1, 2, 1, 0, 0]));
    const parts = buildVerdict({
      ...base,
      deltas,
      strokesToGain: [
        { category: 'Approach', potentialStrokes: 0.8, description: '' },
        { category: 'Putting', potentialStrokes: 2.1, description: '' },
      ],
    });
    const sentence = text(parts);
    expect(sentence).toContain('Holes 2 to 5 were the round: 2 under.');
    expect(sentence).toContain('Putting cost 2.1 strokes.');
  });

  it('states a level stretch as holes without a dropped shot, never as "0 under"', () => {
    const deltas = holeDeltasFromMomentum(momentumFrom([1, 0, 0, 0, 2]));
    const sentence = text(buildVerdict({ ...base, deltas, strokesToGain: [] }));
    expect(sentence).toContain('The round held through holes 2 to 4, 3 holes without a dropped shot.');
    expect(sentence).not.toContain('0 under');
  });

  it('omits the opening clause entirely when the round has no score', () => {
    const parts = buildVerdict({
      totalScore: null,
      scoreToPar: null,
      courseName: 'Pine Lakes',
      deltas: [],
      strokesToGain: [],
    });
    expect(text(parts)).toBe('Pine Lakes. Scorecard only, so there is no hole-by-hole read yet.');
  });
});

describe('topLeak and buildLeakRows', () => {
  const items = [
    { category: 'Approach', potentialStrokes: 0.8, description: 'a' },
    { category: 'Putting', potentialStrokes: 2.0, description: 'b' },
    { category: 'Driving', potentialStrokes: 0, description: 'c' },
  ];

  it('ranks by the size of the opportunity, ignoring zero rows', () => {
    expect(topLeak(items)?.category).toBe('Putting');
    const rows = buildLeakRows(items);
    expect(rows.map((r) => r.category)).toEqual(['Putting', 'Approach']);
    expect(rows[0]!.share).toBe(1);
    expect(rows[1]!.share).toBeCloseTo(0.4);
  });

  it('is empty rather than a zero bar when nothing was computed', () => {
    expect(buildLeakRows([])).toEqual([]);
    expect(topLeak([])).toBeNull();
  });
});

describe('buildFacts', () => {
  it('omits every fact whose source is null and never prints a zero penalty', () => {
    expect(
      buildFacts({
        totalPutts: 31,
        fairwaysHit: null,
        fairwaysPlayed: null,
        gir: 9,
        girPossible: 18,
        penalties: 0,
      }),
    ).toEqual(['31 putts', '9/18 greens']);
  });

  it('prints every fact that exists', () => {
    expect(
      buildFacts({
        totalPutts: 31,
        fairwaysHit: 7,
        fairwaysPlayed: 14,
        gir: 9,
        girPossible: 18,
        penalties: 2,
      }),
    ).toEqual(['31 putts', '7/14 fairways', '9/18 greens', '2 penalties']);
  });
});

describe('compareToAverage', () => {
  it('reads a lower score as better and a lower greens count as worse', () => {
    expect(compareToAverage(2, 4.5, 'lower', '')).toEqual({ text: '2.5 better than recent', tone: 'good' });
    expect(compareToAverage(40, 55, 'higher', ' pts')).toEqual({ text: '15.0 pts worse than recent', tone: 'bad' });
  });

  it('calls a difference under a tenth level rather than movement', () => {
    expect(compareToAverage(2, 2.04, 'lower', '')?.tone).toBe('flat');
  });

  it('is null when there is no average to compare against', () => {
    expect(compareToAverage(2, null, 'lower', '')).toBeNull();
    expect(compareToAverage(null, 2, 'lower', '')).toBeNull();
  });
});

describe('buildReadouts', () => {
  const round = {
    totalScore: 74,
    scoreToPar: 2,
    totalPutts: 31,
    gir: 9,
    girPossible: 18,
    fairwaysHit: 7,
    fairwaysPlayed: 14,
    onePutts: 5,
    threePutts: 1,
  };

  it('carries no delta at all when the comparison averages are absent', () => {
    const readouts = buildReadouts({ ...round, averages: null });
    expect(readouts.map((r) => r.value)).toEqual(['74', '31', '9/18', '7/14']);
    expect(readouts.every((r) => r.delta === null)).toBe(true);
  });

  it('compares each readout in its own good direction', () => {
    const readouts = buildReadouts({
      ...round,
      averages: {
        avgScore: 78,
        avgScoreToPar: 6,
        avgPutts: 33,
        avgGirPct: 40,
        avgFairwayPct: 60,
      },
    });
    expect(readouts[0]!.delta).toEqual({ text: '4.0 better than recent', tone: 'good' });
    expect(readouts[1]!.delta).toEqual({ text: '2.0 better than recent', tone: 'good' });
    expect(readouts[2]!.delta).toEqual({ text: '10.0 pts better than recent', tone: 'good' });
    expect(readouts[3]!.delta).toEqual({ text: '10.0 pts worse than recent', tone: 'bad' });
  });

  it('renders a missing measurement as absent, never as zero', () => {
    const readouts = buildReadouts({
      ...round,
      totalPutts: null,
      gir: null,
      girPossible: null,
      onePutts: null,
      threePutts: null,
      averages: null,
    });
    expect(readouts[1]!.value).toBeNull();
    expect(readouts[1]!.caption).toBeNull();
    expect(readouts[2]!.value).toBeNull();
  });
});
