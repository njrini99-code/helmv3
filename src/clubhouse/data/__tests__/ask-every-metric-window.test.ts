import { describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-P-11: Ask's team ranking (and the team average and place a comparison sets beside a player) read
 * greens, putts, scoring and strokes gained over the asked window, but scrambling, sand saves, one- and three-putts, penalties and
 * score to par from the lifetime stats cache, practice and test rounds included. The answer then mixed "last 10" with "all time".
 * Every metric in the catalogue a round holds now comes from the window's rounds, as Stats counts them, and the cache is never read
 * for a figure a window has. The golden rounds G1 to G4 (stats-golden.fixtures.ts) are the check: G4, the test round, never counts.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { getTeamMetricRanking, TEAM_FIGURES_KEY, type PlayerFigures, type PlayerFiguresSource } from '@/lib/coachhelm/v3/chat/read-tools';
import { G1_EXPECTED, G1_ID, G2_EXPECTED, G2_ID, G2_HOLES, G3_ID, G4_ID, GOLDEN_PLAYER_ID, GOLDEN_SEASON_START, goldenRoundRows } from '../../__tests__/stats-golden.fixtures';
import { filterForFigureWindow, playerFiguresOver, teamFiguresOver } from '../player-figures';
import type { ChRound } from '../season';
import type { ChRoundCache } from '../stats-common';
import { filterFor, withHoles } from '../stats-filter';

const rounds = goldenRoundRows().filter((r) => r.is_test === false) as unknown as ChRound[];
const g2OnePutts = G2_HOLES.filter((h) => h.putts === 1).length;
const g2ThreePutts = G2_HOLES.filter((h) => h.putts >= 3).length;

/** Each hole round's stats row, from the audit's own counts. G4 has a row too: a reader that counted it would show it. */
const STATS = new Map<string, ChRoundCache>(
  [
    { round_id: G1_ID, total_putts: G1_EXPECTED.putts, one_putts: G1_EXPECTED.onePutts, three_putts: G1_EXPECTED.threePutts, greens_hit: G1_EXPECTED.gir.made, greens_total: G1_EXPECTED.gir.of, fairways_hit: G1_EXPECTED.fairways.made, fairways_total: G1_EXPECTED.fairways.of, scrambles_converted: G1_EXPECTED.scrambling.made, scramble_attempts: G1_EXPECTED.scrambling.of, sand_saves: G1_EXPECTED.sandSavesTour.made, sand_attempts: G1_EXPECTED.sandSavesTour.of, penalty_strokes: G1_EXPECTED.penaltyStrokes },
    { round_id: G2_ID, total_putts: G2_EXPECTED.putts, one_putts: g2OnePutts, three_putts: g2ThreePutts, greens_hit: G2_EXPECTED.gir.made, greens_total: G2_EXPECTED.gir.of, fairways_hit: G2_EXPECTED.fairways.made, fairways_total: G2_EXPECTED.fairways.of, scrambles_converted: G2_EXPECTED.scrambling.made, scramble_attempts: G2_EXPECTED.scrambling.of, sand_saves: 0, sand_attempts: 0, penalty_strokes: 0 },
    { round_id: G4_ID, total_putts: 10, one_putts: 18, three_putts: 0, greens_hit: 18, greens_total: 18, fairways_hit: 14, fairways_total: 14, scrambles_converted: 0, scramble_attempts: 0, sand_saves: 0, sand_attempts: 0, penalty_strokes: 0 },
  ].map((r) => [r.round_id, { birdies: null, eagles: null, double_bogeys: null, triple_plus: null, ...r } as ChRoundCache]),
);

/** What Ask reads for "this season": Stats' default filter, eighteen-hole rounds (G1 and G3). */
const season = playerFiguresOver(rounds, filterForFigureWindow('season'), GOLDEN_SEASON_START, STATS);
/** Every length, G2's nine at half a round, as Stats reads it with "All" holes. */
const anyLength = playerFiguresOver(rounds, withHoles(filterFor('season'), 'all'), GOLDEN_SEASON_START, STATS);

describe('Ask reads every catalogue metric over the window (DF-P-11)', () => {
  it('this season: G1 and G3, G4 never, and the rates pool G1’s chances (G3 has scores only)', () => {
    expect(season.round_ids).toEqual([G3_ID, G1_ID]);
    expect([season.scramble_chances, season.scrambling_pct]).toEqual([G1_EXPECTED.scrambling.of, G1_EXPECTED.scrambling.pct]);
    expect([season.sand_chances, season.sand_pct]).toEqual([G1_EXPECTED.sandSavesTour.of, 75]);
    expect(season.putt_holes).toBe(18);
    expect(season.one_putt_pct).toBeCloseTo((G1_EXPECTED.onePutts / 18) * 100, 9);
    expect(season.three_putt_pct).toBeCloseTo((G1_EXPECTED.threePutts / 18) * 100, 9);
    expect([season.penalties_per_round, season.penalty_rounds]).toEqual([G1_EXPECTED.penaltyStrokes, 1]);
    // G1 +5 and G3 +4: score to par reads every round, the hole figures only the rounds with holes.
    expect(season.to_par).toBeCloseTo(4.5, 9);
  });

  it('every length: the rates pool G1 and G2, penalties are per 18 over 1.5 rounds, a nine weighs half', () => {
    expect(anyLength.round_ids).not.toContain(G4_ID);
    expect(anyLength.scramble_chances).toBe(G1_EXPECTED.scrambling.of + G2_EXPECTED.scrambling.of);
    expect(anyLength.scrambling_pct).toBeCloseTo(((G1_EXPECTED.scrambling.made + G2_EXPECTED.scrambling.made) / 13) * 100, 9);
    // 27 holes whose putts were recorded: G1's 18 and G2's 9.
    expect(anyLength.putt_holes).toBe(27);
    expect(anyLength.one_putt_pct).toBeCloseTo(((G1_EXPECTED.onePutts + g2OnePutts) / 27) * 100, 9);
    expect(anyLength.three_putt_pct).toBeCloseTo(((G1_EXPECTED.threePutts + g2ThreePutts) / 27) * 100, 9);
    expect(anyLength.penalty_rounds).toBe(1.5);
    expect(anyLength.penalties_per_round).toBeCloseTo(G1_EXPECTED.penaltyStrokes / 1.5, 9);
    // G1 +5, G2's +2 is +4 per 18 at half weight, G3 +4: 11 over 2.5 rounds.
    expect(anyLength.to_par).toBeCloseTo((5 + 0.5 * 4 + 4) / 2.5, 9);
  });

  // The stats cache's lifetime figures, test and practice rounds in them: none of these numbers may reach an answer.
  const CACHE = [{ player_id: GOLDEN_PLAYER_ID, scrambling_percentage: 99, scramble_attempts: 400, sand_save_percentage: 99, sand_attempts: 80, three_putt_percentage: 1, one_putt_percentage: 99, penalty_strokes_per_round: 0.1, scoring_average_vs_par: -9, rounds_played: 60, updated_at: '2026-09-29T00:00:00Z' }];
  function sbWith(rows: unknown) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return { from: () => chain } as never;
  }
  const ctx = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Golden', timezone: 'America/New_York', roster: [{ id: GOLDEN_PLAYER_ID, name: 'Gold Player', first_name: 'Gold', last_name: 'Player', graduation_year: null }] } as CoachChatContext;
  const source: PlayerFiguresSource = async (ids) => {
    const out = new Map<string, PlayerFigures>(ids.map((id) => [id, season]));
    out.set(TEAM_FIGURES_KEY, teamFiguresOver(rounds, ids, filterForFigureWindow('season'), GOLDEN_SEASON_START, STATS));
    return out;
  };

  const cases: Array<[string, number | null]> = [
    ['scrambling_pct', season.scrambling_pct],
    ['sand_save_pct', season.sand_pct],
    ['one_putt_pct', season.one_putt_pct],
    ['three_putt_pct', season.three_putt_pct],
    ['penalties_per_round', season.penalties_per_round],
    ['scoring_average_vs_par', season.to_par],
  ];
  it.each(cases)('a ranking on %s reads the window, never the lifetime cache', async (metric, expected) => {
    const env = await getTeamMetricRanking(sbWith(CACHE), ctx, { metric_id: metric, window: 'season' }, source);
    const detail = env.detail as { window: string; team_figure: { method: string; window: string; value: number | null } };
    expect(detail.window).toBe('season');
    expect(detail.team_figure).toMatchObject({ method: 'pooled', window: 'season' });
    expect(env.measurements).toHaveLength(1);
    const m = env.measurements[0]!;
    expect(m.source).toBe('rounds');
    expect(m.value).toBeCloseTo(expected!, 2);
    expect(m.window_end).toBe('2026-10-10');
    expect(env.summary).toMatch(/this season/);
  });
});
