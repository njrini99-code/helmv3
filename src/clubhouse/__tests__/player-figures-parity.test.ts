import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { seasonScoringEnvelope } from '@/lib/coachhelm/v3/chat/season-reads';
import { playerFiguresOver } from '../data/player-figures';
import { countsForScoring, type ChRound } from '../data/season';
import { roundsInFilter } from '../data/stats-common';
import { filterFor } from '../data/stats-filter';
import { summarizeWindow } from '../data/stats-weight';

// Player Ask, staging, 2026-11-08: "How many putts did I average this season?" said 27 from the stats cache (a window of 131 days that
// ended in September, nine-hole rounds counted as full ones) while Stats said 32.6 for Last 10, and the season's scoring read was a
// third window. Ask now reads a round-based figure from the rounds, in the window the question names, with Stats' rules.

const START = '2026-08-01';
let seq = 0;
const round = (date: string, putts: number | null, score: number, over: Partial<ChRound> = {}): ChRound =>
  ({
    id: `r${String(++seq).padStart(3, '0')}`, player_id: 'cole', course_name: 'Pines', tees_played: null, round_date: date, round_type: 'tournament',
    total_score: score, score_to_par: score - 72, front_nine: 36, back_nine: score - 36, holes_played: 18, total_putts: putts, total_gir: 9, total_gir_possible: 18,
    total_fairways_hit: 8, total_fairways: 14, strokes_gained_tee: -1, strokes_gained_approach: -3, strokes_gained_around_green: 0, strokes_gained_putting: -2,
    strokes_gained_total: -6, ...over,
  }) as ChRound;

// Newest first, as the loader returns them. Fourteen counted rounds (three before the season began), a practice round and a round
// with no putts recorded, a nine-hole round.
const rounds: ChRound[] = [
  round('2026-10-21', 30, 73), round('2026-10-21', 37, 77), round('2026-10-21', 37, 74),
  round('2026-10-06', 31, 82, { round_type: 'practice' }),
  round('2026-09-26', null, 70), round('2026-09-25', 0, 71),
  round('2026-09-15', 30, 77), round('2026-09-13', 31, 87), round('2026-08-27', 34, 81), round('2026-08-26', 31, 77), round('2026-08-25', 31, 76),
  round('2026-08-23', 31, 83), round('2026-08-22', 31, 83), round('2026-08-21', 32, 78),
  round('2026-07-20', 40, 90), round('2026-07-10', 40, 90), round('2026-07-01', 40, 90),
  round('2026-09-02', 14, 38, { holes_played: 9, front_nine: 38, back_nine: null }),
];

describe('Ask reads a player’s round-based figures as Stats does', () => {
  it('Last 10 strokes gained, greens and fairways are the figures Stats prints for those rounds', () => {
    const f = playerFiguresOver(rounds, filterFor('last10'), START);
    const stats = summarizeWindow(roundsInFilter(rounds.filter(countsForScoring), filterFor('last10'), START));
    expect(f.legs).toEqual(stats.sgLegs);
    expect(f.sg_total).toBe(stats.sgPerRound);
    // Pooled over the holes (every round here is 9 of 18 greens and 8 of 14 fairways), never a mean of percentages.
    expect(f.gir_pct).toBeCloseTo(50, 9);
    expect(f.gir_holes).toBe(10 * 18);
    expect(f.fairway_pct).toBeCloseTo((8 / 14) * 100, 9);
  });

  const last10 = playerFiguresOver(rounds, filterFor('last10'), START);
  const season = playerFiguresOver(rounds, filterFor('season'), START);

  it('Last 10 is the newest ten 18-hole rounds, practice out, and putts count only rounds that recorded them', () => {
    expect(last10.rounds).toBe(10);
    expect(last10.window_end).toBe('2026-10-21');
    // The ten are Oct 21 ×3, Sep 26, 25, 15, 13, Aug 27, 26 and 25; two recorded no putts. 30, 37, 37, 30, 31, 34, 31, 31 over the
    // eight that did: not the cache's 27, and not a mean that counts a missing round as 0 putts.
    expect(last10.putts_per_round).toBeCloseTo((30 + 37 + 37 + 30 + 31 + 34 + 31 + 31) / 8, 9);
    expect(last10.putt_rounds).toBe(8);
  });

  it('the season starts on 1 August: three July rounds are out, so it is its own window', () => {
    expect(season.window_start).toBe('2026-08-21');
    expect(season.rounds).toBeLessThan(rounds.length);
    expect(season.putts_per_round).not.toBeCloseTo(last10.putts_per_round!, 3);
  });

  it('one scope, one window: the season’s figures and the season scoring read count the same rounds', () => {
    const seasonRounds = rounds.filter((r) => r.round_date >= START);
    const scoring = seasonScoringEnvelope({ team_id: 't', team_name: 'T', roster: [] } as never, seasonRounds as never, { id: 'cole', name: 'Cole' }, { start: START, today: '2026-11-08' });
    const avg = scoring.measurements.find((m) => m.metric_id === 'season_scoring_average')!;
    // The scoring read leaves the nine-hole round out; Stats' season figure counts it per 18. Put the 18-hole rounds through both.
    const eighteen = playerFiguresOver(rounds.filter((r) => r.holes_played === 18), filterFor('season'), START);
    expect(eighteen.rounds).toBe(avg.sample_size);
    expect(eighteen.scoring_average).toBeCloseTo(avg.value!, 1);
    expect(avg.window_start).toBe(START);
  });
});
