import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * The golden rounds (stats-golden.fixtures.ts) through every TypeScript stats path: the tracker's per-hole stats, the shot
 * calculator, and Clubhouse's window figures over the season loader. The numbers are the audit's hand-computed ones
 * (stats and charts audit 2026-11-15, section 3); the SQL paths have their own pgTAP twin (stats_golden_rounds.sql).
 *
 * No network: the season loader reads the evaluating fake, and the server client throws if anything asks for it.
 */

vi.mock('server-only', () => ({}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined), logServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('stats-golden: no Supabase client in this test');
  },
}));
vi.mock('@/app/golf/actions/stats-data', () => ({
  getDetailedStats: vi.fn(async () => {
    throw new Error('stats-golden: getDetailedStats not read');
  }),
  getSprayChartData: vi.fn(async () => {
    throw new Error('stats-golden: spray not read');
  }),
}));

import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import { calculateStatsFromShots } from '@/lib/utils/golf-stats-calculator-shots';
import { playerFiguresOver } from '../data/player-figures';
import { loadSeasonRounds } from '../data/season';
import { filterFor, withHoles } from '../data/stats-filter';
import { perEighteen } from '../data/stats-weight';
import { evalClient } from './supabase-eval-fake';
import {
  G1_EXPECTED,
  G1_HOLES,
  G2_EXPECTED,
  G2_HOLES,
  G4_ID,
  GOLDEN_PGTAP_PATH,
  GOLDEN_PLAYER_ID,
  GOLDEN_ROUND_INFOS,
  GOLDEN_SEASON_START,
  WINDOW_EXPECTED,
  g1HoleInfos,
  g1RawShots,
  g1ShotRecords,
  g2HoleInfos,
  goldenPgTapSql,
  goldenRoundRows,
} from './stats-golden.fixtures';

const pct = (made: number, of: number) => (made / of) * 100;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe('golden fixtures are self-consistent', () => {
  it('G1 holes add up to the audit table', () => {
    const ex = G1_HOLES.map((h) => h.expected);
    expect(sum(ex.map((h) => h.score))).toBe(G1_EXPECTED.total);
    expect(sum(G1_HOLES.slice(0, 9).map((h) => h.expected.score))).toBe(G1_EXPECTED.frontNine);
    expect(sum(G1_HOLES.slice(9).map((h) => h.expected.score))).toBe(G1_EXPECTED.backNine);
    expect(sum(G1_HOLES.map((h) => h.par))).toBe(72);
    expect(sum(ex.map((h) => h.putts))).toBe(G1_EXPECTED.putts);
    expect(ex.filter((h) => h.gir).length).toBe(G1_EXPECTED.gir.made);
    expect(ex.filter((h) => h.fairway !== null).length).toBe(G1_EXPECTED.fairways.of);
    expect(ex.filter((h) => h.fairway === true).length).toBe(G1_EXPECTED.fairways.made);
    expect(sum(ex.map((h) => h.penalties))).toBe(G1_EXPECTED.penaltyStrokes);
    // Every hole's shots are its score: one row per stroke, the penalty rows included.
    for (const h of G1_HOLES) expect(h.shots.length, `hole ${h.number}`).toBe(h.expected.score);
  });

  it('G2 holes add up to the audit line', () => {
    expect(sum(G2_HOLES.map((h) => h.score))).toBe(G2_EXPECTED.total);
    expect(sum(G2_HOLES.map((h) => h.putts))).toBe(G2_EXPECTED.putts);
    expect(G2_HOLES.filter((h) => h.gir).length).toBe(G2_EXPECTED.gir.made);
    // GIR on the score-less-putts rule the database writes: score - putts <= par - 2.
    for (const h of G2_HOLES) expect(h.gir, `hole ${h.number}`).toBe(h.score - h.putts <= h.par - 2);
  });
});

describe('G1 through the tracker (calculateHoleStats)', () => {
  const stats = G1_HOLES.map((h) => calculateHoleStats(g1ShotRecords(h), { number: h.number, par: h.par, yardage: h.yardage }));

  it('scores, putts, fairways, greens and penalties hole by hole', () => {
    G1_HOLES.forEach((h, i) => {
      const s = stats[i]!;
      expect({ hole: h.number, score: s.score, putts: s.putts, fairway: s.fairwayHit, gir: s.greenInRegulation, penalties: s.penaltyStrokes }).toEqual({
        hole: h.number,
        score: h.expected.score,
        putts: h.expected.putts,
        fairway: h.expected.fairway,
        gir: h.expected.gir,
        penalties: h.expected.penalties,
      });
    });
  });

  it('the round figures', () => {
    const gir = stats.filter((s) => s.greenInRegulation);
    const scr = stats.filter((s) => s.scrambleAttempt);
    expect(sum(stats.map((s) => s.score))).toBe(G1_EXPECTED.total);
    expect(sum(stats.map((s) => s.putts))).toBe(G1_EXPECTED.putts);
    expect(gir.length).toBe(G1_EXPECTED.gir.made);
    expect(sum(gir.map((s) => s.putts)) / gir.length).toBeCloseTo(G1_EXPECTED.puttsPerGir, 2);
    expect(scr.length).toBe(G1_EXPECTED.scrambling.of);
    expect(scr.filter((s) => s.scrambleMade).length).toBe(G1_EXPECTED.scrambling.made);
    expect(stats.filter((s) => s.putts === 1).length).toBe(G1_EXPECTED.onePutts);
    expect(stats.filter((s) => s.putts >= 3).length).toBe(G1_EXPECTED.threePutts);
    expect(stats.filter((s) => s.sandSaveAttempt).length).toBe(G1_EXPECTED.sandSavesTour.of);
  });

  it('sand saves on the Tour definition: 3 of 4 (SC-02)', () => {
    const made = stats.filter((s) => s.sandSaveMade).length;
    expect([made, stats.filter((s) => s.sandSaveAttempt).length]).toEqual([G1_EXPECTED.sandSavesTour.made, G1_EXPECTED.sandSavesTour.of]);
    // The old par-or-better rule read 2 of 4: the bogey out in two is the difference.
    expect(made).not.toBe(G1_EXPECTED.sandSavesOldAppRule.made);
  });
});

describe('G1 through the shot calculator (calculateStatsFromShots)', () => {
  const rounds = GOLDEN_ROUND_INFOS.filter((r) => r.id === 'golden-g1');

  for (const stored of [false, true]) {
    it(stored ? 'with the stored hole columns' : 'from the shots alone', () => {
      const s = calculateStatsFromShots(g1RawShots(), g1HoleInfos({ stored }), [...rounds]);
      expect(s.roundsPlayed).toBe(1);
      expect(s.holesPlayed).toBe(18);
      expect(s.scoringAverage).toBe(G1_EXPECTED.total);
      expect(s.avgScoreToPar).toBe(G1_EXPECTED.toPar);
      expect([s.girTotal, s.girOpportunities]).toEqual([G1_EXPECTED.gir.made, G1_EXPECTED.gir.of]);
      // The calculator rounds a rate to one place (safePercent): 55.6, 57.1, 50.0.
      expect(s.girPercentage).toBeCloseTo(G1_EXPECTED.gir.pct, 1);
      expect([s.fairwaysHit, s.fairwayOpportunities]).toEqual([G1_EXPECTED.fairways.made, G1_EXPECTED.fairways.of]);
      expect(s.fairwayPercentage).toBeCloseTo(G1_EXPECTED.fairways.pct, 1);
      expect(s.totalPutts).toBe(G1_EXPECTED.putts);
      expect(s.puttsPerGir).toBeCloseTo(G1_EXPECTED.puttsPerGir, 2);
      expect([s.scramblesMade, s.scrambleAttempts]).toEqual([G1_EXPECTED.scrambling.made, G1_EXPECTED.scrambling.of]);
      expect(s.scramblingPercentage).toBeCloseTo(G1_EXPECTED.scrambling.pct, 1);
      expect(s.onePuttsTotal).toBe(G1_EXPECTED.onePutts);
      expect(s.threePuttsTotal).toBe(G1_EXPECTED.threePutts);
      expect(s.totalPenalties).toBe(G1_EXPECTED.penaltyStrokes);
      expect([s.sandSavesMade, s.sandSaveAttempts]).toEqual([G1_EXPECTED.sandSavesTour.made, G1_EXPECTED.sandSavesTour.of]);
      expect(4 + (s.scoringByPar.par4.avgToPar as number)).toBeCloseTo(G1_EXPECTED.parAverages.par4, 3);
      expect(3 + (s.scoringByPar.par3.avgToPar as number)).toBeCloseTo(G1_EXPECTED.parAverages.par3, 3);
      expect(5 + (s.scoringByPar.par5.avgToPar as number)).toBeCloseTo(G1_EXPECTED.parAverages.par5, 3);
    });
  }
});

describe('the window over G1 to G4', () => {
  const read = () => loadSeasonRounds(evalClient({ current: { tables: { golf_rounds: goldenRoundRows() } } }) as never, [GOLDEN_PLAYER_ID], { surface: 'stats.golden', since: GOLDEN_SEASON_START });

  it('the season loader never returns the test round', async () => {
    const { rounds, error } = await read();
    expect(error).toBe(false);
    expect(rounds.map((r) => r.id)).toEqual(WINDOW_EXPECTED.countedRoundIds);
    expect(rounds.some((r) => r.id === G4_ID)).toBe(false);
    // G3 is a score, never a hole-level round.
    expect(rounds.find((r) => r.id === 'golden-g3')?.total_only).toBe(true);
  });

  it('playerFiguresOver, every length (a nine weighs half)', async () => {
    const { rounds } = await read();
    const f = playerFiguresOver(rounds, withHoles(filterFor('season'), 'all'), GOLDEN_SEASON_START);
    expect(f.rounds).toBe(3);
    expect(f.scoring_average).toBeCloseTo(WINDOW_EXPECTED.scoringAverageAnyLength, 2);
    expect(f.putts_per_round).toBeCloseTo(WINDOW_EXPECTED.puttsPer18, 2);
    for (const wrong of WINDOW_EXPECTED.puttsPer18Wrong) expect(f.putts_per_round).not.toBeCloseTo(wrong, 1);
    expect(f.gir_holes).toBe(WINDOW_EXPECTED.girPooled.of);
    expect(f.gir_pct).toBeCloseTo(WINDOW_EXPECTED.girPooled.pct, 2);
    expect(f.gir_pct).toBeCloseTo(pct(WINDOW_EXPECTED.girPooled.made, WINDOW_EXPECTED.girPooled.of), 6);
    // G4's +34.51 is never read: no counted round has strokes gained.
    expect(f.sg_rounds).toBe(0);
    expect(f.sg_total).toBeNull();
    expect(f.round_ids).not.toContain(G4_ID);
  });

  it('playerFiguresOver, eighteen-hole rounds only', async () => {
    const { rounds } = await read();
    const f = playerFiguresOver(rounds, filterFor('season'), GOLDEN_SEASON_START);
    expect(f.rounds).toBe(2);
    expect(f.scoring_average).toBeCloseTo(WINDOW_EXPECTED.scoringAverage18, 2);
    expect(f.putts_per_round).toBe(G1_EXPECTED.putts);
  });

  it('perEighteen over the calculator: best round 76, putts per 18, pooled greens', async () => {
    const { rounds } = await read();
    const s = calculateStatsFromShots(g1RawShots(), [...g1HoleInfos({ stored: true }), ...g2HoleInfos()], [...GOLDEN_ROUND_INFOS]);
    const p = perEighteen(s, rounds);
    expect(p.bestRound).toBe(WINDOW_EXPECTED.bestRound);
    expect(p.bestRound).not.toBe(WINDOW_EXPECTED.g4.total);
    expect(p.scoringAverage).toBeCloseTo(WINDOW_EXPECTED.scoringAverageAnyLength, 2);
    expect(p.puttsPerRound).toBeCloseTo(WINDOW_EXPECTED.puttsPer18, 2);
    expect([p.girTotal, p.girOpportunities]).toEqual([WINDOW_EXPECTED.girPooled.made, WINDOW_EXPECTED.girPooled.of]);
    expect([p.fairwaysHit, p.fairwayOpportunities]).toEqual([G1_EXPECTED.fairways.made + G2_EXPECTED.fairways.made, G1_EXPECTED.fairways.of + G2_EXPECTED.fairways.of]);
    expect([p.scramblesMade, p.scrambleAttempts]).toEqual([G1_EXPECTED.scrambling.made + G2_EXPECTED.scrambling.made, G1_EXPECTED.scrambling.of + G2_EXPECTED.scrambling.of]);
  });
});

describe('the SQL twin', () => {
  it('supabase/tests/rls/stats_golden_rounds.sql is generated from these fixtures', () => {
    const path = join(process.cwd(), GOLDEN_PGTAP_PATH);
    const sql = goldenPgTapSql();
    if (process.env.HELM_WRITE_GOLDEN_SQL === '1') writeFileSync(path, sql);
    expect(readFileSync(path, 'utf8')).toBe(sql);
  });
});
