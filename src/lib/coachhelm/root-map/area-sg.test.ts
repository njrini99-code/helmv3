/**
 * Root map area SG: countable rounds only, per 18 holes.
 *
 * Fixture = player 49ffe06d…'s 21 completed rounds as stored in production
 * (read 2026-09-25): one 9-hole round, two hole-less seeded rounds with no
 * SG, and the 37-stroke "18-hole" round (SG total +34.51, tee +17.89) that
 * the stats-cache average (update_player_stats_strokes_gained) still counts.
 */
import { describe, expect, it } from 'vitest';
import { areaRoundFromStored, averageAreaSg, type AreaSgRound, type StoredSgRoundRow } from './area-trends';

type Fx = [date: string, holes: number, total: number | null, front: number | null, back: number | null, putts: number | null, sgTot: number | null, sgTee: number | null, sgPutt: number | null];

const FIXTURE: Fx[] = [
  ['2026-05-18', 9, 38, 38, null, 16, -2.9, -0.59, -3.06],
  ['2026-05-21', 18, 74, 36, 38, 31, -2.94, 1.24, -2.14],
  ['2026-05-22', 18, 71, 36, 35, 28, 0.52, 1.27, 1.93],
  ['2026-05-28', 18, 74, 39, 35, 33, -2.93, -0.1, -3.32],
  ['2026-05-29', 18, 75, 38, 37, 35, -3.93, 0.57, -4.78],
  ['2026-05-29', 18, 77, 37, 40, 35, -6.18, 0.46, -5.27],
  ['2026-06-08', 18, 75, 35, 40, 32, -4.83, -0.57, -3.17],
  ['2026-06-09', 18, 75, 38, 37, 31, -5.83, 0.48, -3.27],
  ['2026-06-10', 18, 70, 36, 34, 34, 0.44, 1.43, -3.91],
  ['2026-07-02', 18, 69, 35, 33, 32, 2.19, 0.72, -4.06],
  ['2026-07-02', 18, 74, 35, 38, 32, -2.84, 1.74, -2.38],
  ['2026-07-03', 18, 78, 39, 38, 38, -8.46, 1.73, -7.6],
  ['2026-07-08', 18, 76, 39, 36, 32, -2.9, 2.29, -4.71],
  ['2026-07-09', 18, 87, 43, 43, 33, -14.04, 0.29, -5.34],
  ['2026-07-10', 18, 85, 45, 39, 35, -11.9, 1.26, -7.61],
  ['2026-08-02', 18, 69, 34, 35, 37, 1.47, 2.8, -2.94],
  ['2026-08-02', 18, 70, 35, 35, 38, 0.47, 2.53, -3.94],
  ['2026-08-02', 18, 71, 35, 36, 39, -0.53, 2.26, -4.94],
  ['2026-08-31', 18, 73, null, null, null, null, null, null],
  ['2026-08-31', 18, 75, null, null, null, null, null, null],
  ['2026-09-17', 18, 37, 19, 18, 18, 34.51, 17.89, 14.92],
];

function row([date, holes, total, front, back, putts, sgTot, sgTee, sgPutt]: Fx): StoredSgRoundRow {
  return {
    round_date: date,
    holes_played: holes,
    total_score: total,
    front_nine: front,
    back_nine: back,
    total_putts: putts,
    strokes_gained_total: sgTot,
    strokes_gained_tee: sgTee,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: sgPutt,
  };
}

const rounds = FIXTURE.map(row).map(areaRoundFromStored).filter((r): r is AreaSgRound => r !== null);

describe('areaRoundFromStored', () => {
  it('drops the 37-stroke round and the hole-less rounds', () => {
    expect(rounds).toHaveLength(18);
    expect(rounds.some((r) => r.date === '2026-09-17')).toBe(false);
    expect(rounds.some((r) => r.date === '2026-08-31')).toBe(false);
  });

  it('reads a 9-hole round per 18 holes', () => {
    const nine = rounds.find((r) => r.date === '2026-05-18')!;
    expect(nine.tee).toBeCloseTo(-1.18, 6);
    expect(nine.putting).toBeCloseTo(-6.12, 6);
    expect(nine.total).toBeCloseTo(-5.8, 6);
  });
});

describe('averageAreaSg', () => {
  it('matches the countable, per-18 average for player 49ffe06d', () => {
    const avg = averageAreaSg(rounds);
    expect(avg.roundsPlayed).toBe(18);
    expect(avg.sg.tee).toBeCloseTo(1.0678, 3);
    expect(avg.sg.putting).toBeCloseTo(-4.0872, 3);
    expect(avg.sgTotal).toBeCloseTo(-3.7789, 3);
    expect(avg.sg.approach).toBeNull();
  });

  it('is not the stats-cache figure, which still counts the broken round', () => {
    // What update_player_stats_strokes_gained stores: every completed round
    // with an SG total, raw (tee +1.98, putting -2.93).
    const all = FIXTURE.filter((f) => f[6] !== null);
    const tee = all.reduce((s, f) => s + (f[7] as number), 0) / all.length;
    const putt = all.reduce((s, f) => s + (f[8] as number), 0) / all.length;
    expect(tee).toBeCloseTo(1.98, 2);
    expect(putt).toBeCloseTo(-2.93, 2);
    const avg = averageAreaSg(rounds);
    expect(avg.sg.tee).toBeLessThan(tee - 0.8);
    expect(avg.sg.putting).toBeLessThan(putt - 1);
  });

  it('counts only rounds with a stored SG total; empty in, empty out', () => {
    expect(averageAreaSg([])).toEqual({
      roundsPlayed: 0,
      sgTotal: null,
      sg: { tee: null, approach: null, short_game: null, putting: null },
    });
    const noTotal: AreaSgRound = { date: '2026-01-01', tee: 1, approach: null, short_game: null, putting: -1, total: null };
    expect(averageAreaSg([noTotal]).roundsPlayed).toBe(0);
  });
});
