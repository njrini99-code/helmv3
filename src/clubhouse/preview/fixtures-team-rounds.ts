import { teamSeasonFrom, toTeamRounds, type ChTeamRoundRow, type ChTeamRounds } from '../data/team-rounds-shape';
import { previewRoundId } from './fixtures-rounds';

/** Team rounds sample data: the fixture roster's players over September and October 2026 (today is 14 October). */

const PLAYERS: Array<[id: string, name: string]> = [
  ['jonah', 'Jonah Okafor'],
  ['eli', 'Eli Brooks'],
  ['priya', 'Priya Nair'],
  ['theo', 'Theo Marchetti'],
  ['sam', 'Sam Whitfield'],
];

// [player, date, course, tees, type, score, par, putts, fairways hit, greens, out]
const SAMPLE: Array<[string, string, string, string, string, number, number, number, number, number, number]> = [
  ['jonah', '2026-10-12', 'Finley GC', 'Blue', 'qualifier', 72, 72, 30, 9, 12, 35],
  ['eli', '2026-10-12', 'Finley GC', 'Blue', 'qualifier', 75, 72, 32, 8, 10, 38],
  ['priya', '2026-10-11', 'Hope Valley CC', 'White', 'practice', 69, 70, 28, 11, 14, 34],
  ['theo', '2026-10-09', 'Finley GC', 'Blue', 'practice', 78, 72, 34, 6, 8, 39],
  ['sam', '2026-10-09', 'Old Chatham GC', 'White', 'practice', 74, 72, 31, 9, 11, 37],
  ['jonah', '2026-10-05', 'Hope Valley CC', 'Blue', 'tournament', 71, 70, 29, 10, 12, 36],
  ['priya', '2026-10-04', 'Finley GC', 'Blue', 'practice', 73, 72, 31, 9, 11, 37],
  ['eli', '2026-09-26', 'Carolina GC', 'Championship', 'qualifier', 74, 72, 31, 8, 11, 37],
  ['theo', '2026-09-24', 'Hope Valley CC', 'Blue', 'practice', 76, 70, 33, 7, 9, 38],
  ['jonah', '2026-09-22', 'Finley GC', 'Blue', 'qualifier', 76, 72, 33, 7, 10, 39],
  ['sam', '2026-09-18', 'Finley GC', 'White', 'practice', 77, 72, 33, 7, 9, 39],
  ['priya', '2026-09-12', 'Hope Valley CC', 'Blue', 'tournament', 70, 70, 29, 10, 13, 35],
  ['eli', '2026-09-05', 'Finley GC', 'Blue', 'practice', 79, 72, 34, 6, 8, 40],
  ['theo', '2026-08-30', 'Old Chatham GC', 'White', 'practice', 80, 72, 35, 5, 7, 41],
];

const rows: ChTeamRoundRow[] = SAMPLE.map(([player, date, course, tees, type, score, par, putts, fir, gir, out], i) => ({
  id: previewRoundId(200 + i),
  player_id: player,
  course_name: course,
  tees_played: tees,
  round_date: date,
  round_type: type,
  total_score: score,
  score_to_par: score - par,
  front_nine: out,
  back_nine: score - out,
  holes_played: 18,
  total_putts: putts,
  total_gir: gir,
  total_gir_possible: 18,
  total_fairways_hit: fir,
  total_fairways: 14,
}));

const names = new Map(PLAYERS);
const { list } = toTeamRounds(rows, names);
const SEASON_START = '2026-08-01';

export const PREVIEW_TEAM_ROUNDS: ChTeamRounds = {
  teamName: 'Varsity',
  seasonStart: SEASON_START,
  rounds: { list, error: false },
  rosterError: false,
  players: PLAYERS.map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  season: teamSeasonFrom(list, SEASON_START),
};

export const PREVIEW_TEAM_ROUNDS_EMPTY: ChTeamRounds = { ...PREVIEW_TEAM_ROUNDS, rounds: { list: [], error: false }, season: teamSeasonFrom([], SEASON_START) };
export const PREVIEW_TEAM_ROUNDS_FAILED: ChTeamRounds = { ...PREVIEW_TEAM_ROUNDS, rounds: { list: [], error: true }, season: teamSeasonFrom([], SEASON_START) };
export const PREVIEW_TEAM_ROUNDS_ROSTER_FAILED: ChTeamRounds = { ...PREVIEW_TEAM_ROUNDS, rounds: { list: [], error: false }, rosterError: true, players: [], season: teamSeasonFrom([], SEASON_START) };
export const PREVIEW_TEAM_ROUNDS_NO_ROSTER: ChTeamRounds = { ...PREVIEW_TEAM_ROUNDS, rounds: { list: [], error: false }, players: [], season: teamSeasonFrom([], SEASON_START) };
