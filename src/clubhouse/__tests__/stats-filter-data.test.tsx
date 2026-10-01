import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The round filter on the server: what the loaders read and count under it (team and profile), and how the route turns the
 * address into it. The pure rules are in stats-filter.test.ts; the screens are in stats-filter-ui.test.tsx.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));
const detailed = vi.hoisted(() => vi.fn());
const spray = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: spray }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { seasonStartDate } from '../data/season';
import { loadPlayerProfile } from '../data/stats-player';
import { loadTeamStats } from '../data/stats-team';
import { filterFor, PICK_LIST_MAX, withPick, withRange, withTypes, type ChFilter } from '../data/stats-filter';
import { resolveClubhouseTeam } from '../routes/team';
import { ClubhouseStatsRoute } from '../routes/stats';
import { PREVIEW_PLAYER } from '../preview/fixtures-stats';

type Filters = Array<[string, unknown[]]>;
type Row = Record<string, unknown> & { id: string; player_id: string; round_date: string };

/** Dates are counted from this season's first day, so the tests hold whatever day they run. */
const START = seasonStartDate();
const add = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** n days into the season (a larger n is newer). */
const inSeason = (n: number) => add(START, 1 + n);
/** n days before the season began. */
const before = (n: number) => add(START, -n);

// The nines follow the total unless a test sets them: the season read takes the total from the nines (C-15).
const nines = (over: Record<string, unknown>) =>
  typeof over.total_score === 'number' && !('front_nine' in over) && !('back_nine' in over)
    ? { front_nine: Math.floor(over.total_score / 2), back_nine: over.total_score - Math.floor(over.total_score / 2) }
    : {};
/** An 18-hole row's total with nines that add up to it. */
const rescore = (total: number) => ({ total_score: total, ...nines({ total_score: total }) });
const rr = (id: string, player: string, date: string, over: Record<string, unknown> = {}): Row => ({
  ...rrBase(id, player, date, over),
  ...nines(over),
});
const rrBase = (id: string, player: string, date: string, over: Record<string, unknown>): Row => ({
  id,
  player_id: player,
  round_date: date,
  total_score: 72,
  score_to_par: 0,
  front_nine: 36,
  back_nine: 36,
  holes_played: 18,
  status: 'completed',
  round_type: 'practice',
  course_name: 'Finley GC',
  total_putts: 30,
  total_gir: 9,
  total_gir_possible: 18,
  total_fairways_hit: 8,
  total_fairways: 14,
  ...over,
});

/** What the loaders asked for: where the rounds read started, and which rounds' figures were read. */
const reads = { since: [] as Array<string | null>, cacheIds: [] as string[] };
const roundsAnswer = (rows: Row[]) => (f: Filters) => {
  const gte = f.find(([k]) => k === 'gte');
  const since = gte ? String(gte[1][1]) : null;
  reads.since.push(since);
  const ids = f.find(([k]) => k === 'in')?.[1][1] as string[] | undefined;
  return { data: rows.filter((r) => (!since || r.round_date >= since) && (!ids || ids.includes(r.player_id))) };
};
const cacheAnswer = (f: Filters) => {
  const ids = (f.find(([k]) => k === 'in')?.[1][1] ?? []) as string[];
  reads.cacheIds.push(...ids);
  return { data: ids.map((id) => ({ round_id: id, greens_hit: 10, greens_total: 18, total_putts: 30, scramble_attempts: 5, scrambles_converted: 3, birdies: 2, eagles: 0 })) };
};

const teamTables = (rows: Row[]): import('./supabase-fake').ChFakeTables => ({
  golf_teams: { data: { name: 'Varsity', gender: 'men' } },
  golf_team_members: {
    data: [
      { player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } },
      { player: { id: 'p2', first_name: 'Sofia', last_name: 'Alvarez' } },
    ],
  },
  golf_rounds: roundsAnswer(rows),
  golf_round_stats_cache: cacheAnswer,
  golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
  golf_shots: { data: [] },
});

const OWN = 'p1';
const isMembership = (f: Filters) => f.some(([k]) => k === 'in');
const profileTables = (rows: Row[]): import('./supabase-fake').ChFakeTables => ({
  golf_teams: { data: { gender: 'men' } },
  golf_players: { data: { id: OWN, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2029, hometown: 'Charlotte', state: 'NC', handicap: 3.9, handicap_index: null } },
  golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: OWN }, { player_id: 'p2' }] }),
  golf_rounds: roundsAnswer(rows),
  golf_round_stats_cache: cacheAnswer,
  golf_pga_standards: { data: [] },
  golf_player_focus_areas: { data: [] },
  golf_goals: { data: [] },
  golf_holes: { data: [] },
  golf_shots: { data: [] },
});

const teamLoad = (filter: ChFilter) => loadTeamStats({ teamId: 't1', window: filter.window, filter });
const profileLoad = (filter: ChFilter, viewer: 'coach' | 'player' = 'coach') => loadPlayerProfile({ viewer, teamId: 't1', playerId: OWN, window: filter.window, filter });
const scoringAvg = (d: Awaited<ReturnType<typeof loadTeamStats>>) => d.figures.find((f) => f.label === 'Scoring average')!;

/** Theo: ten tournaments at 70, ten earlier at 74, and ten NEWER practice rounds at 90 (so a cut made before the type would be all practice). */
function mixed(player = 'p1'): Row[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => rr(`${player}t${i}`, player, inSeason(30 - i), { round_type: 'tournament', total_score: 70 })),
    ...Array.from({ length: 10 }, (_, i) => rr(`${player}o${i}`, player, inSeason(20 - i), { round_type: 'tournament', total_score: 74 })),
    ...Array.from({ length: 10 }, (_, i) => rr(`${player}x${i}`, player, inSeason(44 - i), { round_type: 'practice', total_score: 90 })),
  ];
}

beforeEach(() => {
  logServer.mockClear();
  detailed.mockReset();
  spray.mockReset();
  reads.since = [];
  reads.cacheIds = [];
  tables.current = {};
  detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 10 });
  spray.mockResolvedValue({ driving: null, approach: null, scope: { roundId: 'x', roundsIncluded: 0, filterApplied: false } });
});

describe('Team stats under a filter', () => {
  it('"Last 10" is the ten newest MATCHING rounds, and "vs. previous 10" is the ten matching rounds before them', async () => {
    tables.current = teamTables(mixed());
    const all = await teamLoad(filterFor('last10'));
    // Unfiltered, the ten newest are the practice rounds.
    expect(scoringAvg(all).value).toBe(90);
    const d = await teamLoad(withTypes(filterFor('last10'), ['tournament']));
    expect(d.roundCount).toBe(10);
    expect(scoringAvg(d).value).toBe(70);
    // 70 now against 74 before, both tournaments; the practice rounds take no part.
    expect(scoringAvg(d).delta).toBe(-4);
    expect(scoringAvg(d).context).toBe('vs. previous 10');
    expect(d.grid.find((g) => g.id === 'p1')!.rounds).toBe(10);
    // The player grid reads the same rounds: their tournament scoring, not the practice rounds' 90.
    expect(d.grid.find((g) => g.id === 'p1')!.avg).toBe(70);
    expect(all.grid.find((g) => g.id === 'p1')!.avg).toBe(90);
    expect(d.filter.types).toEqual(['tournament']);
  });

  it('"no earlier rounds" counts the matching rounds: eight tournaments have none before them, though twelve rounds do', async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => rr(`t${i}`, 'p1', inSeason(20 + i), { round_type: 'tournament', strokes_gained_total: 0.5 })),
      ...Array.from({ length: 4 }, (_, i) => rr(`x${i}`, 'p1', inSeason(i), { round_type: 'practice', strokes_gained_total: 0.5 })),
    ];
    tables.current = teamTables(rows);
    const sg = (d: Awaited<ReturnType<typeof loadTeamStats>>) => d.figures.find((f) => f.label === 'Team SG per round')!;
    expect(sg(await teamLoad(withTypes(filterFor('last10'), ['tournament']))).context).toBe('No earlier rounds');
    // Unfiltered, ten of the twelve are the window and two are before it: a thin earlier stretch.
    expect(sg(await teamLoad(filterFor('last10'))).context).toBe('Too few earlier rounds with shots');
  });

  it('the cut is per player, not across the team', async () => {
    tables.current = teamTables([...mixed('p1'), ...mixed('p2')]);
    const d = await teamLoad(withTypes(filterFor('last10'), ['tournament']));
    expect(d.roundCount).toBe(20);
    expect(d.grid.map((g) => g.rounds)).toEqual([10, 10]);
  });

  it('a range before the season reads those rounds, their figures and their putts, while the season bests and the season stay the season', async () => {
    const rows = [
      ...[0, 1, 2].map((i) => rr(`s${i}`, 'p1', inSeason(i), { total_score: 72 + i })),
      ...[10, 20, 30].map((n, i) => rr(`e${i}`, 'p1', before(n), { round_type: 'tournament', total_score: 65 + i, score_to_par: -7 })),
    ];
    tables.current = teamTables(rows);
    // No range: the season only, read from its first day.
    const season = await teamLoad(filterFor('season'));
    expect(reads.since.at(-1)).toBe(START);
    expect(season.roundCount).toBe(3);

    reads.since = [];
    reads.cacheIds = [];
    const ranged = await teamLoad(withRange(filterFor('season'), before(40), inSeason(5)));
    expect(reads.since.at(-1)).toBe(before(40));
    expect(ranged.roundCount).toBe(6);
    // The earlier rounds' own figures were read (a window round with no cache row would silently lose its greens and putts).
    expect(reads.cacheIds).toEqual(expect.arrayContaining(['e0', 'e1', 'e2']));
    expect(ranged.filterOptions.total).toBe(6);
    // The season's bests do not reach into last year: the low round is this season's 72, not a 65 from before it.
    expect(ranged.bests.find((b) => b.label === 'Low round')!.value).toMatch(/^72/);
  });

  it('a range with no start reads everything up to its end; one that starts inside the season changes nothing about where the read starts', async () => {
    const rows = [rr('s0', 'p1', inSeason(5)), rr('e0', 'p1', before(20), { round_type: 'tournament' })];
    tables.current = teamTables(rows);
    const open = await teamLoad(withRange(filterFor('last10'), null, inSeason(1)));
    expect(reads.since.at(-1)).toBeNull();
    expect(open.roundCount).toBe(1);
    const inside = await teamLoad(withRange(filterFor('last10'), inSeason(3), null));
    expect(reads.since.at(-1)).toBe(START);
    expect(inside.roundCount).toBe(1);
    const none = await teamLoad(withRange(filterFor('last10'), inSeason(40), null));
    expect(none.roundCount).toBe(0);
  });

  it('"Only these" counts exactly the picked rounds it has loaded; a round it never loaded is not there to pick; "Exclude" takes them out before the cut', async () => {
    tables.current = teamTables(mixed());
    const only = await teamLoad(withPick(filterFor('last10'), { mode: 'only', ids: ['p1t0', 'p1x0', 'p1o3', 'somebody-elses-round'] }));
    // Three rounds, though the newest ten would be a different set: the picks are not cut to a window.
    expect(only.roundCount).toBe(3);
    const none = await teamLoad(withPick(filterFor('last10'), { mode: 'only', ids: ['not-loaded'] }));
    expect(none.roundCount).toBe(0);
    const skip = await teamLoad(withPick(filterFor('last10'), { mode: 'skip', ids: ['p1x0'] }));
    expect(skip.roundCount).toBe(10);
    // The newest practice round is gone, so the ten are nine practice rounds and the newest tournament.
    expect(scoringAvg(skip).value).toBe((90 * 9 + 70) / 10);
    // The sheet still lists every round, whatever the filter.
    expect(skip.filterOptions.total).toBe(30);
  });

  it('lists the loaded rounds for the sheet, newest first with the player named, cut at the list size, and the courses by how many rounds each', async () => {
    const rows = Array.from({ length: PICK_LIST_MAX + 10 }, (_, i) => rr(`r${i}`, 'p1', add(START, -400 + i), { course_name: i % 4 === 0 ? 'Pine Hollow' : 'Finley GC' }));
    tables.current = teamTables(rows);
    const d = await teamLoad(withRange(filterFor('season'), add(START, -500), null));
    expect(d.filterOptions.rounds).toHaveLength(PICK_LIST_MAX);
    expect(d.filterOptions.total).toBe(PICK_LIST_MAX + 10);
    expect(d.filterOptions.rounds[0]).toMatchObject({ id: `r${PICK_LIST_MAX + 9}`, player: 'Theo Marchetti', course: expect.any(String), score: 72 });
    expect(d.filterOptions.courses.map((c) => c.name)).toEqual(['Finley GC', 'Pine Hollow']);
    expect(d.filterOptions.courses[0]!.count).toBeGreaterThan(d.filterOptions.courses[1]!.count);
    expect(d.filterOptions.seasonStart).toBe(START);
  });

  it('orders the courses by how many rounds each, then by name', async () => {
    const at = (course: string, n: number) => Array.from({ length: n }, (_, i) => rr(`${course}${i}`, 'p1', inSeason(i + n), { course_name: course }));
    tables.current = teamTables([...at('Zed Club', 3), ...at('Alpha Club', 1), ...at('Mid Club', 1), ...at('Big Club', 1)]);
    const d = await teamLoad(filterFor('season'));
    expect(d.filterOptions.courses).toEqual([
      { name: 'Zed Club', count: 3 },
      { name: 'Alpha Club', count: 1 },
      { name: 'Big Club', count: 1 },
      { name: 'Mid Club', count: 1 },
    ]);
  });

  it('a course filter counts only that course, by its exact name', async () => {
    tables.current = teamTables([rr('a', 'p1', inSeason(3), { course_name: 'Pine Hollow' }), rr('b', 'p1', inSeason(4), { course_name: 'Finley GC' }), rr('c', 'p1', inSeason(5), { course_name: null })]);
    expect((await teamLoad({ ...filterFor('season'), courses: ['Pine Hollow'] })).roundCount).toBe(1);
    expect((await teamLoad({ ...filterFor('season'), courses: ['pine hollow'] })).roundCount).toBe(0);
  });
});

describe('the profile under a filter', () => {
  it('reads the shot-level figures from exactly the filtered rounds', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => rr(`r${i}`, OWN, inSeason(i), { round_type: i % 2 ? 'tournament' : 'practice' }));
    tables.current = profileTables(rows);
    const p = (await profileLoad(withTypes(filterFor('last10'), ['tournament'])))!;
    expect(p.win.rounds).toBe(6);
    expect(p.rounds.map((r) => r.id)).toEqual(['r11', 'r9', 'r7', 'r5', 'r3', 'r1']);
    expect(detailed).toHaveBeenCalledWith(OWN, ['r11', 'r9', 'r7', 'r5', 'r3', 'r1']);
    expect(p.filter.types).toEqual(['tournament']);
    expect(p.window).toBe('last10');
  });

  it('the previous ten comes from the same filtered list', async () => {
    tables.current = profileTables(mixed(OWN));
    const p = (await profileLoad(withTypes(filterFor('last10'), ['tournament'])))!;
    expect(p.extra.compare).toMatchObject({ lastRounds: 10, previousRounds: 10 });
    expect(p.extra.compare!.rows.find((r) => r.label === 'Scoring avg')).toMatchObject({ last: 70, previous: 74 });
  });

  it('a range before the season counts those rounds in the window and their figures, but "this season" stays the season', async () => {
    const rows = [...[0, 1, 2].map((i) => rr(`s${i}`, OWN, inSeason(i))), ...[10, 20, 30].map((n, i) => rr(`e${i}`, OWN, before(n), { round_type: 'tournament' }))];
    tables.current = profileTables(rows);
    const p = (await profileLoad(withRange(filterFor('season'), before(40), inSeason(5))))!;
    expect(reads.since.at(-1)).toBe(before(40));
    expect(p.win.rounds).toBe(6);
    expect(p.season.rounds).toBe(3);
    expect(detailed).toHaveBeenCalledWith(OWN, expect.arrayContaining(['e0', 'e1', 'e2']));
    expect(reads.cacheIds).toEqual(expect.arrayContaining(['e0', 'e1', 'e2']));
  });

  it('a player only ever has their own rounds: a teammate\'s round in the address is not theirs to pick', async () => {
    const rows = [rr('mine', OWN, inSeason(2)), rr('theirs', 'p2', inSeason(3))];
    tables.current = profileTables(rows);
    const p = (await profileLoad(withPick(filterFor('last10'), { mode: 'only', ids: ['theirs', 'mine'] }), 'player'))!;
    expect(p.win.rounds).toBe(1);
    expect(p.rounds.map((r) => r.id)).toEqual(['mine']);
    // The sheet lists none of the teammate's rounds, and no team figure is loaded for a player.
    expect(p.filterOptions.rounds.map((r) => r.id)).toEqual(['mine']);
    expect(p.teamAvg).toBeNull();
    const solo = (await profileLoad(withPick(filterFor('last10'), { mode: 'only', ids: ['theirs'] }), 'player'))!;
    expect(solo.win.rounds).toBe(0);
  });

  it('a coach sees the team figure under the same filter, from the teammates\' matching rounds', async () => {
    tables.current = profileTables([...mixed(OWN), ...mixed('p2').map((r) => ({ ...r, ...rescore(r.round_type === 'tournament' ? 76 : 90) }))]);
    const p = (await profileLoad(withTypes(filterFor('last10'), ['tournament'])))!;
    // Jonah's ten tournaments at 70 and Sofia's ten at 76 (and nobody's practice rounds).
    expect(p.teamAvg).toBe(73);
    expect(p.filterOptions.rounds.every((r) => r.player === null)).toBe(true);
    // The sheet lists this player's own 30 rounds, not the teammates' 30 more.
    expect(p.filterOptions.total).toBe(30);
    expect(p.filterOptions.rounds.every((r) => r.id.startsWith('p1'))).toBe(true);
  });

  it('a filter that matches nothing leaves no rounds and claims no figures', async () => {
    tables.current = profileTables([rr('a', OWN, inSeason(1))]);
    const p = (await profileLoad(withTypes(filterFor('last10'), ['qualifier'])))!;
    expect(p.win.rounds).toBe(0);
    expect(p.rounds).toEqual([]);
    expect(detailed).not.toHaveBeenCalled();
    expect(p.win.avg).toBeNull();
  });
});

/**
 * Nine- and eighteen-hole rounds: every per-round figure is per 18 holes (a nine-hole round counts as half a round, so a 38 is a 76),
 * the rates pool holes and shots, and the floors count whole rounds. The rows below are built so the per-18 figures are round numbers
 * and any figure that forgot the weights or the lengths comes out different.
 */
describe('nine- and eighteen-hole rounds', () => {
  const longR = (id: string, player: string, date: string, over: Record<string, unknown> = {}) => rr(id, player, date, { strokes_gained_total: 1, ...over });
  /** Half a round: half the score, putts, greens, birdies and strokes gained of the long one above. */
  const shortR = (id: string, player: string, date: string, over: Record<string, unknown> = {}) =>
    rr(id, player, date, { holes_played: 9, total_score: 38, score_to_par: 2, front_nine: 38, back_nine: null, total_putts: 15, total_gir: 3, total_gir_possible: 9, strokes_gained_total: 0.5, ...over });
  const cacheFor = (rows: Row[]) => (f: Filters) => {
    const ids = (f.find(([k]) => k === 'in')?.[1][1] ?? []) as string[];
    reads.cacheIds.push(...ids);
    return {
      data: ids.map((id) => {
        const nine = rows.find((r) => r.id === id)?.holes_played === 9;
        return { round_id: id, greens_hit: nine ? 3 : 12, greens_total: nine ? 9 : 18, total_putts: nine ? 15 : 30, scramble_attempts: nine ? 2 : 4, scrambles_converted: nine ? 1 : 2, birdies: nine ? 1 : 2, eagles: 0 };
      }),
    };
  };
  const teamOf = (rows: Row[]) => {
    tables.current = { ...teamTables(rows), golf_round_stats_cache: cacheFor(rows) };
  };
  const profileOf = (rows: Row[]) => {
    tables.current = { ...profileTables(rows), golf_round_stats_cache: cacheFor(rows) };
  };
  const fig = (d: Awaited<ReturnType<typeof loadTeamStats>>, label: string) => d.figures.find((x) => x.label === label)!;
  const holes = (h: ChFilter['holes'], window: ChFilter['window'] = 'season'): ChFilter => ({ ...filterFor(window), holes: h });
  /** Four 18-hole rounds (72) and three 9-hole rounds (38), the nine-hole ones newer. */
  const mixedLengths = (player = 'p1'): Row[] => [
    ...[0, 1, 2, 3].map((i) => longR(`${player}L${i}`, player, inSeason(10 + i))),
    ...[0, 1, 2].map((i) => shortR(`${player}S${i}`, player, inSeason(20 + i))),
  ];

  it('the team page reads 18 holes by default and leaves the nine-hole rounds out of every figure', async () => {
    teamOf(mixedLengths());
    const d = await teamLoad(holes('18'));
    expect(d.roundCount).toBe(4);
    expect(d.roundsEffective).toBe(4);
    expect(fig(d, 'Scoring average').value).toBe(72);
    expect(fig(d, 'Putts per round').value).toBe(30);
    expect(fig(d, 'Team SG per round').value).toBe(1);
    expect(fig(d, 'Greens in regulation').value).toBeCloseTo((12 / 18) * 100, 6);
    expect(d.filter.holes).toBe('18');
  });

  it('the team page on 9 holes: a 38 is a 76, putts and birdies per 18, strokes gained per 18, the greens pooled', async () => {
    teamOf(mixedLengths());
    const d = await teamLoad(holes('9'));
    expect(d.roundCount).toBe(3);
    expect(d.roundsEffective).toBe(1.5);
    expect(fig(d, 'Scoring average').value).toBe(76);
    expect(fig(d, 'Putts per round').value).toBe(30);
    expect(fig(d, 'Birdies per round').value).toBe(2);
    // A nine-hole round's half a stroke is a stroke an 18.
    expect(fig(d, 'Team SG per round').value).toBe(1);
    expect(fig(d, 'Greens in regulation').value).toBeCloseTo((3 / 9) * 100, 6);
    expect(fig(d, 'Scoring average').context).toBe('3 rounds');
  });

  it('the team page on Both: per-round figures are sums over whole rounds, the rates pool every hole', async () => {
    teamOf(mixedLengths());
    const d = await teamLoad(holes('all'));
    expect(d.roundCount).toBe(7);
    expect(d.roundsEffective).toBe(5.5);
    // (4 x 72 + 3 x 38) over 5.5 rounds; the plain mean of the seven scores would be 57.4.
    expect(fig(d, 'Scoring average').value).toBeCloseTo((4 * 72 + 3 * 38) / 5.5, 10);
    expect(fig(d, 'Putts per round').value).toBeCloseTo((4 * 30 + 3 * 15) / 5.5, 10);
    expect(fig(d, 'Birdies per round').value).toBeCloseTo((4 * 2 + 3) / 5.5, 10);
    expect(fig(d, 'Team SG per round').value).toBeCloseTo((4 * 1 + 3 * 0.5) / 5.5, 10);
    // Greens pool: 57 of 99, not the mean of the rounds' percentages.
    expect(fig(d, 'Greens in regulation').value).toBeCloseTo((57 / 99) * 100, 6);
    expect(fig(d, 'Scrambling').value).toBeCloseTo((11 / 22) * 100, 6);
    // The sheet lists the round's length, and the courses count both lengths.
    expect(d.filterOptions.rounds.find((r) => r.id === 'p1S0')!.holes).toBe(9);
    expect(d.filterOptions.rounds.find((r) => r.id === 'p1L0')!.holes).toBe(18);
    expect(d.filterOptions.total).toBe(7);
    expect(d.filterOptions.courses).toEqual([{ name: 'Finley GC', count: 7 }]);
  });

  it('the player grid per 18: strokes gained need three whole rounds, and the late-against-early change needs four', async () => {
    const nines = (n: number, sg: (i: number) => number) => Array.from({ length: n }, (_, i) => shortR(`n${i}`, 'p1', inSeason(i), { strokes_gained_total: sg(i) }));
    // Three nine-hole rounds are a round and a half: no strokes gained per round yet, a scoring average all the same.
    teamOf(nines(3, () => 0.5));
    const few = (await teamLoad(holes('9'))).grid[0]!;
    expect(few.rounds).toBe(3);
    expect(few.total).toBeNull();
    expect(few.avg).toBe(76);
    // Six make three whole rounds: 0.5 a nine is 1.0 a round; still under the four the change needs.
    teamOf(nines(6, () => 0.5));
    const six = (await teamLoad(holes('9'))).grid[0]!;
    expect(six.total).toBe(1);
    expect(six.change).toBeNull();
    // Eight make four: the newer four at 0.6 and the older four at 0.2 are 1.2 and 0.4 a round, so the change is 0.8, not the raw 0.4.
    teamOf(nines(8, (i) => (i < 4 ? 0.2 : 0.6)));
    const eight = (await teamLoad(holes('9'))).grid[0]!;
    expect(eight.change).toBeCloseTo(0.8, 10);
  });

  it('"vs. previous 10" needs three whole earlier rounds: four nine-hole rounds before the ten are two, six are three', async () => {
    const mk = (older: number) => [
      ...Array.from({ length: 10 }, (_, i) => shortR(`c${i}`, 'p1', inSeason(40 - i), { total_score: 36 })),
      ...Array.from({ length: older }, (_, i) => shortR(`o${i}`, 'p1', inSeason(20 - i), { total_score: 40 })),
    ];
    teamOf(mk(4));
    const two = fig(await teamLoad(holes('9', 'last10')), 'Scoring average');
    expect(two.value).toBe(72);
    expect(two.delta).toBeNull();
    expect(two.context).toBe('10 rounds');
    teamOf(mk(6));
    const three = fig(await teamLoad(holes('9', 'last10')), 'Scoring average');
    expect(three.delta).toBe(72 - 80);
    expect(three.context).toBe('vs. previous 10');
  });

  it('a round with no score is no round: not counted, not listed, on either page', async () => {
    const unscored = rr('p1none', 'p1', inSeason(30), { total_score: null, score_to_par: null });
    teamOf([...mixedLengths(), unscored]);
    const d = await teamLoad(holes('all'));
    expect(d.roundCount).toBe(7);
    expect(d.filterOptions.total).toBe(7);
    profileOf([...mixedLengths(OWN), unscored]);
    const p = (await profileLoad(holes('all')))!;
    expect(p.win.rounds).toBe(7);
    expect(p.rounds.map((r) => r.id)).not.toContain('p1none');
  });

  it('"vs. previous 10" strokes gained needs three whole earlier rounds WITH shots: six 9-hole rounds, four of them with shots, are two', async () => {
    const mk = (withShots: number) => [
      ...Array.from({ length: 10 }, (_, i) => shortR(`c${i}`, 'p1', inSeason(40 - i), { strokes_gained_total: 0.5 })),
      ...Array.from({ length: 6 }, (_, i) => shortR(`o${i}`, 'p1', inSeason(20 - i), { strokes_gained_total: i < withShots ? 0.2 : null })),
    ];
    teamOf(mk(4));
    const two = fig(await teamLoad(holes('9', 'last10')), 'Team SG per round');
    expect(two.value).toBe(1);
    expect(two.delta).toBeNull();
    teamOf(mk(6));
    const three = fig(await teamLoad(holes('9', 'last10')), 'Team SG per round');
    // 1.0 a round now, 0.4 before (both per 18).
    expect(three.delta).toBeCloseTo(0.6, 10);
  });

  it('a player\'s strokes gained on the trend list needs three whole rounds with shots: three 9-hole rounds are one and a half', async () => {
    const nines = (n: number) => Array.from({ length: n }, (_, i) => shortR(`n${i}`, 'p1', inSeason(i), { strokes_gained_total: 0.5 }));
    teamOf(nines(3));
    expect((await teamLoad(holes('9'))).players[0]!.sgMean).toBeNull();
    teamOf(nines(6));
    expect((await teamLoad(holes('9'))).players[0]!.sgMean).toBe(1);
  });

  it('the season bests are 18-hole rounds whatever the filter: a 9-hole score is never the low round', async () => {
    teamOf([...mixedLengths(), shortR('p1low', 'p1', inSeason(25), { total_score: 28 })]);
    for (const h of ['18', '9', 'all'] as const) {
      const d = await teamLoad(holes(h));
      expect(d.bests.find((b) => b.label === 'Low round')!.value).toMatch(/^72/);
    }
  });

  it('the profile on 18 holes leaves nine-hole rounds out, on 9 holes the long ones, and Both keeps both in the list', async () => {
    profileOf([...[74, 70, 74].map((s, i) => longR(`l${i}`, OWN, inSeason(10 + i), { total_score: s })), ...[38, 33].map((s, i) => shortR(`s${i}`, OWN, inSeason(20 + i), { total_score: s }))]);
    const long = (await profileLoad(holes('18')))!;
    expect(long.rounds.map((r) => [r.id, r.holes])).toEqual([['l2', 18], ['l1', 18], ['l0', 18]]);
    expect(long.win.rounds).toBe(3);
    expect(long.extra.bests9).toBeNull();
    expect(long.extra.nineRounds).toBe(0);
    const short = (await profileLoad(holes('9')))!;
    expect(short.rounds.map((r) => [r.id, r.holes])).toEqual([['s1', 9], ['s0', 9]]);
    // 38 and 33 over nine holes are 76 and 66 a round.
    expect(short.win.avg).toBe(71);
    const both = (await profileLoad(holes('all')))!;
    expect(both.rounds.map((r) => r.holes)).toEqual([9, 9, 18, 18, 18]);
    expect(detailed).toHaveBeenLastCalledWith(OWN, ['s1', 's0', 'l2', 'l1', 'l0']);
  });

  it('the profile per 18: the average, strokes gained and the whole-round counts the early reads use', async () => {
    profileOf([...[0, 1, 2].map((i) => longR(`l${i}`, OWN, inSeason(10 + i), { total_score: 74 })), ...[0, 1].map((i) => shortR(`s${i}`, OWN, inSeason(20 + i)))]);
    const both = (await profileLoad(holes('all')))!;
    // 3 x 74 + 2 x 38 over four whole rounds is 74.5; the rounds themselves number five.
    expect(both.win.avg).toBeCloseTo((3 * 74 + 2 * 38) / 4, 10);
    expect(both.win.rounds).toBe(5);
    expect(both.win.effRounds).toBe(4);
    expect(both.win.sgRounds).toBe(5);
    expect(both.win.effSgRounds).toBe(4);
    expect(both.win.sgPerRound).toBeCloseTo((3 * 1 + 2 * 0.5) / 4, 10);
    // Two nine-hole rounds are one round: too early, whatever the row count.
    const nines = (await profileLoad(holes('9')))!;
    expect(nines.win.rounds).toBe(2);
    expect(nines.win.effRounds).toBe(1);
    expect(nines.win.effSgRounds).toBe(1);
    expect(nines.win.sgPerRound).toBeNull();
    expect(nines.win.avg).toBe(76);
    expect(nines.win.trend).toEqual([76, 76]);
  });

  it('bests list 18-hole and 9-hole rounds apart: a 33 over nine holes is not a best score', async () => {
    profileOf([...[74, 70, 74].map((s, i) => longR(`l${i}`, OWN, inSeason(10 + i), { total_score: s, score_to_par: s - 72, total_putts: 28 + i, total_gir: i === 0 ? 17 : 9 })), ...[38, 33].map((s, i) => shortR(`s${i}`, OWN, inSeason(20 + i), { total_score: s, score_to_par: s - 36, total_putts: 12 + i }))]);
    const both = (await profileLoad(holes('all')))!;
    expect(both.extra.bests.score!.value).toBe(70);
    expect(both.extra.bests.putts!.value).toBe(28);
    expect(both.extra.bests9!.score!.value).toBe(33);
    expect(both.extra.bests9!.toPar!.value).toBe(-3);
    expect(both.extra.bests9!.putts!.value).toBe(12);
    // The long round's 17 of 18 greens is the 18-hole best, never the 9-hole one (which is 3 of 9).
    expect(both.extra.bests.gir!.value).toBeCloseTo((17 / 18) * 100, 1);
    expect(both.extra.bests9!.gir!.value).toBeCloseTo((3 / 9) * 100, 1);
    expect(both.extra.nineRounds).toBe(2);
    const nines = (await profileLoad(holes('9')))!;
    expect(nines.extra.bests.score).toBeNull();
    expect(nines.extra.bests9!.score!.value).toBe(33);
    const long = (await profileLoad(holes('18')))!;
    expect(long.extra.bests.score!.value).toBe(70);
    expect(long.extra.bests9).toBeNull();
  });

  it('the calculator\'s per-round counts are restated per 18 when a nine-hole round is in the window, and left alone when none is', async () => {
    profileOf([...[0, 1, 2].map((i) => longR(`l${i}`, OWN, inSeason(10 + i))), ...[0, 1].map((i) => shortR(`s${i}`, OWN, inSeason(20 + i)))]);
    // 63 holes: 7 birdies are 2 an 18; the calculator's own birdiesPerRound (dividing by the rounds) says 1.4.
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 5, holesPlayed: 63, totalEagles: 0, totalBirdies: 7, totalPars: 35, totalBogeys: 14, totalDoublePlus: 7, eaglesPerRound: 0, birdiesPerRound: 1.4, parsPerRound: 7, bogeysPerRound: 2.8, doublePlusPerRound: 1.4 });
    const both = (await profileLoad(holes('all')))!;
    expect(both.stats!.birdiesPerRound).toBe(2);
    expect(both.stats!.parsPerRound).toBe(10);
    expect(both.stats!.bogeysPerRound).toBe(4);
    expect(both.stats!.doublePlusPerRound).toBe(2);
    expect(both.stats!.scoringAverage).toBeCloseTo((3 * 72 + 2 * 38) / 4, 10);
    // Eighteen holes only: the calculator's own numbers, untouched.
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 3, holesPlayed: 54, totalBirdies: 6, birdiesPerRound: 2 });
    const long = (await profileLoad(holes('18')))!;
    expect(long.stats!.birdiesPerRound).toBe(2);
  });

  it('a coach\'s team figure under Both weighs the teammates\' nine-hole rounds the same way', async () => {
    profileOf([...mixedLengths(OWN), ...mixedLengths('p2').map((r) => ({ ...r, ...(r.holes_played === 9 ? { total_score: 40, front_nine: 40 } : rescore(76)) }))]);
    const p = (await profileLoad(holes('all')))!;
    expect(p.teamAvg).toBeCloseTo((4 * 72 + 3 * 38 + 4 * 76 + 3 * 40) / 11, 10);
    const nines = (await profileLoad(holes('9')))!;
    expect(nines.teamAvg).toBeCloseTo((3 * 38 + 3 * 40) / 3, 10);
  });

  it('the address carries the holes to the loader, and a value it does not know is 18', async () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
    teamOf(mixedLengths());
    type RouteEl = { props: { data: { filter: ChFilter; roundCount: number } } };
    const nine = (await ClubhouseStatsRoute({ query: { holes: '9', window: 'season' } })) as unknown as RouteEl;
    expect(nine.props.data.filter.holes).toBe('9');
    expect(nine.props.data.roundCount).toBe(3);
    const junk = (await ClubhouseStatsRoute({ query: { holes: '27', window: 'season' } })) as unknown as RouteEl;
    expect(junk.props.data.filter.holes).toBe('18');
    expect(junk.props.data.roundCount).toBe(4);
  });
});

describe('a player\'s own page reads only their own rounds (Q-91)', () => {
  it('asks for no other player\'s rounds, round figures, shots or team, whatever the filter, holes included', async () => {
    const rows = [rr('mine', OWN, inSeason(2)), rr('mine9', OWN, inSeason(3), { holes_played: 9, total_score: 38 }), rr('theirs', 'p2', inSeason(4)), rr('theirs9', 'p2', inSeason(5), { holes_played: 9, total_score: 40 })];
    const playerIds: string[][] = [];
    let memberReads = 0;
    tables.current = {
      ...profileTables(rows),
      golf_rounds: (f: Filters) => {
        playerIds.push((f.find(([k]) => k === 'in')?.[1][1] ?? []) as string[]);
        return roundsAnswer(rows)(f);
      },
      golf_team_members: (f: Filters) => {
        memberReads += 1;
        return isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: OWN }, { player_id: 'p2' }] };
      },
    };
    for (const h of ['18', '9', 'all'] as const) {
      const p = (await profileLoad(withPick({ ...filterFor('season'), holes: h }, { mode: 'only', ids: ['theirs', 'theirs9', 'mine', 'mine9'] }), 'player'))!;
      expect(p.rounds.every((r) => r.id.startsWith('mine'))).toBe(true);
      expect(p.teamAvg).toBeNull();
      expect(p.filterOptions.rounds.every((r) => r.id.startsWith('mine'))).toBe(true);
    }
    // Every rounds read was for this player alone; the roster was never read for the team (only the one membership check).
    expect(playerIds.length).toBeGreaterThan(0);
    expect(playerIds.every((ids) => ids.length === 1 && ids[0] === OWN)).toBe(true);
    expect(memberReads).toBe(3);
    expect(reads.cacheIds.every((id) => id.startsWith('mine'))).toBe(true);
    for (const [, ids] of detailed.mock.calls) expect((ids as string[]).every((id) => id.startsWith('mine'))).toBe(true);
    // The coach's read is the contrast: it reaches the teammates.
    playerIds.length = 0;
    await profileLoad(filterFor('season'), 'coach');
    expect(playerIds.some((ids) => ids.includes('p2'))).toBe(true);
  });
});

describe('the address', () => {
  const asCoach = () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
  };
  type RouteEl = { props: { data: { filter: ChFilter; window: string } } };
  const y = new Date().getUTCFullYear();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('reads the whole filter from the address and hands it to the loader, dropping what is unusable', async () => {
    asCoach();
    tables.current = teamTables([rr('a', 'p1', inSeason(2))]);
    const el = (await ClubhouseStatsRoute({
      query: { type: 'tournament,bogus', from: `${y}-09-01`, to: `${y}-09-29`, course: ['Pine Hollow', 'Finley GC'], skip: `${id(1)},not-an-id`, window: 'season' },
    })) as unknown as RouteEl;
    expect(el.props.data.filter).toEqual({ window: 'season', types: ['tournament'], holes: '18', from: `${y}-09-01`, to: `${y}-09-29`, courses: ['Pine Hollow', 'Finley GC'], pick: { mode: 'skip', ids: [id(1)] } });
    const junk = (await ClubhouseStatsRoute({ query: { type: 'bogus', from: `${y}-02-30`, only: "x'; drop table golf_rounds;--", course: '' } })) as unknown as RouteEl;
    expect(junk.props.data.filter).toEqual(filterFor('last10'));
  });

  it('keeps the older way in: a window argument alone, and it wins over the address\'s own', async () => {
    asCoach();
    tables.current = teamTables([rr('a', 'p1', inSeason(2))]);
    expect(((await ClubhouseStatsRoute({ window: 'qualifiers' })) as unknown as RouteEl).props.data.filter).toEqual(filterFor('qualifiers'));
    expect(((await ClubhouseStatsRoute({ window: 'season', query: { window: 'qualifiers', type: 'practice' } })) as unknown as RouteEl).props.data.filter).toMatchObject({ window: 'season', types: ['practice'] });
  });
});
