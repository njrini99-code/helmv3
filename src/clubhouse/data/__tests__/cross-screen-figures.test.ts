import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { toChTeamLegs } from '../coachhelm-team-legs';
import { playerScoringAverage, playerStrokesGained, roundsForFigures } from '../figure-window';
import { playerFiguresOver, teamFiguresOver } from '../player-figures';
import { isScoreCountable } from '../round-scope';
import { inAverages, seasonFrom, toLibraryRound, type ChLibraryRound, type ChRoundListRow } from '../rounds-shape';
import { filterFor } from '../stats-filter';
import { roundsInFilter } from '../stats-common';
import { summarizeWindow } from '../stats-weight';
import { countsForScoring, type ChRound } from '../season';
import { teamSeasonFrom, toTeamRounds, type ChTeamRoundRow } from '../team-rounds-shape';

/**
 * Dashboard cuts: one home per number. Anywhere a figure is drawn outside its home, it is the same value over the same window. Homes: a
 * player's strokes gained and scoring average are My stats (Stats > Players for a coach), over the newest ten counted 18-hole rounds.
 * Every other surface reads the shared source, checked here by value over one player's rounds and by which function each loader calls.
 */
const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');

let i = 0;
const r = (date: string, type: string, score: number, sg: number | null, holes = 18): ChRound =>
  ({
    id: `r${String(i++).padStart(2, '0')}`,
    player_id: 'p1',
    round_date: date,
    round_type: type,
    holes_played: holes,
    total_score: score,
    score_to_par: score - (holes === 9 ? 36 : 72),
    status: 'completed',
    front_nine: sg == null ? null : 36,
    back_nine: sg == null ? null : score - 36,
    total_putts: sg == null ? null : 30,
    strokes_gained_total: sg,
    strokes_gained_tee: sg == null ? null : sg / 4,
    strokes_gained_approach: sg == null ? null : sg / 4,
    strokes_gained_around_green: sg == null ? null : sg / 4,
    strokes_gained_putting: sg == null ? null : sg / 4,
  }) as unknown as ChRound;

/** Newest first: a nine, practice, rounds with no shots, and more than ten counted 18s, so every rule of the window is in play. */
const rounds = [
  r('2026-11-02', 'tournament', 39, -1, 9),
  r('2026-10-30', 'practice', 70, 2),
  r('2026-10-21', 'tournament', 74, -3.7),
  r('2026-10-21', 'tournament', 77, -6.7),
  r('2026-10-20', 'qualifier', 73, null),
  r('2026-10-14', 'qualifier', 75, -2.1),
  r('2026-10-10', 'tournament', 79, -8.2),
  r('2026-10-02', 'qualifier', 72, -1.0),
  r('2026-09-28', 'qualifier', 76, -4.4),
  r('2026-09-20', 'tournament', 81, -9.9),
  r('2026-09-14', 'qualifier', 74, -3.0),
  r('2026-09-07', 'qualifier', 71, 0.4),
  r('2026-09-01', 'qualifier', 90, -20),
  r('2026-08-28', 'qualifier', 88, -18),
];
const home = summarizeWindow(roundsInFilter(roundsForFigures(rounds), filterFor('last10')));

describe('each figure matches its home, for one player over one window', () => {
  it('strokes gained: Team view, player Home, coach Home, Roster and Stats print one value', () => {
    const shared = playerStrokesGained(rounds);
    expect(home.sgPerRound).not.toBeNull();
    expect(shared.total).toBeCloseTo(home.sgPerRound!, 6);
    const team = toChTeamLegs(roundsForFigures(rounds), ['p1']).get('p1')!;
    expect(team.total).toBeCloseTo(home.sgPerRound!, 6);
    for (const leg of ['tee', 'approach', 'putting'] as const) expect(shared.legs[leg]).toBeCloseTo(home.sgLegs[leg]!, 6);
  });

  it('scoring average: player Home prints the value My stats does', () => {
    const shared = playerScoringAverage(rounds);
    expect(shared.n).toBe(10);
    expect(shared.avg).toBeCloseTo(home.avg!, 6);
  });

  it('every loader takes the shared source, and Home draws the loader’s figures without working them out again', () => {
    for (const file of ['data/player-home.ts', 'data/home.ts', 'data/roster.ts']) expect(src(file)).toMatch(/playerStrokesGained\(/);
    expect(src('data/player-home.ts')).toMatch(/scoringLast10: [^\n]*playerScoringAverage\(/);
    expect(src('data/coachhelm-team-legs.ts')).toMatch(/lastTenRounds\(/);
  });
});

/**
 * The season's scoring average has one value (owner, 11 Nov 2026: the Rounds average leaves practice out, as Stats does). Its home is
 * Stats on the Season window; the player's Rounds page and the coach's Team rounds draw the same rounds through their own list shapes,
 * so the same database rows go down both paths here and the two must print one number.
 */
describe('the season average on Rounds is the one Stats prints for Season', () => {
  const START = '2026-08-01';
  const row = (id: string, player: string, date: string, type: string | null, score: number, holes = 18): ChRound =>
    ({
      id,
      player_id: player,
      course_name: 'Finley GC',
      tees_played: 'Blue',
      round_date: date,
      round_type: type,
      holes_played: holes,
      total_score: score,
      score_to_par: score - (holes === 9 ? 36 : 72),
      status: 'completed',
      front_nine: holes === 9 ? score : 36,
      back_nine: holes === 9 ? null : score - 36,
      total_putts: 30,
      total_gir: 11,
      total_gir_possible: holes,
      total_fairways_hit: 8,
      total_fairways: 14,
      strokes_gained_total: null,
      strokes_gained_tee: null,
      strokes_gained_approach: null,
      strokes_gained_around_green: null,
      strokes_gained_putting: null,
    }) as unknown as ChRound;
  // Every rule of the season in play: practice, a type the app does not know (read as practice), the legacy "qualifying", no type,
  // a nine, a round from before 1 August, and two players.
  const rows = [
    row('a1', 'a', '2026-10-12', 'tournament', 71),
    row('a2', 'a', '2026-10-05', 'practice', 66),
    row('a3', 'a', '2026-09-28', 'qualifier', 75),
    row('a4', 'a', '2026-09-20', 'qualifying', 74),
    row('a5', 'a', '2026-09-12', 'casual', 68),
    row('a6', 'a', '2026-09-02', null, 77),
    row('a7', 'a', '2026-08-20', 'tournament', 38, 9),
    row('a8', 'a', '2026-07-20', 'tournament', 90),
    row('b1', 'b', '2026-10-11', 'qualifier', 79),
    row('b2', 'b', '2026-10-01', 'practice', 70),
    row('b3', 'b', '2026-09-15', 'tournament', 80),
  ];
  // What the Stats loader hands on (`loadSeasonRounds`): the rounds that count toward a score.
  const stats = rows.filter((r) => isScoreCountable(r as never));
  const season = filterFor('season');
  const names = new Map([
    ['a', 'Ada Park'],
    ['b', 'Ben Ortiz'],
  ]);

  it('one rule says which round types are averaged, on both sides', () => {
    for (const type of ['practice', 'tournament', 'qualifier', 'qualifying', 'casual', 'Practice', '', null]) expect(inAverages(type)).toBe(countsForScoring({ round_type: type }));
  });

  it('a player’s Rounds page and their Stats, Season: the same rounds, the same average', () => {
    const mine = rows.filter((r) => r.player_id === 'a');
    const home = playerFiguresOver(stats.filter((r) => r.player_id === 'a'), season, START);
    const library = seasonFrom(mine.map((r) => toLibraryRound(r as unknown as ChRoundListRow)).filter((r): r is ChLibraryRound => r != null), START);
    // 71, 75, 74 and 77: practice, the unknown type, the nine and July are out.
    expect(home.rounds).toBe(4);
    expect(library.rounds).toBe(home.rounds);
    expect(home.scoring_average).toBeCloseTo((71 + 75 + 74 + 77) / 4, 6);
    expect(library.avg).toBeCloseTo(home.scoring_average!, 6);
  });

  it('the coach’s Team rounds and Team stats, Season: the same rounds, the same average', () => {
    const home = teamFiguresOver(stats, ['a', 'b'], season, START);
    const team = teamSeasonFrom(toTeamRounds(rows as unknown as ChTeamRoundRow[], names).list, START);
    expect(home.rounds).toBe(6);
    expect(team.scored).toBe(home.rounds);
    expect(team.practice).toBe(3);
    expect(home.scoring_average).toBeCloseTo((71 + 75 + 74 + 77 + 79 + 80) / 6, 6);
    expect(team.avg).toBeCloseTo(home.scoring_average!, 6);
  });
});
