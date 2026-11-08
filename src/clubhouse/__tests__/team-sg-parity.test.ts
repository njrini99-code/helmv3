import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { teamLegs } from '../data/home';
import { countsForScoring, type ChRound } from '../data/season';
import { filterFor } from '../data/stats-filter';
import { teamStrokesGainedOver } from '../data/team-sg';
import { playerFiguresOver, teamFiguresOver } from '../data/player-figures';
import { groupByPlayer } from '../data/season';
import type { ChRoundCache } from '../data/stats-common';

// Staging, 2026-11-08: Ask said "off the tee -1.21, approach -3.59 over 12 rounds" for the same team and question the Stats
// page answered "+0.4, -3.1" (Last 10). Ask now reads this function; Home's four parts and Team Stats read their own copy of the
// same rule, and this holds the two together.

const START = '2026-08-01';
let seq = 0;
const round = (player: string, daysBack: number, legs: [number, number, number, number], over: Partial<ChRound> = {}): ChRound => {
  const d = new Date('2026-10-21T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysBack);
  return {
    id: `r${String(++seq).padStart(4, '0')}`, player_id: player, course_name: 'Home', tees_played: null, round_date: d.toISOString().slice(0, 10), round_type: 'tournament',
    total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 30, total_gir: 10, total_gir_possible: 18, total_fairways_hit: 8, total_fairways: 14,
    strokes_gained_tee: legs[0], strokes_gained_approach: legs[1], strokes_gained_around_green: legs[2], strokes_gained_putting: legs[3],
    strokes_gained_total: legs[0] + legs[1] + legs[2] + legs[3], ...over,
  } as ChRound;
};

// One player with many rounds (his oldest are good ones the ten-round cut must leave out), two with few, one with a nine-hole round
// and a practice round that Stats leaves out, and one with only a total posted.
const rounds: ChRound[] = [
  ...Array.from({ length: 14 }, (_, i) => round('p1', i, i < 10 ? [-0.5, -3, 0.2, -2] : [2, 1, 1, 1])),
  ...Array.from({ length: 4 }, (_, i) => round('p2', i * 3, [1, -4, -0.3, -3.5])),
  round('p3', 1, [0.4, -2, 0, -1]),
  round('p3', 5, [0.2, -2.5, 0.1, -1.5]),
  round('p3', 9, [0.6, -2.2, -0.1, -1.1]),
  round('p3', 12, [9, 9, 9, 9], { round_type: 'practice' }),
  round('p3', 14, [1, 1, 1, 1], { holes_played: 9, front_nine: 37, back_nine: null }),
  round('p4', 2, [3, 3, 3, 3], { total_only: true }),
];
const ids = ['p1', 'p2', 'p3', 'p4'];
const players = ids.map((id) => ({ id, first_name: id, last_name: null }));
const cache = { byRound: new Map<string, ChRoundCache>(), error: false };

describe('Ask’s team strokes gained is the figure Stats and Home print for the same window', () => {
  const ask = teamStrokesGainedOver(rounds, ids, filterFor('last10'), START);
  const home = teamLegs({ full: rounds.filter(countsForScoring), players, cache, bench: { bench: new Map(), error: false }, tour: 'pga' })!;
  const homeSg = (key: 'tee' | 'approach' | 'around' | 'putting') => home.rows.find((r) => r.key === key)!.sg;

  it('reads the same four numbers over the same rounds', () => {
    expect(ask.legs.tee).toBeCloseTo(homeSg('tee')!, 9);
    expect(ask.legs.approach).toBeCloseTo(homeSg('approach')!, 9);
    expect(ask.legs.around).toBeCloseTo(homeSg('around')!, 9);
    expect(ask.legs.putting).toBeCloseTo(homeSg('putting')!, 9);
    expect(ask.rounds).toBe(home.holeRounds);
  });

  it('takes each player’s newest ten, leaves out practice, a total-only round and nine holes', () => {
    // p1: 10 of 14, p2: 4, p3: the 3 tournament rounds with holes.
    expect(ask.rounds).toBe(10 + 4 + 3);
    expect(ask.players).toBe(3);
    expect(ask.legs.tee).toBeCloseTo((10 * -0.5 + 4 * 1 + 0.4 + 0.2 + 0.6) / 17, 9);
  });

  it('a different window is a different, named figure: the season reads every counted round since the start', () => {
    const season = teamStrokesGainedOver(rounds, ids, filterFor('season'), START);
    expect(season.rounds).toBe(14 + 4 + 3);
    expect(season.legs.tee).not.toBeCloseTo(ask.legs.tee!, 3);
  });
});


// Ask's team value on a comparison is this one (owner, 2026-11-08): the team's figure is not the mean of the players' figures but the rounds of all the
// players pooled, as Team Stats pools them; the player's own figure is the same calculation over his rounds, practice cut the same way.
describe('Ask’s team figures are the pooled ones Stats prints, and a player’s are Stats’ own', () => {
  const f = filterFor('last10');
  const team = teamFiguresOver(rounds, ids, f, START);
  const sg = teamStrokesGainedOver(rounds, ids, f, START);

  it('its strokes gained legs are teamStrokesGainedOver’s, to the last digit, and its rounds and players are the same', () => {
    expect(team.legs).toEqual(sg.legs);
    expect(team.hole_rounds).toBe(sg.rounds);
    expect(team.players).toBe(sg.players);
    expect(team.window_start).toBe(sg.window_start);
    expect(team.window_end).toBe(sg.window_end);
  });

  it('pools the rounds rather than averaging the players: the team’s number is not the mean of the players’ numbers', () => {
    const byPlayer = groupByPlayer(rounds.filter(countsForScoring));
    const own = ids.map((id) => playerFiguresOver(byPlayer.get(id) ?? [], f, START)).filter((x) => x.legs.tee !== null);
    const mean = own.reduce((a, x) => a + (x.legs.tee as number), 0) / own.length;
    expect(team.legs.tee).toBeCloseTo((10 * -0.5 + 4 * 1 + 0.4 + 0.2 + 0.6) / 17, 9);
    expect(team.legs.tee).not.toBeCloseTo(mean, 2);
  });

  it('pools total strokes gained, greens and scoring over the same rounds: the total is the four legs, greens are the holes pooled', () => {
    const legs = team.legs;
    expect(team.sg_total).toBeCloseTo((legs.tee as number) + (legs.approach as number) + (legs.around as number) + (legs.putting as number), 9);
    // Every round here hit 10 of 18 greens.
    expect(team.gir_pct).toBeCloseTo((10 / 18) * 100, 9);
    // Scoring counts the total-only round too; the hole-level figures do not.
    expect(team.rounds).toBe(team.hole_rounds + 1);
    expect(team.scoring_average).toBeCloseTo(74, 9);
  });

  it('a player’s own figure is Stats’: practice left out, the newest ten, nine-hole and total-only rounds as Stats treats them', () => {
    const p3 = playerFiguresOver(rounds.filter((r) => r.player_id === 'p3'), f, START);
    // The practice round (all 9s) is out of the window and of the figure.
    expect(p3.legs.tee).toBeCloseTo((0.4 + 0.2 + 0.6) / 3, 9);
    const p1 = playerFiguresOver(rounds.filter((r) => r.player_id === 'p1'), f, START);
    expect(p1.legs.tee).toBeCloseTo(-0.5, 9);
    expect(p1.rounds).toBe(10);
  });

  it('rides under a key no player id can be', async () => {
    const { TEAM_FIGURES_KEY } = await import('@/lib/coachhelm/v3/chat/read-tools');
    expect(ids).not.toContain(TEAM_FIGURES_KEY);
    expect(TEAM_FIGURES_KEY).toBe('__team__');
  });
});
