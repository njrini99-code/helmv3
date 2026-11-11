import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * One number, one source (owner rule, 10 Nov 2026). A team's strokes gained, and a player's, are drawn on Team stats, on CoachHelm
 * Team (the hole) and in the Player file. These tests fail if any two of them print different figures for the same team, the same
 * player and the same window, or if a screen goes back to working a figure out for itself.
 *
 * Team stats is run through its real loader over a fake database; the hole and the file are run through the pure functions their
 * loaders call, over the very same rounds, and the loaders' sources are read to pin which function each one calls.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { loadTeamStats } from '../stats-team';
import { filterFor } from '../stats-filter';
import { firstTenLegs, toChTeamLegs, TRAIL_MIN_ROUNDS } from '../coachhelm-team-legs';
import { boardRoundsWords, stationsOfTeamSg, STATIONS } from '../coachhelm-team-shape';
import { fileSgSource, FILE_TEAM_FLOOR, toChFileSgOver } from '../coachhelm-file-shape';
import { lastTenRounds, playerStrokesGained, roundsForFigures } from '../figure-window';
import { teamLastTenStrokesGained, teamStrokesGained } from '../stats-team-sg';
import { holeRounds } from '../round-scope';
import type { ChRound } from '../season';
import { PREVIEW_TEAM_STATS, PREVIEW_PLAYER } from '../../preview/fixtures-stats';
import { PREVIEW_TEAM_BOARD } from '../../preview/fixtures-coachhelm-team';
import { PREVIEW_SG_ROWS, PREVIEW_TEAM_SG } from '../../preview/fixtures-team-sg';

const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** One round, hole by hole unless `sg` is null (then a total posted on its own, which no strokes-gained figure reads). */
const round = (player: string, i: number, sg: number | null, over: Partial<Record<string, unknown>> = {}) => ({
  id: `${player}-r${String(i).padStart(2, '0')}`,
  player_id: player,
  round_date: day(i * 3 + 1),
  total_score: 74,
  score_to_par: 2,
  front_nine: 37,
  back_nine: 37,
  holes_played: 18,
  status: 'completed',
  round_type: 'tournament',
  course_name: 'Pines',
  tees_played: 'White',
  total_putts: 31,
  total_gir: 10,
  total_gir_possible: 18,
  strokes_gained_total: sg,
  // Legs that do not add up to the total, as stored rounds do not: a screen that sums the legs is caught.
  strokes_gained_tee: sg == null ? null : sg * 0.1,
  strokes_gained_approach: sg == null ? null : sg * 0.5 - 0.2,
  strokes_gained_around_green: sg == null ? null : sg * 0.15,
  strokes_gained_putting: sg == null ? null : sg * 0.2 + 0.1,
  ...over,
});

/**
 * Six players with very different round counts, so a mean of the players' means and a mean of the rounds are far apart: the two
 * formulas the screens used to disagree by. Ada has fourteen rounds (ten in the window), Bo four, Cy three, Di two (under the floor),
 * Ed twelve with practice and a nine among them, Fay five.
 */
const ROSTER = [
  { id: 'ada', first_name: 'Ada', last_name: 'Lin' },
  { id: 'bo', first_name: 'Bo', last_name: 'Fox' },
  { id: 'cy', first_name: 'Cy', last_name: 'Ray' },
  { id: 'di', first_name: 'Di', last_name: 'Orr' },
  { id: 'ed', first_name: 'Ed', last_name: 'Poe' },
  { id: 'fay', first_name: 'Fay', last_name: 'Wu' },
];
const IDS = ROSTER.map((p) => p.id);
const ROUNDS = [
  ...Array.from({ length: 14 }, (_, i) => round('ada', i, -0.5 - i * 0.1)),
  ...Array.from({ length: 4 }, (_, i) => round('bo', i, -6 + i)),
  ...Array.from({ length: 3 }, (_, i) => round('cy', i, 6 - i)),
  ...Array.from({ length: 2 }, (_, i) => round('di', i, -9)),
  ...Array.from({ length: 12 }, (_, i) => round('ed', i, -2 + (i % 3), i === 1 ? { round_type: 'practice' } : i === 2 ? { holes_played: 9, total_score: 37, score_to_par: 1, front_nine: 37, back_nine: null } : {})),
  ...Array.from({ length: 5 }, (_, i) => round('fay', i, -1.25)),
];

const stats = async () => {
  tables.current = {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: ROSTER.map((player) => ({ player })) },
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_rounds: { data: ROUNDS },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [] },
    golf_shots: { data: [] },
  };
  return loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
};

/** The rounds as every Clubhouse loader holds them: newest first. */
const loaded = [...ROUNDS].sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id))) as unknown as ChRound[];
const counted = roundsForFigures(loaded);

describe('a team’s strokes gained is one figure on Team stats and on CoachHelm Team', () => {
  it('the hole’s hero is Team stats’ "Team SG per round" on Last 10, and each station is its leg total', async () => {
    const team = await stats();
    const headline = team.figures.find((f) => f.key === 'sg')!.value;
    const board = teamLastTenStrokesGained(counted, IDS);
    expect(headline).not.toBeNull();
    expect(board.total).toBeCloseTo(headline!, 9);
    expect(team.team.sgMean).toBeCloseTo(board.total!, 9);
    const stations = stationsOfTeamSg(board);
    STATIONS.forEach((s, i) => expect(stations[s].team).toBeCloseTo(team.legTotals[i]!, 9));
    expect(team.sgRounds).toBe(board.rounds);
  });

  it('the figure is the rounds’ mean, not the mean of the players’ means the hole used to draw', () => {
    const board = teamLastTenStrokesGained(counted, IDS);
    const legs = toChTeamLegs(counted, IDS);
    const means = IDS.map((id) => legs.get(id)!.total).filter((v): v is number => v != null);
    const meanOfMeans = means.reduce((a, b) => a + b, 0) / means.length;
    // The data keeps the two formulas a third of a stroke apart, so a return to the old one cannot pass as rounding.
    expect(Math.abs(board.total! - meanOfMeans)).toBeGreaterThan(0.3);
    // Di has two rounds: under the floor, so her rounds are in neither screen's figure.
    expect(board.ready.has('di')).toBe(false);
    expect([...board.ready].sort()).toEqual(['ada', 'bo', 'cy', 'ed', 'fay']);
  });

  it('both loaders call the one function, and the hole’s loader no longer averages the players', () => {
    expect(src('data/stats-team.ts')).toMatch(/teamStrokesGained\(holeWindow, /);
    expect(src('data/stats-team.ts')).toMatch(/legTotals: \[\.\.\.teamSg\.legs\]/);
    const board = src('data/coachhelm-team.ts');
    expect(board).toMatch(/teamLastTenStrokesGained\(countable, ids\)/);
    expect(board).toMatch(/stationsOfTeamSg\(teamSg\)/);
    expect(board).not.toMatch(/teamTotalOf\(/);
    expect(board).not.toMatch(/stationFigures\(list\)/);
  });
});

describe('a player’s strokes gained is one figure on Team stats, on CoachHelm Team and in the Player file', () => {
  it('each leg and the total match on all three for every player, over the last ten', async () => {
    const team = await stats();
    const board = toChTeamLegs(counted, IDS);
    for (const id of IDS) {
      const row = team.grid.find((g) => g.id === id)!;
      const hole = board.get(id)!;
      const file = toChFileSgOver(playerStrokesGained(loaded.filter((r) => r.player_id === id)), null, { you: false, first: id });
      const same = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? expect(a ?? null).toBe(b ?? null) : expect(a).toBeCloseTo(b, 9));
      same(hole.total, row.total);
      STATIONS.forEach((s, i) => {
        same(hole.legs[s].strokes, row.legs[i]);
        same(file.rows[i]!.strokes, row.legs[i]);
      });
    }
    // The floor is shared too: two rounds draw no figure anywhere.
    expect(team.grid.find((g) => g.id === 'di')!.total).toBeNull();
    expect(board.get('di')!.total).toBeNull();
  });

  it('the file’s team tick is Team stats’ leg total, only with five players at the floor, and never on a player’s own page', async () => {
    const team = await stats();
    const mine = playerStrokesGained(loaded.filter((r) => r.player_id === 'ada'));
    const coach = toChFileSgOver(mine, teamLastTenStrokesGained(counted, IDS), { you: false, first: 'Ada' });
    expect(coach.hasTeam).toBe(true);
    coach.rows.forEach((r, i) => expect(r.team).toBeCloseTo(team.legTotals[i]!, 9));
    // Four players at the floor: no tick.
    const four = IDS.filter((id) => id !== 'fay');
    expect(teamLastTenStrokesGained(counted, four).ready.size).toBe(FILE_TEAM_FLOOR - 1);
    expect(toChFileSgOver(mine, teamLastTenStrokesGained(counted, four), { you: false, first: 'Ada' }).hasTeam).toBe(false);
    // A player's own page is built with no team at all.
    const own = toChFileSgOver(mine, null, { you: true, first: '' });
    expect(own.rows.every((r) => r.team == null)).toBe(true);
    expect(JSON.stringify(own)).not.toContain('against the team');
  });

  it('the file names the window its figures read, and prints them as the hole and Stats do', () => {
    const mine = playerStrokesGained(loaded.filter((r) => r.player_id === 'ada'));
    const card = toChFileSgOver(mine, null, { you: false, first: 'Ada' });
    expect(card.source).toBe('Last 10 rounds · strokes per round');
    expect(card.rows[1]!.figure).toMatch(/^[+−]?\d\.\d$/);
    expect(fileSgSource({ rounds: 4, holeRounds: 3 })).toBe('Last 4 rounds · 3 with hole scores · strokes per round');
    expect(fileSgSource({ rounds: 0, holeRounds: 0 })).toBe('No counted rounds yet · strokes per round');
  });

  it('the file’s loaders read the rounds’ figures, not the standing tables', () => {
    const file = src('data/coachhelm-file.ts');
    expect(file.match(/toChFileSgOver\(/g)?.length).toBe(3);
    expect(file).toMatch(/playerStrokesGained\(/);
    expect(file).toMatch(/teamLastTenStrokesGained\(sgRounds\.rounds, sgRounds\.roster\)/);
    expect(file).not.toMatch(/toChFileSg\(/);
    // A player's own page asks for no team.
    expect(file).toMatch(/loadFileSgRounds\(supabase, \{ playerId, teamId: null \}\)/);
  });
});

describe('the board’s round count says only what it counts', () => {
  it('"this season" is the season’s count; a board without one names the year it read', () => {
    expect(boardRoundsWords({ strokes: -1, rounds: 80, seasonRounds: 62 })).toBe('62 rounds this season');
    expect(boardRoundsWords({ strokes: -1, rounds: 80, seasonRounds: 0 })).toBe('no rounds yet this season');
    expect(boardRoundsWords({ strokes: -1, rounds: 80 })).toBe('80 rounds in the last year');
    expect(boardRoundsWords({ strokes: null, rounds: 0 })).toBe('no rounds yet');
  });

  it('the loader counts the season from its first day, apart from the year the legs read', () => {
    const board = src('data/coachhelm-team.ts');
    expect(board).toMatch(/seasonCountable = countable\.filter\(\(r\) => r\.round_date\.slice\(0, 10\) >= seasonStart\)/);
    expect(board).toMatch(/seasonRounds: seasonCountable\.length/);
    expect(src('screens/coachhelm/team/TeamBoard.tsx')).not.toMatch(/teamTotal\.rounds, 'round'\)\} this season/);
  });
});

describe('the huddle’s trail starts from the first ten rounds of the season, on the dot’s own maths', () => {
  const season = '2026-08-01';
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...round('ada', i, -3 + i * 0.2), round_date: `2026-${i < 15 ? '10' : '09'}-${String(28 - (i % 15)).padStart(2, '0')}` })) as unknown as ChRound[];

  it('no trail under twenty counted season rounds', () => {
    expect(firstTenLegs(roundsForFigures(many(TRAIL_MIN_ROUNDS - 1)), season)).toBeNull();
    expect(toChTeamLegs(roundsForFigures(many(TRAIL_MIN_ROUNDS - 1)), ['ada'], season).get('ada')!.first10).toBeNull();
    // Rounds from before the season do not make up the twenty.
    expect(firstTenLegs(roundsForFigures(many(TRAIL_MIN_ROUNDS)), '2026-10-01')).toBeNull();
  });

  it('with twenty, the start is the first ten and shares no round with the dot (the last ten)', () => {
    const rounds = roundsForFigures(many(22));
    const first = firstTenLegs(rounds, season)!;
    const oldestFirst = [...rounds].sort((a, b) => (a.round_date < b.round_date ? -1 : a.round_date > b.round_date ? 1 : b.id.localeCompare(a.id)));
    const firstTen = oldestFirst.slice(0, 10);
    const lastTen = lastTenRounds(rounds);
    expect(firstTen.some((r) => lastTen.includes(r))).toBe(false);
    const mean = (rs: ChRound[], pick: (r: ChRound) => number | null) => rs.reduce((a, r) => a + (pick(r) as number), 0) / rs.length;
    expect(first.tee).toBeCloseTo(mean(firstTen, (r) => r.strokes_gained_tee), 9);
    expect(first.putting).toBeCloseTo(mean(firstTen, (r) => r.strokes_gained_putting), 9);
    // Parity (02-PLAN 9.2 B): the same maths over the last ten is the dot.
    const dot = toChTeamLegs(rounds, ['ada'], season).get('ada')!;
    expect(dot.legs.tee.strokes).toBeCloseTo(mean(holeRounds(lastTen), (r) => r.strokes_gained_tee), 9);
    expect(dot.first10).toEqual(first);
  });

  it('pooling by round: the team figure over one player’s rounds is that player’s own figure', () => {
    const rounds = roundsForFigures(many(12));
    expect(teamStrokesGained(holeRounds(lastTenRounds(rounds)), ['ada']).total).toBeCloseTo(toChTeamLegs(rounds, ['ada']).get('ada')!.total!, 9);
  });
});

describe('the previews show one team (preview/fixtures-team-sg.ts)', () => {
  /** The table as rounds: each player's rounds with shots, every one carrying that player's figures. */
  const tableRounds = PREVIEW_SG_ROWS.flatMap((r) =>
    Array.from({ length: r.shots }, (_, i) => ({
      ...round(r.cast.id, i, r.total ?? 0),
      strokes_gained_tee: r.legs?.[0] ?? 0,
      strokes_gained_approach: r.legs?.[1] ?? 0,
      strokes_gained_around_green: r.legs?.[2] ?? 0,
      strokes_gained_putting: r.legs?.[3] ?? 0,
    })),
  ) as unknown as ChRound[];

  it('the table’s team figure is the real function’s over the same rounds', () => {
    const real = teamStrokesGained(holeRounds(tableRounds), PREVIEW_SG_ROWS.map((r) => r.cast.id));
    expect(PREVIEW_TEAM_SG.total).toBeCloseTo(real.total!, 9);
    PREVIEW_TEAM_SG.legs.forEach((v, i) => expect(v).toBeCloseTo(real.legs[i]!, 9));
    expect(PREVIEW_TEAM_SG.rounds).toBe(real.rounds);
    expect(PREVIEW_TEAM_SG.players).toBe(real.ready.size);
  });

  it('Team stats and the Team board print one team figure and one figure a player', () => {
    expect(PREVIEW_TEAM_BOARD.teamTotal.strokes).toBe(PREVIEW_TEAM_STATS.team.sgMean);
    expect(PREVIEW_TEAM_STATS.figures.find((f) => f.key === 'sg')!.value).toBe(PREVIEW_TEAM_STATS.team.sgMean);
    STATIONS.forEach((s, i) => expect(PREVIEW_TEAM_BOARD.stations[s].team).toBe(PREVIEW_TEAM_STATS.legTotals[i]));
    // The same roster, by name, and each player's legs and total the same on both.
    expect(PREVIEW_TEAM_BOARD.players.list.map((p) => p.name).sort()).toEqual(PREVIEW_TEAM_STATS.grid.map((g) => g.name).sort());
    for (const g of PREVIEW_TEAM_STATS.grid) {
      const p = PREVIEW_TEAM_BOARD.players.list.find((x) => x.name === g.name)!;
      expect(p.total).toBe(g.total);
      STATIONS.forEach((s, i) => expect(p.legs[s].strokes).toBe(g.legs[i]));
      expect(p.rounds).toBe(g.rounds);
    }
  });

  it('a player’s own page carries the same team figure and their own grid row', () => {
    const sg = PREVIEW_PLAYER.comparisons.filter((c) => c.sg);
    expect(sg[0]!.team).toBe(PREVIEW_TEAM_SG.total);
    sg.slice(1).forEach((c, i) => expect(c.team).toBe(PREVIEW_TEAM_SG.legs[i]));
    const row = PREVIEW_TEAM_STATS.grid.find((g) => g.name === PREVIEW_PLAYER.name)!;
    expect(sg[0]!.you).toBe(row.total);
    sg.slice(1).forEach((c, i) => expect(c.you).toBe(row.legs[i]));
  });
});
