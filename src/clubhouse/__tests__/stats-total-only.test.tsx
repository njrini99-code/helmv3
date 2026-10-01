import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two owner rules on the figures (docs/clubhouse/PROGRESS.md):
 *
 *   Q-122 "Last 10" is a player's ten newest countable rounds in any season (the legacy app's rule), and "vs. previous 10" the ten
 *         before them, read across seasons; Season and Qualifiers stay this season.
 *   Q-123 A round posted as a total only (18 holes, no nines, no holes) counts in the SCORE figures and in no HOLE-level one, and a
 *         card whose round count is fewer than the window's says how many rounds it covers.
 *
 * The data is the Demo University Golf player Cole's, as production holds it on 30 September 2026: three hole-by-hole practice rounds
 * on 2 August, two qualifiers posted as totals on 25 and 26 September, and tournaments from May to July that Last 10 used to leave out.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const detailed = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: vi.fn().mockResolvedValue({ driving: null, approach: null, scope: { roundId: 'x', roundsIncluded: 0, filterApplied: false } }) }));

import { loadCoachHome, teamForm } from '../data/home';
import { loadPlayerHome } from '../data/player-home';
import { seasonFrom, toLibraryRound, type ChRoundListRow } from '../data/rounds-shape';
import { lastTenFloor, loadSeasonRounds, seasonStartDate, summarizePlayer, type ChRound } from '../data/season';
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

const nines = (total: number) => ({ front_nine: Math.floor(total / 2), back_nine: total - Math.floor(total / 2) });
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
/** A hole-by-hole round: the nines add up to the total. */
const played = (id: string, date: string, score: number, type = 'tournament'): Row => ({ ...base, id, round_date: date, round_type: type, total_score: score, score_to_par: score - 72, ...nines(score) });
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

/** Newest first: 2 totals, 3 rounds on 2 August, then 13 tournaments before the season (May to July). */
const COLE_ROUNDS: Row[] = [
  posted('q2', '2026-09-26', 70),
  posted('q1', '2026-09-25', 71),
  played('h1', '2026-08-02', 71, 'practice'),
  played('h2', '2026-08-02', 69, 'practice'),
  played('h3', '2026-08-02', 70, 'practice'),
  played('t01', '2026-07-10', 85),
  played('t02', '2026-07-09', 86),
  played('t03', '2026-07-08', 76),
  played('t04', '2026-07-03', 78),
  played('t05', '2026-07-02', 74),
  played('t06', '2026-07-02', 69),
  played('t07', '2026-06-09', 75),
  played('t08', '2026-06-08', 75),
  played('t09', '2026-05-29', 77),
  played('t10', '2026-05-29', 75),
  played('t11', '2026-05-28', 74),
  played('t12', '2026-05-22', 71),
  played('t13', '2026-05-21', 74),
];
const LAST_10 = ['q2', 'q1', 'h1', 'h2', 'h3', 't01', 't02', 't03', 't04', 't05'];
const LAST_10_HOLES = ['h1', 'h2', 'h3', 't01', 't02', 't03', 't04', 't05'];

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

  it('Cole: Last 10 is his ten newest rounds (it was three: only the season), Season five (it was three), Qualifiers two (it was none)', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const last10 = (await profileLoad('last10'))!;
    expect(last10.rounds.map((r) => r.id)).toEqual(LAST_10);
    expect(last10.win.rounds).toBe(10);
    const season = (await profileLoad('season'))!;
    expect(season.rounds.map((r) => r.id)).toEqual(['q2', 'q1', 'h1', 'h2', 'h3']);
    expect(season.win.rounds).toBe(5);
    const qualifiers = (await profileLoad('qualifiers'))!;
    expect(qualifiers.rounds.map((r) => r.id)).toEqual(['q2', 'q1']);
    expect(qualifiers.win.rounds).toBe(2);
    // "Rounds this season" stays this season whatever the window.
    expect(last10.season.rounds).toBe(5);
    expect(last10.season.avg).toBeCloseTo(70.2, 10);
  });

  it('"vs. previous 10" is the ten before them across seasons: his eight earlier tournaments', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const d = (await profileLoad('last10'))!;
    expect(d.extra.compare).not.toBeNull();
    expect(d.extra.compare!.lastRounds).toBe(10);
    expect(d.extra.compare!.previousRounds).toBe(8);
    // Scoring: the newest ten average 75.0, the eight before them 73.75 (shown to a tenth).
    const row = d.extra.compare!.rows.find((r) => r.label === 'Scoring avg')!;
    expect(row.last).toBe(75);
    expect(row.previous).toBe(73.8);
    expect(d.extra.compare!.lastHoleRounds).toBe(8);
    expect(d.extra.compare!.previousHoleRounds).toBe(8);
  });

  it('on the team page, each player’s ten newest across seasons, the earlier ten, and the same rounds on a second page', async () => {
    tables.current = teamTables(COLE_ROUNDS);
    const d = await teamLoad('last10');
    expect(reads.since.at(-1)).toBe(lastTenFloor());
    expect(d.roundCount).toBe(10);
    expect(figure(d, 'Scoring average').value).toBe(75);
    expect(figure(d, 'Scoring average').delta).toBe(1.25);
    expect(figure(d, 'Scoring average').context).toBe('vs. previous 10');
    expect(d.grid[0]).toMatchObject({ rounds: 10, avg: 75 });
    // The sheet lists everything loaded, the earlier rounds included.
    expect(d.filterOptions.total).toBe(COLE_ROUNDS.length);
    expect(d.filterOptions.seasonStart).toBe(START);
  });

  it('Home’s team form is the same Last 10: the newest ten across seasons, said with their dates', () => {
    const rounds = COLE_ROUNDS.map((r) => ({ ...(r as unknown as ChRound), ...(String(r.id).startsWith('q') ? { total_only: true as const } : {}) }));
    const f = teamForm(rounds, 0)!;
    expect(f.basis).toMatchObject({ rounds: 10, from: '2026-07-02', to: '2026-09-26' });
    expect(f.avg).toBe(75);
    expect(f.delta).toBe(1.25);
  });
});

describe('Q-123 Total-only rounds in the scores, not the hole figures: the player page', () => {
  it('Cole’s Last 10: ten rounds in the scores, eight in the hole figures, and the shot read is given the eight', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const d = (await profileLoad('last10'))!;
    expect(d.win.rounds).toBe(10);
    expect(d.win.holeRounds).toBe(8);
    expect(d.extra.holeRounds).toBe(8);
    expect(d.win.avg).toBe(75);
    expect(comparison(d, 'Scoring avg').you).toBe(75);
    // The shot-level read, the round cache and the putts are the eight rounds with holes; the two totals are in none of them.
    expect(detailed).toHaveBeenCalledTimes(1);
    expect(detailed.mock.calls[0]![1]).toEqual(LAST_10_HOLES);
    expect(reads.cacheIds).toEqual(expect.arrayContaining(LAST_10_HOLES));
    expect(reads.cacheIds).not.toContain('q1');
    expect(reads.cacheIds).not.toContain('q2');
    expect([...new Set(reads.puttIds)]).toEqual(LAST_10_HOLES);
    // So a cache row of zeros cannot pull the putts per round down, and strokes gained reads the eight.
    expect(comparison(d, 'Putts per round').you).toBe(30);
    expect(comparison(d, '3-putts per round').you).toBe(1);
    expect(comparison(d, 'Penalty strokes').you).toBe(1);
    expect(comparison(d, 'SG total').you).toBe(0.5);
    expect(d.win.sgRounds).toBe(8);
  });

  it('the Game detail’s scoring average is the headline’s, and a total-only round shows no greens or putts in the table', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const d = (await profileLoad('last10'))!;
    expect(d.stats!.scoringAverage18).toBe(75);
    expect(d.stats!.qualifyingRounds).toBe(2);
    expect(d.stats!.qualifyingScoringAvg).toBe(70.5);
    const q = d.rounds.find((r) => r.id === 'q2')!;
    expect(q).toMatchObject({ score: 70, toPar: -2, gir: null, putts: null, sg: null });
    expect(d.rounds.find((r) => r.id === 'h1')).toMatchObject({ gir: '10/18', putts: 30 });
  });

  it('the personal best score counts a total-only round; the best greens and fewest putts do not', async () => {
    tables.current = profileTables([posted('q', '2026-09-26', 66), played('a', '2026-09-20', 72, 'practice'), played('b', '2026-09-19', 74, 'practice')]);
    const d = (await profileLoad('season'))!;
    expect(d.extra.bests.score).toMatchObject({ value: 66, course: 'Home course' });
    expect(d.extra.bests.toPar).toMatchObject({ value: -6 });
    expect(d.extra.bests.putts!.value).toBe(30);
    expect(d.extra.series.score.map((p) => p.value)).toEqual([74, 72, 66]);
    expect(d.extra.series.putts).toHaveLength(2);
    expect(d.extra.series.gir).toHaveLength(2);
  });

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

  it('Season: five rounds in the scores (70.2), three in the hole figures', async () => {
    tables.current = profileTables(COLE_ROUNDS);
    const d = (await profileLoad('season'))!;
    expect(d.win.rounds).toBe(5);
    expect(d.win.holeRounds).toBe(3);
    expect(d.win.avg).toBeCloseTo(70.2, 10);
    expect(d.win.toPar).toBeCloseTo(-1.8, 10);
    expect(detailed.mock.calls[0]![1]).toEqual(['h1', 'h2', 'h3']);
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
  it('Last 10: the scoring is the ten, the hole cards are the eight and say so', async () => {
    tables.current = teamTables(COLE_ROUNDS);
    const d = await teamLoad('last10');
    expect(d.roundCount).toBe(10);
    expect(d.holeRoundCount).toBe(8);
    expect(figure(d, 'Scoring average').value).toBe(75);
    expect(figure(d, 'Scoring average').note).toBeUndefined();
    for (const label of ['Greens in regulation', 'Putts per round', 'Scrambling', 'Birdies per round']) {
      expect(figure(d, label).note).toBe('Hole stats from 8 of 10 rounds');
    }
    // Zeros from the two cache rows are in none of these: the putts per round is the eight rounds' 30, not 24.
    expect(figure(d, 'Putts per round').value).toBe(30);
    expect(figure(d, 'Birdies per round').value).toBe(2);
    expect(reads.cacheIds).not.toContain('q1');
    expect(reads.cacheIds).not.toContain('q2');
    expect(reads.puttIds).not.toContain('q1');
  });

  it('Season: five rounds, three with holes; the card’s own count is the three', async () => {
    tables.current = teamTables(COLE_ROUNDS);
    const d = await teamLoad('season');
    expect(reads.since.at(-1)).toBe(START);
    expect(d.roundCount).toBe(5);
    expect(d.holeRoundCount).toBe(3);
    expect(figure(d, 'Scoring average').value).toBeCloseTo(70.2, 10);
    expect(figure(d, 'Scoring average').context).toBe('5 rounds');
    expect(figure(d, 'Putts per round').context).toBe('3 rounds');
    expect(figure(d, 'Putts per round').note).toBe('Hole stats from 3 of 5 rounds');
    expect(figure(d, 'Greens in regulation').context).toBe('Tour averages 67%');
    expect(figure(d, 'Greens in regulation').note).toBe('Hole stats from 3 of 5 rounds');
  });

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
    tables.current = teamTables([posted('q', '2026-09-26', 66), played('a', '2026-09-20', 72, 'practice')]);
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

  it('Player Home: the brief and the scoring chart count it; the leg figures are the rounds with holes, and say how many', async () => {
    const rows: Row[] = [posted('q2', '2026-09-26', 70), posted('q1', '2026-09-25', 71), ...[0, 1, 2].map((i) => played(`h${i}`, `2026-09-${20 - i}`, 73, 'practice'))];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: { data: rows },
      golf_round_stats_cache: cacheAnswer,
      golf_pga_standards: { data: [] },
      golf_players: { data: { handicap_index: 3, handicap: null } },
      golf_teams: { data: { gender: 'men', created_by: null, organization_id: null } },
      golf_holes: { data: [] },
    };
    const home = await loadPlayerHome({ teamId: 't1', playerId: COLE, firstName: 'Cole' });
    // The last three rounds are the two qualifiers and the newest practice round: (70 + 71 + 73) / 3.
    expect(home.brief).toMatch(/^Your last three rounds average 71\.3\./);
    expect(home.scoring.points.map((p) => p.score)).toEqual([73, 73, 73, 71, 70]);
    const fairways = home.legs!.rows.find((l) => l.key === 'putting')!;
    // Putts per round: the three rounds with holes (30 each), not five with two missing.
    expect(fairways.value).toBe(30);
    expect(reads.cacheIds.sort()).toEqual(['h0', 'h1', 'h2']);
    const approach = home.legs!.rows.find((l) => l.key === 'approach')!;
    expect(approach.note).toBe('27 of 54 greens in the last 3 rounds');
  });

  it('Coach Home: the team form reaches back across seasons (it is Stats’ Last 10); the leaderboard and the latest rounds stay this season', async () => {
    const roster = [{ player: { id: COLE, first_name: 'Cole', last_name: 'Reed', graduation_year: 2027 } }];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_team_members: { data: roster },
      golf_conversations: { data: [] },
      golf_events: { data: [] },
      golf_rounds: roundsAnswer(COLE_ROUNDS),
      golf_holes: { data: [] },
    };
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Maya Reyes' });
    // One read from the rolling year back, so Last 10 can find the ten before the season began.
    expect(reads.since.at(-1)).toBe(lastTenFloor());
    expect(home.phone.form!.basis.rounds).toBe(10);
    expect(home.phone.form!.basis.from).toBe('2026-07-02');
    // This season only: five rounds, the two totals included.
    expect(home.leaderboard.scorecards).toBe(5);
    expect(home.leaderboard.rows).toHaveLength(1);
    expect(home.leaderboard.rows[0]).toMatchObject({ rounds: 5 });
    expect(home.leaderboard.rows[0]!.avg).toBeCloseTo(70.2, 10);
    expect(home.latestRounds.rounds.map((r) => r.id)).toEqual(['q2', 'q1', 'h1']);
    expect(seasonStartDate()).toBe(START);
  });
});
