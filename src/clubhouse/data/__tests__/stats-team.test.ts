import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Stats and charts audit, 15 Nov 2026. CH-01: the team trend said "Against par" but plotted and judged raw strokes, so a run of
 * easier courses read as the team improving. CH-10: the halves verdict set everyone who played in the newer half against everyone
 * in the older one, and with three weeks it was the last week against the first. The loader now gives the score lens per 18 against
 * par (`toPar`, `toParMean`) beside the raw strokes, judges every score halves on it, pairs the team by player and needs two points
 * a half.
 */

const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { filterFor, withHoles } from '../stats-filter';
import { loadTeamStats } from '../stats-team';

type Play = { player: string; date: string; score: number; par: number; holes?: 9 | 18 };

let seq = 0;
function teamOf(plays: Play[]) {
  const players = [...new Set(plays.map((p) => p.player))];
  const rounds = plays.map((p) => ({
    id: `r${++seq}`,
    player_id: p.player,
    round_date: p.date,
    total_score: p.score,
    score_to_par: p.score - p.par,
    // Every hole scored (the countable rule reads the nines): a nine has its front only.
    front_nine: p.holes === 9 ? p.score : Math.ceil(p.score / 2),
    back_nine: p.holes === 9 ? null : Math.floor(p.score / 2),
    holes_played: p.holes ?? 18,
    status: 'completed',
    round_type: 'tournament',
  }));
  tables.current = {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: players.map((id) => ({ player: { id, first_name: id, last_name: 'Test' } })) },
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [] },
    golf_shots: { data: [] },
  };
}
const load = (holes: '18' | 'all' = '18') => loadTeamStats({ teamId: 't1', window: 'season', filter: withHoles(filterFor('season'), holes) });
// Four Mondays in one season, a week apart.
const WEEKS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('the team trend is judged against par (CH-01)', () => {
  it('two over par on every course plots +2 every week, though the strokes run 72, 74, 73', async () => {
    // Nick's case: 72 on a par 70, 74 on a par 72, 73 on a par 71. Raw strokes read as a team getting worse.
    teamOf([
      { player: 'ann', date: WEEKS[0]!, score: 72, par: 70 },
      { player: 'ann', date: WEEKS[1]!, score: 74, par: 72 },
      { player: 'ann', date: WEEKS[2]!, score: 73, par: 71 },
    ]);
    const s = await load();
    expect(s.team.toPar).toEqual([2, 2, 2]);
    expect(s.team.toParMean).toBe(2);
    // The raw strokes stay beside it, for the tooltip and the scoring average.
    expect(s.team.score).toEqual([72, 74, 73]);
    expect(s.players[0]!.toPar).toEqual([2, 2, 2]);
    expect(s.players[0]!.toParMean).toBe(2);
    expect(s.days.map((d) => d.toPar)).toEqual([2, 2, 2]);
    expect(s.days.map((d) => d.score)).toEqual([72, 74, 73]);
  });

  it('the halves read no change for a team that stays two over while the courses get longer', async () => {
    const pars = [70, 71, 72, 72];
    teamOf(['ann', 'ben', 'cal'].flatMap((player, k) => WEEKS.map((date, i) => ({ player, date, score: pars[i]! + 2 + k, par: pars[i]! }))));
    const s = await load();
    expect(s.team.toPar).toEqual([3, 3, 3, 3]);
    // On strokes this team was "worse by 1.5 a round"; against par it has not moved.
    expect(s.team.scoreHalves!.delta).toBeCloseTo(0);
    expect(s.daysHalves!.delta).toBeCloseTo(0);
    for (const p of s.players) expect(p.scoreHalves!.delta).toBeCloseTo(0);
  });

  it('with both lengths counted, a nine counts half and is doubled to 18 holes', async () => {
    teamOf([
      { player: 'ann', date: WEEKS[0]!, score: 74, par: 72 },
      { player: 'ann', date: WEEKS[0]!, score: 38, par: 36, holes: 9 },
    ]);
    const s = await load('all');
    // (+2 + +2) over 1.5 whole rounds: +2.67 a round, not the plain mean of +2 and +2.
    expect(s.team.toPar![0]).toBeCloseTo(4 / 1.5);
  });
});

describe('the team halves pair players and need two points a half (CH-10)', () => {
  it('a weaker player who only plays the last two weeks does not make the team "worse"', async () => {
    teamOf([
      ...['ann', 'ben', 'cal'].flatMap((player) => WEEKS.map((date) => ({ player, date, score: 72, par: 72 }))),
      { player: 'dee', date: WEEKS[2]!, score: 78, par: 72 },
      { player: 'dee', date: WEEKS[3]!, score: 78, par: 72 },
    ]);
    const s = await load();
    expect(s.team.scoreHalves!.delta).toBeCloseTo(0);
  });

  it('three weeks give no verdict: the middle week would be in neither half', async () => {
    teamOf(['ann', 'ben', 'cal'].flatMap((player) => WEEKS.slice(0, 3).map((date, i) => ({ player, date, score: 72 + i, par: 72 }))));
    const s = await load();
    expect(s.team.toPar).toEqual([0, 1, 2]);
    expect(s.team.scoreHalves).toBeNull();
    expect(s.daysHalves).toBeNull();
  });
});
