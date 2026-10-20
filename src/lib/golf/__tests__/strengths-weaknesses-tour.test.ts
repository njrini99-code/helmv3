import { describe, it, expect } from 'vitest';
import {
  generateStatisticalStrengthsWeaknesses,
  puttingStrokesVsTour,
  type StatisticalStrengthWeakness,
} from '../strokes-gained';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/**
 * Owner decision Q-93: the Priorities engine (strengths / weaknesses) grades
 * against the Tour only (PGA Tour for men's teams, LPGA Tour for women's
 * teams), never a college or division benchmark. Items with no Tour value are
 * gone, not approximated.
 *
 * Sparse fixtures on purpose: only the fields an item reads are set, the same
 * shape the SG-relative tests use.
 */
function makeStats(overrides: Partial<Record<keyof GolfStats, unknown>> = {}): GolfStats {
  return { roundsPlayed: 10, holesPlayed: 180, ...overrides } as unknown as GolfStats;
}

const all = (r: { strengths: StatisticalStrengthWeakness[]; weaknesses: StatisticalStrengthWeakness[] }) => [
  ...r.strengths,
  ...r.weaknesses,
];
const find = (list: StatisticalStrengthWeakness[], label: string) => list.find((x) => x.label === label);

/** `PGA Tour` that is not the tail of `LPGA Tour`. */
const MENS_TOUR_LABEL = /(?<!L)PGA Tour/;
const NOT_COLLEGE = /\bD[123]\b|division|college|NCAA|target/i;

describe('Priorities are graded against the Tour', () => {
  it("grades 3-5 ft putting against the PGA Tour value for a men's team", () => {
    // 36 putts of 3-5 ft over 180 holes = 3.6 per 18. (80.5 - 90.5)/100 * 3.6 = -0.36.
    const { weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ puttMakePct3_5: 80.5, puttMakeCount3_5: 36 }),
      'pga',
    );
    const row = find(weaknesses, 'Putting 3-5ft make rate');
    expect(row).toBeDefined();
    expect(row!.benchmark).toBe(90.5);
    expect(row!.strokeImpact).toBeCloseTo(-0.36, 5);
    expect(row!.detail).toContain('PGA Tour');
    expect(row!.detail).not.toContain('benchmark:');
  });

  it("grades the same putting against the LPGA Tour value for a women's team", () => {
    const { weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ puttMakePct3_5: 80.5, puttMakeCount3_5: 36 }),
      'lpga',
    );
    const row = find(weaknesses, 'Putting 3-5ft make rate');
    expect(row).toBeDefined();
    expect(row!.benchmark).toBe(86);
    expect(row!.strokeImpact).toBeCloseTo(-0.198, 5); // (80.5 - 86)/100 * 3.6
    expect(row!.detail).toContain('LPGA Tour');
    expect(row!.detail).not.toMatch(MENS_TOUR_LABEL);
    expect(`${row!.recommendation}`).not.toMatch(MENS_TOUR_LABEL);
  });

  it('turns a make rate above the Tour into a strength', () => {
    const { strengths } = generateStatisticalStrengthsWeaknesses(
      makeStats({ puttMakePct5_10: 70, puttMakeCount5_10: 54 }),
      'pga',
    );
    const row = find(strengths, 'Putting 5-10ft make rate');
    expect(row).toBeDefined();
    expect(row!.strokeImpact).toBeGreaterThan(0);
    expect(row!.recommendation).toBeUndefined();
  });

  it('does not grade a putting band with fewer than 10 putts', () => {
    const result = generateStatisticalStrengthsWeaknesses(
      makeStats({ puttMakePct10_15: 0, puttMakeCount10_15: 9 }),
      'pga',
    );
    expect(find(all(result), 'Putting 10-15ft make rate')).toBeUndefined();
  });

  it('drops the putting bands the Tour has no exact band for (0-3 ft, 15-20 ft)', () => {
    const result = generateStatisticalStrengthsWeaknesses(
      makeStats({
        puttMakePct0_3: 50,
        puttMakeCount0_3: 100,
        puttMakePct15_20: 0,
        puttMakeCount15_20: 100,
      }),
      'pga',
    );
    expect(all(result)).toHaveLength(0);
  });

  it('grades penalties per round against the Tour penalty rate', () => {
    const pga = generateStatisticalStrengthsWeaknesses(makeStats({ penaltiesPerRound: 1.3 }), 'pga');
    expect(find(pga.weaknesses, 'Penalties per round')!.strokeImpact).toBeCloseTo(-1.0, 5); // 0.3 - 1.3
    const lpga = generateStatisticalStrengthsWeaknesses(makeStats({ penaltiesPerRound: 1.3 }), 'lpga');
    expect(find(lpga.weaknesses, 'Penalties per round')!.strokeImpact).toBeCloseTo(-0.9, 5); // 0.4 - 1.3
  });

  it('grades sand saves against the Tour sand scrambling rate, per 18 holes', () => {
    // 12 attempts over 180 holes = 1.2 per 18. (20 - 50)/100 * 1.2 = -0.36.
    const stats = makeStats({ sandSavePercentage: 20, sandSaveAttempts: 12 });
    const pga = generateStatisticalStrengthsWeaknesses(stats, 'pga');
    const row = find(pga.weaknesses, 'Sand save percentage');
    expect(row!.benchmark).toBe(50);
    expect(row!.strokeImpact).toBeCloseTo(-0.36, 5);
    const lpga = generateStatisticalStrengthsWeaknesses(stats, 'lpga');
    expect(find(lpga.weaknesses, 'Sand save percentage')!.benchmark).toBe(45);
    // Under 5 attempts is not graded.
    const thin = generateStatisticalStrengthsWeaknesses(
      makeStats({ sandSavePercentage: 0, sandSaveAttempts: 4 }),
      'pga',
    );
    expect(find(all(thin), 'Sand save percentage')).toBeUndefined();
  });

  it('grades big numbers per 100 holes against the Tour rate, not per round', () => {
    // 18 doubles-or-worse over 180 holes = 10 per 100 holes. The round-based
    // field is wrong on purpose (9-hole rounds inflate a per-round average);
    // the item must read holes, not rounds.
    const stats = makeStats({ totalDoublePlus: 18, doublePlusPerRound: 0 });
    const pga = generateStatisticalStrengthsWeaknesses(stats, 'pga');
    const row = find(pga.weaknesses, 'Doubles+ per round');
    expect(row).toBeDefined();
    expect(row!.strokeImpact).toBeCloseTo(((2.0 - 10) / 100) * 18, 5); // -1.44
    expect(row!.benchmark).toBeCloseTo(0.36, 5); // 2.0 per 100 holes, per 18
    const lpga = generateStatisticalStrengthsWeaknesses(stats, 'lpga');
    expect(find(lpga.weaknesses, 'Doubles+ per round')!.strokeImpact).toBeCloseTo(((3.0 - 10) / 100) * 18, 5);
  });

  it('removes every item that has no Tour value', () => {
    // Every dropped metric is set so badly (or so well) that it would take a
    // top-3 slot if it still existed.
    const result = generateStatisticalStrengthsWeaknesses(
      makeStats({
        // GIR by distance, from lie, par 5
        girPct50_75: 5,
        girPct75_100: 5,
        girPct100_125: 5,
        girPct125_150: 5,
        girPct150_175: 5,
        girPct175_200: 5,
        girPct200_225: 5,
        girPct225Plus: 5,
        girPctFromFairway: 5,
        girPctFromRough: 5,
        girPctPar5: 5,
        // fairways, overall scrambling, birdies, 3-putts
        fairwayPercentage: 5,
        scramblingPercentage: 5,
        scrambleAttempts: 100,
        birdiesPerRound: 0,
        threePuttsPerRound: 6,
        // miss pattern (invented -0.2 impact) and the raw-score pressure gap
        missLeftPct: 90,
        missRightPct: 10,
        missLeftCount: 30,
        missRightCount: 3,
        qualifyingScoringAvg: 90,
        practiceScoringAvg: 70,
        qualifyingRounds: 5,
        practiceRounds: 5,
        // one Tour item so the lists are not empty
        penaltiesPerRound: 1.3,
      }),
      'pga',
    );
    expect(all(result).map((r) => r.label)).toEqual(['Penalties per round']);

    const good = generateStatisticalStrengthsWeaknesses(
      makeStats({
        girPct125_150: 99,
        girPctFromFairway: 99,
        girPctPar5: 99,
        fairwayPercentage: 99,
        scramblingPercentage: 99,
        scrambleAttempts: 100,
        birdiesPerRound: 9,
        threePuttsPerRound: 0,
      }),
      'pga',
    );
    expect(all(good)).toHaveLength(0);
  });

  it('never renders a college, division or target wording, for either tour', () => {
    const stats = makeStats({
      puttMakePct3_5: 70,
      puttMakeCount3_5: 40,
      puttMakePct5_10: 30,
      puttMakeCount5_10: 50,
      puttMakePct10_15: 10,
      puttMakeCount10_15: 40,
      penaltiesPerRound: 1.5,
      sandSavePercentage: 10,
      sandSaveAttempts: 20,
      totalDoublePlus: 25,
      sgTeePerRound: 0.3,
      sgApproachPerRound: -1,
      sgAroundGreenPerRound: -0.5,
      sgPuttingPerRound: -0.8,
    });
    for (const tour of ['pga', 'lpga'] as const) {
      const result = generateStatisticalStrengthsWeaknesses(stats, tour);
      const rows = all(result);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const text = [row.category, row.label, row.detail, row.recommendation ?? ''].join(' | ');
        expect(text).not.toMatch(NOT_COLLEGE);
        if (tour === 'lpga') expect(text).not.toMatch(MENS_TOUR_LABEL);
      }
    }
  });
});

describe('puttingStrokesVsTour (the Putting cost line)', () => {
  it('nets every Tour-comparable band and never reads the SG self-relative item', () => {
    // 3-5 ft: (80.5-90.5)/100 * 3.6 = -0.36 ; 5-10 ft: (72.2-62.2)/100 * 5.4 = +0.54 ;
    // 10-15 ft: (25.7-35.7)/100 * 3.6 = -0.36 ; net -0.18 over 3 bands.
    const stats = makeStats({
      puttMakePct3_5: 80.5,
      puttMakeCount3_5: 36,
      puttMakePct5_10: 72.2,
      puttMakeCount5_10: 54,
      puttMakePct10_15: 25.7,
      puttMakeCount10_15: 36,
      sgPuttingPerRound: -3,
    });
    const cost = puttingStrokesVsTour(stats, 'pga');
    expect(cost).not.toBeNull();
    expect(cost!.bands).toBe(3);
    expect(cost!.strokes).toBeCloseTo(-0.36 + ((72.2 - 62.2) / 100) * 5.4 - 0.36, 5);
  });

  it('differs by tour and is null with no gradable band', () => {
    const stats = makeStats({ puttMakePct3_5: 80.5, puttMakeCount3_5: 36 });
    expect(puttingStrokesVsTour(stats, 'pga')!.strokes).toBeCloseTo(-0.36, 5);
    expect(puttingStrokesVsTour(stats, 'lpga')!.strokes).toBeCloseTo(-0.198, 5);
    expect(puttingStrokesVsTour(makeStats(), 'pga')).toBeNull();
    expect(puttingStrokesVsTour(makeStats({ puttMakePct3_5: 50, puttMakeCount3_5: 9 }), 'pga')).toBeNull();
  });
});
