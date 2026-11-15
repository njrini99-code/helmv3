import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateCountableRounds, type CountableRoundRow } from '@/lib/golf/countable-round-stats';

/**
 * Home on "This season | All time" (data/span.ts, `?range=all`): the coach's team figures and the player's scoring, read through the
 * real loaders on the table fake. The season is the default and is unchanged; All time reads every round and is Fairway's:
 * practice in, no date cut, no leaderboard floor, no round posted as a total only. Fairway's own `aggregateCountableRounds` is the
 * reference for each average.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadCoachHome } from '../data/home';
import { loadPlayerHome } from '../data/player-home';

type Row = Record<string, unknown>;
let n = 0;
/** A round with its nines (so it counts on Fairway's rule): `total` splits into a front and a back. */
const round = (player: string, date: string, total: number, type: string | null, over: Row = {}): Row => ({
  id: `r${++n}`, player_id: player, round_date: date, total_score: total, score_to_par: total - 72, front_nine: Math.floor(total / 2), back_nine: total - Math.floor(total / 2),
  holes_played: 18, status: 'completed', is_test: false, round_type: type, course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10, total_gir_possible: 18, strokes_gained_total: 0.5, ...over,
});

const ada: Row[] = [
  ...[74, 76, 75, 77, 73, 78].map((s, i) => round('p1', `2026-10-${String(14 - i).padStart(2, '0')}`, s, 'tournament')),
  ...[80, 81, 79].map((s, i) => round('p1', `2026-09-${String(20 - i).padStart(2, '0')}`, s, 'practice')),
  round('p1', '2025-03-10', 82, 'tournament'),
  round('p1', '2025-03-02', 79, 'qualifier'),
  // Posted as a total only: Clubhouse's season counts it (Q-123); Fairway's isCountableRound reads none.
  round('p1', '2026-10-05', 71, 'qualifier', { front_nine: null, back_nine: null }),
];
// A practice-only player with two rounds: out of the season altogether, and under any floor on All time.
const bo: Row[] = [round('p2', '2026-10-09', 70, 'practice'), round('p2', '2026-10-08', 70, 'practice')];
const all = [...ada, ...bo];

const asked: Array<Array<[string, unknown[]]>> = [];
function base(): import('./supabase-fake').ChFakeTables {
  return {
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027 } }, { player: { id: 'p2', first_name: 'Bo', last_name: 'Fox', graduation_year: 2028 } }] },
    golf_conversations: { data: [{ id: 'chat' }] },
    golf_events: { data: [] },
    golf_event_attendance: { data: [] },
    // The database applies the loader's date bound; the fake does it here, so what comes back is what Postgres would send.
    golf_rounds: (f) => {
      asked.push(f);
      const gte = f.find(([k, a]) => k === 'gte' && a[0] === 'round_date')?.[1][1] as string | undefined;
      const ids = f.find(([k, a]) => k === 'in' && a[0] === 'player_id')?.[1][1] as string[] | undefined;
      return { data: all.filter((r) => (!gte || (r.round_date as string) >= gte) && (!ids || ids.includes(r.player_id as string))) };
    },
    golf_holes: { data: [] },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_players: { data: { handicap_index: 3.1, handicap: null } },
    golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
    golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
  };
}

const newestFirst = (rows: Row[]) => [...rows].sort((a, b) => ((a.round_date as string) < (b.round_date as string) ? 1 : -1)) as unknown as CountableRoundRow[];
const fairwayAverage = (rows: Row[]) => aggregateCountableRounds(newestFirst(rows)).scoringAverage;
const hadDateBound = () => asked.some((f) => f.some(([k, a]) => k === 'gte' && a[0] === 'round_date'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T16:00:00Z'));
  tables.current = base();
  asked.length = 0;
});
afterEach(() => {
  tables.current = {};
  vi.useRealTimers();
});

describe('Coach Home on the span', () => {
  it('no span is the season as before: this season’s non-practice rounds, a total-only round in, the short sample out of the leaderboard', async () => {
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield' });
    expect(home.span).toBeUndefined();
    expect(home.leaderboard.span).toBeUndefined();
    expect(home.phone.form?.span).toBeUndefined();
    expect(home.leaderboard.rows.map((r) => r.name)).toEqual(['Ada Lin']);
    // Six tournaments and the total-only qualifier; no practice, none of last season’s.
    expect(home.leaderboard.rows[0]!.rounds).toBe(7);
    expect(home.leaderboard.scorecards).toBe(7);
    expect(hadDateBound()).toBe(true);
  });

  it('All time reads every round, with no date bound, and is Fairway’s: practice in, last season in, no total-only round', async () => {
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield', span: 'all' });
    expect(home.span).toBe('all');
    expect(home.leaderboard.span).toBe('all');
    expect(hadDateBound()).toBe(false);
    const ada18 = home.leaderboard.rows.find((r) => r.name === 'Ada Lin')!;
    expect(ada18.rounds).toBe(11);
    expect(ada18.avg).toBeCloseTo(fairwayAverage(ada)!, 9);
    const bo18 = home.leaderboard.rows.find((r) => r.name === 'Bo Fox')!;
    expect(bo18.rounds).toBe(2);
    expect(bo18.avg).toBeCloseTo(fairwayAverage(bo)!, 9);
    expect(home.leaderboard.scorecards).toBe(13);
  });

  it('All time has no floor: the two-round player ranks on the average, ahead of the better-sampled one', async () => {
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield', span: 'all' });
    expect(home.leaderboard.rows.map((r) => r.name)).toEqual(['Bo Fox', 'Ada Lin']);
  });

  it('the team’s scoring is the mean of every such round on All time, with no previous window, and each player’s last ten otherwise', async () => {
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield', span: 'all' });
    const form = home.phone.form!;
    expect(form.span).toBe('all');
    expect(form.avg).toBeCloseTo(fairwayAverage([...ada, ...bo])!, 9);
    expect(form.delta).toBeNull();
    expect(form.basis.rounds).toBe(13);
    // The default is Stats’ Last 10: each player’s newest ten, practice out.
    const season = (await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield' })).phone.form!;
    expect(season.basis.rounds).toBe(7);
    expect(season.avg).not.toBeCloseTo(form.avg, 3);
  });

  it('the four parts keep their own window (each player’s last ten, practice out) on both spans', async () => {
    const season = await loadCoachHome({ teamId: 't1', coachName: 'D' });
    const allTime = await loadCoachHome({ teamId: 't1', coachName: 'D', span: 'all' });
    expect(allTime.legs).toEqual(season.legs);
  });
});

describe('Player Home on the span', () => {
  it('no span is the newest rounds as before', async () => {
    const home = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' });
    expect(home.span).toBeUndefined();
    expect(home.scoringAll).toBeUndefined();
    expect(home.scoringLast10?.n).toBe(7);
    expect(hadDateBound()).toBe(true);
  });

  it('All time is the scoring average over every 18-hole round the player has posted, as Fairway’s scoring average is', async () => {
    const home = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada', span: 'all' });
    expect(home.span).toBe('all');
    expect(hadDateBound()).toBe(false);
    expect(home.scoringAll?.n).toBe(11);
    expect(home.scoringAll?.avg).toBeCloseTo(fairwayAverage(ada)!, 9);
    // The chart reads the same rounds, practice and last season’s included; the newest ten stay what strokes gained reads.
    expect(home.scoring.points).toHaveLength(11);
    expect(home.scoringLast10?.n).toBe(7);
  });
});
