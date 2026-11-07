import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two owner rules on the figures (docs/clubhouse/PROGRESS.md):
 *
 *   Q-122 "Last 10" is a player's ten newest countable rounds in any season (the legacy app's rule), and "vs previous 10" the ten
 *         before them, read across seasons; Season and Qualifiers stay this season.
 *   Q-123 A round posted as a total only (18 holes, no nines, no holes) counts in the SCORE figures and in no HOLE-level one, and a
 *         card whose round count is fewer than the window's says how many rounds it covers.
 *
 * The data is modelled on the Demo University Golf player Cole's rounds as production holds them on 30 September 2026 (read-only SQL):
 * the same dates, types and nines, with the ids shortened. Three hole-by-hole practice rounds on 2 August, two qualifiers posted as
 * totals on 25 and 26 September, and the tournaments, a practice round and a 9-hole round from May to July that Last 10 used to leave
 * out. (Production stores a few totals one stroke off their nines, 85 against 45 + 39; the season read takes the nines, C-15, and so
 * does this data.)
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const detailed = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: vi.fn().mockResolvedValue({ driving: null, approach: null, scope: { roundId: 'x', roundsIncluded: 0, filterApplied: false } }) }));

import { teamForm } from '../data/home';
import { seasonFrom, toLibraryRound, type ChRoundListRow } from '../data/rounds-shape';
import { lastTenFloor, loadSeasonRounds, summarizePlayer, type ChRound } from '../data/season';
import { filterFor } from '../data/stats-filter';
import { loadPlayerProfile } from '../data/stats-player';
import { loadTeamStats } from '../data/stats-team';
import { PREVIEW_PLAYER } from '../preview/fixtures-stats';

type Filters = Array<[string, unknown[]]>;
type Row = Record<string, unknown> & { id: string; player_id: string; round_date: string };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());

const COLE = 'p1';
const START = '2026-08-01';

const base = {
  player_id: COLE,
  status: 'completed',
  holes_played: 18,
  course_name: 'Finley GC',
  total_putts: 30,
  total_gir: 9,
  total_gir_possible: 18,
  total_fairways_hit: 8,
  total_fairways: 14,
  strokes_gained_total: 0.5,
};
/** A hole-by-hole round: the nines add up to the total (the season read takes the total from them, C-15). */
const played = (id: string, date: string, front: number, back: number | null, type = 'tournament', over: Record<string, unknown> = {}): Row => ({
  ...base,
  id,
  round_date: date,
  round_type: type,
  total_score: front + (back ?? 0),
  score_to_par: front + (back ?? 0) - 72,
  front_nine: front,
  back_nine: back,
  ...over,
});
/** A qualifier posted as a total only (production: no nines, no putts, no greens, no strokes gained, an empty hole table). */
const posted = (id: string, date: string, score: number): Row => ({
  ...base,
  id,
  round_date: date,
  round_type: 'qualifier',
  course_name: 'Home course',
  total_score: score,
  score_to_par: score - 72,
  front_nine: null,
  back_nine: null,
  total_putts: null,
  total_gir: null,
  total_gir_possible: null,
  total_fairways_hit: null,
  total_fairways: null,
  strokes_gained_total: null,
});

/**
 * Newest first, as production orders them (date, then id): 2 totals, 3 rounds on 2 August, then before the season 6 tournaments in July,
 * a practice round (10 June), 7 more tournaments (June, May) and a 9-hole practice round (18 May). The 18-hole ones are 19 rounds.
 */
const COLE_ROUNDS: Row[] = [
  posted('q2', '2026-09-26', 70),
  posted('q1', '2026-09-25', 71),
  played('h1', '2026-08-02', 35, 36, 'practice'),
  played('h2', '2026-08-02', 34, 35, 'practice'),
  played('h3', '2026-08-02', 35, 35, 'practice'),
  played('t01', '2026-07-10', 45, 39),
  played('t02', '2026-07-09', 43, 43),
  played('t03', '2026-07-08', 39, 36),
  played('t04', '2026-07-03', 39, 38),
  played('t05', '2026-07-02', 35, 38),
  played('t06', '2026-07-02', 35, 33),
  played('u1', '2026-06-10', 36, 34, 'practice'),
  played('t07', '2026-06-09', 38, 37),
  played('t08', '2026-06-08', 35, 40),
  played('t09', '2026-05-29', 37, 40),
  played('t10', '2026-05-29', 38, 37),
  played('t11', '2026-05-28', 39, 35),
  played('t12', '2026-05-22', 36, 35),
  played('t13', '2026-05-21', 36, 38),
  played('n9', '2026-05-18', 38, null, 'practice', { holes_played: 9, total_putts: 16 }),
];
const PREVIOUS_MEAN = 659 / 9;
/** The newest ten's mean: 70 + 71 + 71 + 69 + 70 + 84 + 86 + 75 + 77 + 73 = 746 over ten rounds. */
const LAST_10_MEAN = 74.6;

/** What the loaders asked for: where the rounds read started, and which rounds' figures were read. */
const reads = { since: [] as Array<string | null>, cacheIds: [] as string[], puttIds: [] as string[] };
const roundsAnswer = (rows: Row[]) => (f: Filters) => {
  const gte = f.find(([k]) => k === 'gte');
  const since = gte ? String(gte[1][1]) : null;
  reads.since.push(since);
  const ids = f.find(([k]) => k === 'in')?.[1][1] as string[] | undefined;
  return { data: rows.filter((r) => (!since || r.round_date >= since) && (!ids || ids.includes(r.player_id))) };
};
/** As production: a round with no holes has a cache row of zeros (and no putts), which an average must never read. */
const cacheAnswer = (f: Filters) => {
  const ids = (f.find(([k]) => k === 'in')?.[1][1] ?? []) as string[];
  reads.cacheIds.push(...ids);
  return {
    data: ids.map((id) =>
      id.startsWith('q')
        ? { round_id: id, greens_hit: 0, greens_total: 0, total_putts: null, scramble_attempts: 0, scrambles_converted: 0, birdies: 0, eagles: 0, pars: 0, bogeys: 0, double_bogeys: 0, triple_plus: 0, penalty_strokes: 0, three_putts: 0 }
        : { round_id: id, greens_hit: 10, greens_total: 18, total_putts: 30, scramble_attempts: 5, scrambles_converted: 3, birdies: 2, eagles: 0, penalty_strokes: 1, three_putts: 1 },
    ),
  };
};
const puttsAnswer = (f: Filters) => {
  reads.puttIds.push(...((f.find(([k]) => k === 'in')?.[1][1] ?? []) as string[]));
  return { data: [] };
};

const teamTables = (rows: Row[]): import('./supabase-fake').ChFakeTables => ({
  golf_teams: { data: { name: 'Demo University Golf', gender: 'men' } },
  golf_team_members: { data: [{ player: { id: COLE, first_name: 'Cole', last_name: 'Reed' } }] },
  golf_rounds: roundsAnswer(rows),
  golf_round_stats_cache: cacheAnswer,
  golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
  golf_shots: puttsAnswer,
});
const isMembership = (f: Filters) => f.some(([k]) => k === 'in');
const profileTables = (rows: Row[]): import('./supabase-fake').ChFakeTables => ({
  golf_teams: { data: { gender: 'men' } },
  golf_players: { data: { id: COLE, first_name: 'Cole', last_name: 'Reed', graduation_year: 2029, hometown: 'Charlotte', state: 'NC', handicap: 3.9, handicap_index: null } },
  golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: COLE }] }),
  golf_rounds: roundsAnswer(rows),
  golf_round_stats_cache: cacheAnswer,
  golf_pga_standards: { data: [] },
  golf_player_focus_areas: { data: [] },
  golf_goals: { data: [] },
  golf_holes: { data: [] },
  golf_shots: puttsAnswer,
});

const teamLoad = (window: 'last10' | 'season' | 'qualifiers') => loadTeamStats({ teamId: 't1', window, filter: filterFor(window) });
const profileLoad = (window: 'last10' | 'season' | 'qualifiers') => loadPlayerProfile({ viewer: 'coach', teamId: 't1', playerId: COLE, window, filter: filterFor(window) });
const figure = (d: Awaited<ReturnType<typeof loadTeamStats>>, label: string) => d.figures.find((f) => f.label === label)!;
const comparison = (d: NonNullable<Awaited<ReturnType<typeof loadPlayerProfile>>>, label: string) => d.comparisons.find((c) => c.label === label)!;

beforeEach(() => {
  detailed.mockReset();
  detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 8 });
  reads.since = [];
  reads.cacheIds = [];
  reads.puttIds = [];
  tables.current = {};
});

describe('the season read keeps a round posted as a total only, marked, and nothing the countable rule rejects', () => {
  it('marks the total-only qualifiers and leaves the hole-by-hole rounds as they are', async () => {
    tables.current = { golf_rounds: roundsAnswer(COLE_ROUNDS) };
    const supabase = await (await import('@/lib/supabase/server')).createClient();
    const { rounds, error } = await loadSeasonRounds(supabase, [COLE], { surface: 'stats', since: null });
    expect(error).toBe(false);
    expect(rounds).toHaveLength(COLE_ROUNDS.length);
    expect(rounds.filter((r) => r.total_only).map((r) => r.id)).toEqual(['q2', 'q1']);
    // The nines make the total (84, not the stored 85) and move the to-par with it.
    expect(rounds.find((r) => r.id === 't01')).toMatchObject({ total_score: 84, score_to_par: 12 });
    expect(rounds.find((r) => r.id === 'h1')!.total_only).toBeUndefined();
    // The newest first, as ever.
    expect(rounds.slice(0, 5).map((r) => r.id)).toEqual(['q2', 'q1', 'h1', 'h2', 'h3']);
  });

  it('still asks the database for completed rounds that are not test rounds', async () => {
    const seen: Filters[] = [];
    tables.current = { golf_rounds: (f) => (seen.push(f), { data: [] }) };
    const supabase = await (await import('@/lib/supabase/server')).createClient();
    await loadSeasonRounds(supabase, [COLE], { surface: 'stats' });
    expect(seen[0]).toContainEqual(['eq', ['is_test', false]]);
    expect(seen[0]).toContainEqual(['eq', ['status', 'completed']]);
  });

  it('drops an implausible total, a nine-hole total, a one-nine 18-hole round, and a total with no score', async () => {
    const odd = (id: string, over: Record<string, unknown>) => ({ ...posted(id, '2026-09-20', 72), ...over });
    tables.current = {
      golf_rounds: roundsAnswer([
        odd('ok', {}),
        odd('floor', { total_score: 37, score_to_par: -35 }),
        odd('nine', { holes_played: 9, total_score: 38 }),
        odd('half', { front_nine: 36 }),
        odd('none', { total_score: null }),
        odd('sg', { strokes_gained_total: 34.5 }),
      ]),
    };
    const supabase = await (await import('@/lib/supabase/server')).createClient();
    const { rounds } = await loadSeasonRounds(supabase, [COLE], { surface: 'stats', since: null });
    expect(rounds.map((r) => r.id)).toEqual(['ok']);
  });
});

describe('Q-122 Last 10 across seasons', () => {
  it('reads a rolling year back for Last 10 and this season for Season and Qualifiers', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    await profileLoad('last10');
    expect(reads.since.at(-1)).toBe(lastTenFloor());
    expect(lastTenFloor()).toBe('2025-09-30');
    reads.since = [];
    await profileLoad('season');
    expect(reads.since.at(-1)).toBe(START);
    reads.since = [];
    await profileLoad('qualifiers');
    expect(reads.since.at(-1)).toBe(START);
  });

  it('Home’s team form is the same Last 10: the newest ten across seasons, said with their dates', () => {
    // As the season read hands them over: the nines make the total, and the two totals are marked.
    const rounds = COLE_ROUNDS.map((r) => ({ ...(r as unknown as ChRound), total_score: r.front_nine == null ? (r.total_score as number) : (r.front_nine as number) + ((r.back_nine as number | null) ?? 0), ...(String(r.id).startsWith('q') ? { total_only: true as const } : {}) }));
    const f = teamForm(rounds, 0)!;
    expect(f.basis).toMatchObject({ rounds: 10, from: '2026-07-02', to: '2026-09-26' });
    expect(f.avg).toBeCloseTo(LAST_10_MEAN, 10);
    expect(f.delta).toBeCloseTo(LAST_10_MEAN - PREVIOUS_MEAN, 10);
  });
});

describe('Q-123 Total-only rounds in the scores, not the hole figures: the player page', () => {

  it('a window of totals only: the scores are there, the shot read is not asked, and Game detail is "no shot-by-shot rounds", never "didn’t load"', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const d = (await profileLoad('qualifiers'))!;
    expect(d.win.rounds).toBe(2);
    expect(d.win.holeRounds).toBe(0);
    expect(d.win.avg).toBe(70.5);
    expect(d.win.trend).toEqual([71, 70]);
    expect(d.extra.holeRounds).toBe(0);
    expect(detailed).not.toHaveBeenCalled();
    expect(d.stats).toBeNull();
    expect(d.statsError).toBe(false);
    expect(d.cacheError).toBe(false);
    expect(reads.cacheIds).toEqual([]);
    expect(d.extra.bests.score!.value).toBe(70);
    expect(d.extra.bests.gir).toBeNull();
    expect(d.extra.bests.putts).toBeNull();
    expect(comparison(d, 'Putts per round').you).toBeNull();
    expect(comparison(d, 'SG total').you).toBeNull();
    expect(d.win.sgPerRound).toBeNull();
  });

  it('no total-only round in the window: every round has its holes, and nothing changes', async () => {
    tables.current = profileTables(COLE_ROUNDS.filter((r) => !String(r.id).startsWith('q')));
    const d = (await profileLoad('last10'))!;
    expect(d.win.rounds).toBe(10);
    expect(d.win.holeRounds).toBe(10);
    expect(d.extra.holeRounds).toBe(10);
  });
});

describe('Q-123 Total-only rounds in the scores, not the hole figures: the team page', () => {

  it('Qualifiers: two rounds and no hole stats; the scoring and the player row are the totals', async () => {
    tables.current = teamTables(COLE_ROUNDS);
    const d = await teamLoad('qualifiers');
    expect(d.roundCount).toBe(2);
    expect(d.holeRoundCount).toBe(0);
    expect(figure(d, 'Scoring average').value).toBe(70.5);
    expect(figure(d, 'Putts per round').value).toBeNull();
    expect(figure(d, 'Greens in regulation').value).toBeNull();
    expect(figure(d, 'Putts per round').note).toBe('Hole stats from 0 of 2 rounds');
    expect(figure(d, 'Team SG per round').value).toBeNull();
    expect(d.grid[0]).toMatchObject({ rounds: 2, avg: 70.5, total: null });
    // The ranked dot plot's samples: the two totals count for the scoring average (the pooled spread under five rounds);
    // strokes gained reads the rounds with their holes, of which there are none.
    expect(d.grid[0]!.spread!.score.n).toBe(2);
    expect(d.grid[0]!.spread!.score.se).toBeCloseTo(3.6 / Math.sqrt(2), 10);
    expect(d.grid[0]!.spread!.sg).toEqual({ n: 0, se: null });
    expect(d.grid[0]!.spread!.legs).toHaveLength(4);
    expect(d.days.map((x) => x.score)).toEqual([71, 70]);
    expect(d.putting).toBeNull();
    expect(d.cacheError).toBe(false);
    expect(d.puttsError).toBe(false);
  });

  it('every round has its holes: the hole cards carry no coverage line', async () => {
    tables.current = teamTables(COLE_ROUNDS.filter((r) => !String(r.id).startsWith('q')));
    const d = await teamLoad('last10');
    expect(d.holeRoundCount).toBe(d.roundCount);
    expect(d.figures.every((f) => f.note === undefined || f.label === 'Team SG per round')).toBe(true);
  });

  it('the season’s low round counts a total-only round', async () => {
    tables.current = teamTables([posted('q', '2026-09-26', 66), played('a', '2026-09-20', 36, 36, 'practice')]);
    const d = await teamLoad('season');
    expect(d.bests.find((b) => b.label === 'Low round')!.value).toMatch(/^66/);
  });
});

describe('Q-123 Total-only rounds on Home, in Rounds and on the roster', () => {
  const round = (id: string, date: string, score: number, over: Partial<ChRound> = {}): ChRound => ({
    id,
    player_id: COLE,
    course_name: 'Home',
    tees_played: null,
    round_date: date,
    round_type: 'practice',
    total_score: score,
    score_to_par: score - 72,
    front_nine: null,
    back_nine: null,
    holes_played: 18,
    total_putts: 30,
    total_gir: 10,
    total_gir_possible: 18,
    total_fairways_hit: null,
    total_fairways: null,
    strokes_gained_total: null,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
    ...over,
  });

  it('the team form counts a total-only round in the scoring and in no greens or putts, whatever its row holds', () => {
    // Its row holds zeros, as an in-progress default would; an average must not read them.
    const zeros = { total_only: true as const, total_putts: 0, total_gir: 0, total_gir_possible: 18 };
    const full = [round('q', '2026-09-26', 70, zeros), round('a', '2026-09-20', 74), round('b', '2026-09-19', 74)];
    const f = teamForm(full, 0)!;
    expect(f.avg).toBeCloseTo((70 + 74 + 74) / 3, 10);
    expect(f.putts.avg).toBe(30);
    expect(f.gir.pct).toBeCloseTo((20 / 36) * 100, 10);
    expect(f.basis).toMatchObject({ rounds: 3, girRounds: 2, puttsRounds: 2 });
  });

  it('a season summary counts a total-only round in the average, to par, trend and form; its strokes gained reads none', () => {
    const rounds = [
      round('q2', '2026-09-26', 70, { total_only: true, strokes_gained_total: 9, strokes_gained_tee: 9 }),
      round('q1', '2026-09-25', 71, { total_only: true }),
      round('a', '2026-09-20', 73, { strokes_gained_total: 1, strokes_gained_tee: 1 }),
      round('b', '2026-09-19', 75, { strokes_gained_total: 1, strokes_gained_tee: 1 }),
    ];
    const s = summarizePlayer(rounds);
    expect(s.rounds).toBe(4);
    expect(s.avg).toBeCloseTo(72.25, 10);
    expect(s.trend).toEqual([75, 73, 71, 70]);
    // Two rounds with strokes gained are under the floor of three: the total-only rounds' stray value does not make a third and fourth.
    expect(s.sgRounds).toBe(2);
    expect(s.sgPerRound).toBeNull();
  });

  it('the Rounds library counts it: not marked "not counted", in the season average and best score; an implausible total still is', () => {
    const row = (over: Partial<ChRoundListRow>): ChRoundListRow => ({
      id: 'x',
      course_name: 'Home course',
      tees_played: null,
      round_date: '2026-09-26',
      round_type: 'qualifier',
      total_score: 70,
      score_to_par: -2,
      front_nine: null,
      back_nine: null,
      holes_played: 18,
      total_putts: null,
      total_gir: null,
      total_gir_possible: null,
      total_fairways_hit: null,
      total_fairways: null,
      ...over,
    });
    const posted70 = toLibraryRound(row({}))!;
    expect(posted70.countable).toBe(true);
    expect(toLibraryRound(row({ total_score: 37, score_to_par: -35 }))!.countable).toBe(false);
    const holes = toLibraryRound(row({ id: 'h', total_score: 72, score_to_par: 0, front_nine: 36, back_nine: 36, total_putts: 30, total_gir: 9, total_gir_possible: 18 }))!;
    const season = seasonFrom([posted70, holes], START);
    expect(season.rounds).toBe(2);
    expect(season.avg).toBe(71);
    expect(season.best).toMatchObject({ score: 70, toPar: -2 });
    // Greens and putts are the one round that has them.
    expect(season.putts).toBe(30);
    expect(season.girPct).toBe(50);
  });
});
