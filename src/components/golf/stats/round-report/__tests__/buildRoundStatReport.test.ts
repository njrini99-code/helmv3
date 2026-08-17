/**
 * ============================================================================
 * buildRoundStatReport — contract tests
 * ----------------------------------------------------------------------------
 * The report's whole reason to exist is that `n=20` and `n=0` must not look
 * alike, so these tests are mostly about the sample size: that it is present
 * where the calculator exposes a real denominator, ABSENT where it does not,
 * and never estimated in between.
 *
 * The baseline fixture is `calculateStatsFromShots([], [], [])` rather than a
 * hand-written 150-field literal — it exercises the calculator's own
 * initializer, so a field added to `GolfStats` shows up here as a real zero
 * instead of a `undefined` that only some of these assertions would catch.
 *
 * Distance-band assertions never hardcode which bucket a distance lands in;
 * they call `getPuttDistanceBucket` and key off what it returns. A test that
 * assumes 3ft is "0-3ft" would pass today and lie the moment the boundary
 * moves.
 * ========================================================================== */

import { describe, it, expect } from 'vitest';

import {
  calculateStatsFromShots,
  getPuttDistanceBucket,
  type GolfStats,
} from '@/lib/utils/golf-stats-calculator-shots';
import { buildRoundStatReport, type RoundReportMetric } from '../buildRoundStatReport';

/** A fully-zeroed `GolfStats` straight from the calculator's own initializer. */
function emptyStats(): GolfStats {
  return calculateStatsFromShots([], [], []);
}

function metricNamed(
  report: ReturnType<typeof buildRoundStatReport>,
  sectionId: string,
  label: string,
): RoundReportMetric {
  const section = report?.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`no section "${sectionId}"`);
  const metric = section.metrics.find((m) => m.label === label);
  if (!metric) throw new Error(`no metric "${label}" in section "${sectionId}"`);
  return metric;
}

/**
 * The production round the owner reported against: Pebble Beach,
 * `d00fd97f-1956-40fd-a831-c67516e3071c` — 18 holes, 70 shots, 38 putts, putt
 * distances only 3ft (x20) and 22ft (x18), every approach finishing 22.0 ft
 * away, and not a single bunker shot. It exercises three distinct shapes at
 * once: bands with a real n, bands with n=0, and a band whose count the
 * calculator does not expose at all.
 */
function pebbleBeachStats(): GolfStats {
  const base = emptyStats();
  const shortBand = getPuttDistanceBucket(3);
  const longBand = getPuttDistanceBucket(22);

  // Which top-level count field backs the 3ft putts depends on the bucket the
  // calculator actually assigns, so resolve it rather than assuming.
  const shortCountField = (
    {
      '0_3': 'puttMakeCount0_3',
      '3_5': 'puttMakeCount3_5',
      '5_10': 'puttMakeCount5_10',
      '10_15': 'puttMakeCount10_15',
      '15_20': 'puttMakeCount15_20',
    } as const
  )[shortBand];
  const shortPctField = (
    {
      '0_3': 'puttMakePct0_3',
      '3_5': 'puttMakePct3_5',
      '5_10': 'puttMakePct5_10',
      '10_15': 'puttMakePct10_15',
      '15_20': 'puttMakePct15_20',
    } as const
  )[shortBand];

  if (!shortCountField || !shortPctField) {
    throw new Error(`3ft resolved to band "${shortBand}", which has no top-level count field`);
  }
  // The 22ft band is the interesting one precisely because it has none.
  expect(['20_25', '25_30', '30_35', '35_plus']).toContain(longBand);

  return {
    ...base,
    roundsPlayed: 1,
    roundsPlayed18: 1,
    holesPlayed: 18,
    scoringAverage: 74,
    avgScoreToPar: 2,
    totalBirdies: 2,
    totalPars: 12,
    totalBogeys: 4,
    scoringByPar: {
      par3: { ...base.scoringByPar.par3, total: 4, avgToPar: 0.25 },
      par4: { ...base.scoringByPar.par4, total: 10, avgToPar: 0.1 },
      par5: { ...base.scoringByPar.par5, total: 4, avgToPar: -0.25 },
    },
    // Off the tee
    fairwaysHit: 9,
    fairwayOpportunities: 14,
    fairwayPercentage: 64.29,
    missLeftCount: 3,
    missRightCount: 2,
    missLeftPct: 60,
    missRightPct: 40,
    // Approach — every finish 22.0 ft, no sand
    girTotal: 11,
    girOpportunities: 18,
    girPercentage: 61.11,
    girCountFromFairway: 9,
    girCountFromRough: 5,
    girPctFromFairway: 77.78,
    girPctFromRough: 40,
    girPctFromSand: null,
    approachProximityAvg: 22,
    approachMissTotal: 7,
    approachMissShortPct: 57.14,
    // Short game — zero bunker shots is the honest-empty case
    scrambleAttempts: 7,
    scramblesMade: 3,
    scramblingPercentage: 42.86,
    sandSaveAttempts: 0,
    sandSavesMade: 0,
    sandSavePercentage: null,
    // Putting
    totalPutts: 38,
    puttsPerHole: 2.11,
    puttsPerGir: 2.0,
    [shortCountField]: 20,
    [shortPctField]: 85,
  };
}

describe('buildRoundStatReport', () => {
  it('returns null for null stats rather than an empty shell', () => {
    expect(buildRoundStatReport(null)).toBeNull();
    expect(buildRoundStatReport(undefined)).toBeNull();
  });

  it('flags a scorecard-only round as empty instead of a wall of zeros', () => {
    const report = buildRoundStatReport(emptyStats());
    expect(report).not.toBeNull();
    expect(report?.isEmpty).toBe(true);
    expect(report?.breakMatrix).toBeNull();
    // Every section is present in the model; the view decides to suppress them.
    expect(report?.sections.map((s) => s.id)).toEqual([
      'scoring',
      'tee',
      'approach',
      'short-game',
      'putting',
    ]);
    expect(report?.sections.every((s) => !s.hasSignal)).toBe(true);
  });

  it('never fabricates a zero for a count nothing was logged for', () => {
    const report = buildRoundStatReport(emptyStats());
    // These are plain integers on GolfStats, 0 both for "none happened" and
    // for "nothing was recorded" — they must render as absent, not as 0.
    for (const [section, label] of [
      ['scoring', 'Birdies'],
      ['scoring', 'Pars'],
      ['scoring', 'Penalties'],
      ['putting', 'Putts'],
      ['putting', '3-putts'],
      ['putting', '1-putts'],
      ['putting', 'Putts / hole'],
    ] as const) {
      expect(metricNamed(report, section, label).display, `${section}/${label}`).toBeNull();
    }
  });

  it('shows the scoring it does have for a scorecard-only round', () => {
    // 18 hole rows, no shots: holesPlayed and the score distribution are real,
    // everything shot-derived is not. The old panel hid the whole thing.
    const base = emptyStats();
    const stats: GolfStats = {
      ...base,
      roundsPlayed: 1,
      roundsPlayed18: 1,
      holesPlayed: 18,
      scoringAverage: 78,
      avgScoreToPar: 6,
      totalBirdies: 1,
      totalPars: 8,
      totalBogeys: 8,
      totalDoublePlus: 1,
    };
    const report = buildRoundStatReport(stats);

    expect(report?.isEmpty).toBe(false);
    expect(report?.sections.find((s) => s.id === 'scoring')?.hasSignal).toBe(true);
    expect(metricNamed(report, 'scoring', 'Birdies').display).toBe('1');
    // ...and putting still says nothing rather than claiming a clean sheet.
    expect(report?.sections.find((s) => s.id === 'putting')?.hasSignal).toBe(false);
    expect(metricNamed(report, 'putting', 'Putts').display).toBeNull();
    expect(metricNamed(report, 'putting', '3-putts').display).toBeNull();
  });

  it('orders categories the way a hole is played', () => {
    const report = buildRoundStatReport(pebbleBeachStats());
    expect(report?.sections.map((s) => s.title)).toEqual([
      'Scoring',
      'Off the tee',
      'Approach',
      'Short game',
      'Putting',
    ]);
  });

  it('puts each category denominator in its own header', () => {
    const report = buildRoundStatReport(pebbleBeachStats());
    const scope = (id: string) => report?.sections.find((s) => s.id === id)?.scope;
    expect(scope('scoring')).toBe('18 holes');
    expect(scope('tee')).toBe('14 fairway opportunities');
    expect(scope('approach')).toBe('18 approach shots');
    expect(scope('short-game')).toBe('7 up-and-down attempts');
    expect(scope('putting')).toBe('38 putts · 18 holes');
  });

  describe('sample sizes', () => {
    it('prints an exact n under a figure the calculator counts', () => {
      const stats = pebbleBeachStats();
      const report = buildRoundStatReport(stats);
      const shortBand = getPuttDistanceBucket(3);
      const label = { '0_3': 'Make 0-3ft', '3_5': 'Make 3-5ft' }[shortBand] ?? 'Make 0-3ft';

      const made = metricNamed(report, 'putting', label);
      expect(made.display).toBe('85%');
      expect(made.n).toBe(20);
      expect(made.note).toBe('n=20 putts');
    });

    it('shows a zero-sample band as awaiting with its real count, never as 0%', () => {
      const report = buildRoundStatReport(pebbleBeachStats());
      // 5-10ft, 10-15ft and 15-20ft had no putts at all this round.
      for (const label of ['Make 5-10ft', 'Make 10-15ft', 'Make 15-20ft']) {
        const m = metricNamed(report, 'putting', label);
        expect(m.display).toBeNull();
        expect(m.n).toBe(0);
        expect(m.awaitingLabel).toBe('No putts');
      }
    });

    it('a populated band and an empty band are distinguishable by value alone', () => {
      const report = buildRoundStatReport(pebbleBeachStats());
      const shortBand = getPuttDistanceBucket(3);
      const filledLabel = { '0_3': 'Make 0-3ft', '3_5': 'Make 3-5ft' }[shortBand] ?? 'Make 0-3ft';
      const filled = metricNamed(report, 'putting', filledLabel);
      const empty = metricNamed(report, 'putting', 'Make 10-15ft');

      expect(filled.display).not.toBeNull();
      expect(empty.display).toBeNull();
      expect(filled.n).not.toBe(empty.n);
      expect(filled.note).not.toBe(empty.note);
    });

    it('omits n entirely where GolfStats exposes no denominator', () => {
      const report = buildRoundStatReport(pebbleBeachStats());
      // Proximity, per-distance GIR, GIR from sand and the 20ft+ make bands all
      // lack a count field. None of them may borrow a neighbour's.
      for (const [section, label] of [
        ['approach', 'Proximity (all)'],
        ['approach', 'From sand'],
        ['tee', 'Driving distance'],
        ['putting', 'Make 20-25ft'],
        ['putting', 'Make 35ft+'],
        ['short-game', 'Chip proximity'],
      ] as const) {
        const m = metricNamed(report, section, label);
        expect(m.n, `${section}/${label} must not carry an n`).toBeNull();
        expect(m.note, `${section}/${label} must not carry a sample line`).toBeNull();
      }
    });

    it('does not reuse the break-cell sum as an n for the 20ft+ bands', () => {
      // Give the break cells real 20-25ft counts. `PuttingDrill` would sum them
      // into an n; this report must still report none, because that sum
      // undercounts every putt whose break was not recorded.
      const base = pebbleBeachStats();
      const stats: GolfStats = {
        ...base,
        puttMakePct20_25: 11,
        puttingByBreak: {
          ...base.puttingByBreak,
          straight: { ...base.puttingByBreak.straight, count20_25: 9, makePct20_25: 11, totalPutts: 9 },
        },
      };
      const m = metricNamed(buildRoundStatReport(stats), 'putting', 'Make 20-25ft');
      expect(m.display).toBe('11%');
      expect(m.n).toBeNull();
    });

    it('reads "N of M" where both halves of the ratio are exposed', () => {
      const report = buildRoundStatReport(pebbleBeachStats());
      expect(metricNamed(report, 'tee', 'Fairways hit').note).toBe('9 of 14 fairways');
      expect(metricNamed(report, 'approach', 'GIR').note).toBe('11 of 18 greens');
      expect(metricNamed(report, 'short-game', 'Scrambling').note).toBe('3 of 7 attempts');
    });

    it('says "No bunker shots" for a round that never found sand', () => {
      const report = buildRoundStatReport(pebbleBeachStats());
      const sand = metricNamed(report, 'short-game', 'Sand saves');
      expect(sand.display).toBeNull();
      expect(sand.n).toBe(0);
      expect(sand.awaitingLabel).toBe('No bunker shots');
    });

    it('singularises an n of one', () => {
      const stats: GolfStats = {
        ...emptyStats(),
        holesPlayed: 1,
        totalPutts: 1,
        puttMakeCount0_3: 1,
        puttMakePct0_3: 100,
        fairwaysHit: 1,
        fairwayOpportunities: 1,
        fairwayPercentage: 100,
        missLeftCount: 1,
        missRightCount: 0,
        missLeftPct: 100,
        girOpportunities: 1,
        girTotal: 1,
        girPercentage: 100,
        approachMissTotal: 1,
        approachMissShortPct: 100,
        girCountFromFairway: 1,
        girPctFromFairway: 100,
      };
      const report = buildRoundStatReport(stats);
      expect(metricNamed(report, 'putting', 'Make 0-3ft').note).toBe('n=1 putt');
      expect(metricNamed(report, 'tee', 'Miss left').note).toBe('n=1 tee miss');
      expect(metricNamed(report, 'approach', 'Miss short').note).toBe('n=1 missed green');
      expect(metricNamed(report, 'approach', 'From fairway').note).toBe('n=1 approach shot');
      expect(metricNamed(report, 'tee', 'Fairways hit').note).toBe('1 of 1 fairway');
      expect(report?.sections.find((s) => s.id === 'tee')?.scope).toBe('1 fairway opportunity');
    });
  });

  describe('formatting', () => {
    it('renders round-level to-par as a whole number and per-hole as a fraction', () => {
      const stats: GolfStats = {
        ...pebbleBeachStats(),
        avgScoreToPar: 3,
        scoringByPar: {
          ...pebbleBeachStats().scoringByPar,
          par3: { ...emptyStats().scoringByPar.par3, total: 4, avgToPar: 0.25 },
          par4: { ...emptyStats().scoringByPar.par4, total: 10, avgToPar: -0.1 },
          par5: { ...emptyStats().scoringByPar.par5, total: 4, avgToPar: 0 },
        },
      };
      const report = buildRoundStatReport(stats);
      expect(metricNamed(report, 'scoring', 'To par').display).toBe('+3');
      expect(metricNamed(report, 'scoring', 'Par 3 avg').display).toBe('+0.25');
      expect(metricNamed(report, 'scoring', 'Par 4 avg').display).toBe('−0.10');
      expect(metricNamed(report, 'scoring', 'Par 5 avg').display).toBe('E');
    });

    it('renders a level and an under-par round distinctly', () => {
      const under = buildRoundStatReport({ ...pebbleBeachStats(), avgScoreToPar: -2 });
      const level = buildRoundStatReport({ ...pebbleBeachStats(), avgScoreToPar: 0 });
      expect(metricNamed(under, 'scoring', 'To par').display).toBe('−2');
      expect(metricNamed(level, 'scoring', 'To par').display).toBe('E');
    });
  });

  describe('make rate by break', () => {
    it('is built from puttingByBreak — the panel footer claiming it cannot be was wrong', () => {
      const base = pebbleBeachStats();
      const stats: GolfStats = {
        ...base,
        puttingByBreak: {
          ...base.puttingByBreak,
          left_to_right: {
            ...base.puttingByBreak.left_to_right,
            totalPutts: 6,
            overallMakePct: 50,
            count0_3: 4,
            makePct0_3: 75,
            count5_10: 2,
            makePct5_10: 0,
          },
          straight: {
            ...base.puttingByBreak.straight,
            totalPutts: 3,
            overallMakePct: 100,
            count0_3: 3,
            makePct0_3: 100,
          },
        },
      };
      const matrix = buildRoundStatReport(stats)?.breakMatrix;
      expect(matrix).not.toBeNull();
      expect(matrix?.cols).toEqual(['L → R', 'Straight', 'R → L', 'Multiple']);

      // Only bands somebody actually putted from appear.
      expect(matrix?.rows.map((r) => r.label)).toEqual(['0-3ft', '5-10ft']);

      const zeroToThree = matrix?.rows.find((r) => r.label === '0-3ft');
      expect(zeroToThree?.cells[0]).toEqual({ display: '75%', n: 4 });
      expect(zeroToThree?.cells[1]).toEqual({ display: '100%', n: 3 });
      // Untouched break directions stay null rather than becoming a 0% cell.
      expect(zeroToThree?.cells[2]).toBeNull();
      expect(zeroToThree?.cells[3]).toBeNull();

      // A genuine 0% with 2 attempts is a reading, not an absence.
      const fiveToTen = matrix?.rows.find((r) => r.label === '5-10ft');
      expect(fiveToTen?.cells[0]).toEqual({ display: '0%', n: 2 });

      expect(matrix?.overall[0]).toEqual({ label: 'L → R', display: '50%', n: 6 });
      expect(matrix?.overall[2]).toEqual({ label: 'R → L', display: null, n: 0 });
    });

    it('is null when no putt carried a recorded break', () => {
      expect(buildRoundStatReport(pebbleBeachStats())?.breakMatrix).toBeNull();
    });

    it('keeps a round out of the empty state when only the break matrix has data', () => {
      const base = emptyStats();
      const stats: GolfStats = {
        ...base,
        puttingByBreak: {
          ...base.puttingByBreak,
          straight: { ...base.puttingByBreak.straight, totalPutts: 2, overallMakePct: 50, count0_3: 2, makePct0_3: 50 },
        },
      };
      const report = buildRoundStatReport(stats);
      expect(report?.breakMatrix).not.toBeNull();
      expect(report?.isEmpty).toBe(false);
    });
  });

  it('names the unsampled figures rather than leaving them unexplained', () => {
    const report = buildRoundStatReport(pebbleBeachStats());
    expect(report?.unsampledNote).toMatch(/sand/i);
    expect(report?.unsampledNote).toMatch(/20ft/i);
    expect(report?.unsampledNote).toMatch(/proximity/i);
  });
});
