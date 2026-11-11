/**
 * CoachHelm chat knowledge: the hand-written half of the data map.
 *
 * The data map tells the model where things are: what exists in the team's data, how the things connect, which read
 * answers which question, exactly what `query_team_data` may touch, and what is not recorded at all. It is GENERATED
 * (`scripts/coachhelm/gen-data-map.ts` writes `data-map.generated.ts`) from three sources of truth:
 *
 *   src/lib/types/database.ts      every table and column named here must exist there;
 *   ../team-query-allowlist.ts     the tables and columns of `query_team_data`, copied exactly, never widened;
 *   ../registry.ts                 every read named here must be a tool the surface is offered.
 *
 * This file holds only what none of those can say: the one-line plain meaning of each thing, of each allowlisted table,
 * and of the values a status column takes. Plain words a coach would use. No figure, no date, no team name.
 *
 * Rules the generator and `__tests__/data-map.test.ts` enforce:
 *   - `backing` tables exist in database.ts (they are checked, not printed, unless allowlisted);
 *   - a value list marked `schema` is a subset of the column's CHECK constraint in `supabase/schemas/golf/`;
 *   - the printed map names no table outside the allowlist and no column outside its table's allowlisted columns;
 *   - the player's map names no table at all, no team-wide read and nothing about another player.
 */
import type { TeamQueryTable } from '../team-query-allowlist';

export interface MapThing {
  id: string;
  /** What a coach calls it. */
  name: string;
  /** One or two plain sentences: what it is and what is on it. */
  means: string;
  /** The reads that answer questions about it, in the order to try them. Checked against the registry. */
  readers: readonly string[];
  /** Tables it lives in. Checked against database.ts. Only the allowlisted ones are printed (in the query section). */
  backing: readonly string[];
  /** The line a player's map carries instead, in the second person; absent when a player cannot read it. */
  player?: { name?: string; means: string; readers: readonly string[] };
}

/** Readers that exist only while a release flag is on. The map names them with that condition, so its bytes do not change with the flag. */
export const FLAGGED_READERS: Readonly<Record<string, string>> = { get_tournaments: 'only when tournaments are turned on for the program' };

export const CONNECTIONS =
  'A team has staff and a roster of players. A player has rounds. A round has holes, and a hole has shots when the player logged them. A round can belong to a qualifier or to a tournament round. An event sits on the team calendar, and each invited player has a reply and a check-in on it. A focus area, a goal and a CoachHelm read each belong to one player. Every id is for tool calls only.';

export const THINGS: readonly MapThing[] = [
  {
    id: 'roster',
    name: 'Team, staff and roster',
    means: 'The active roster with ids is in the team block of this prompt. Seasons, terms and settings are team records.',
    readers: ['get_season', 'get_reference'],
    backing: ['golf_teams', 'golf_team_members', 'golf_players', 'golf_coaches', 'golf_team_settings', 'golf_team_seasons', 'golf_team_terms'],
  },
  {
    id: 'rounds',
    name: 'Rounds',
    means: 'One per round a player posted: the day, the kind, 9 or 18 holes, the course and tees, score, to par, putts, greens, fairways, penalties, and strokes gained in total and by area.',
    readers: ['get_player_stats', 'get_rounds', 'get_round', 'get_season'],
    backing: ['golf_rounds', 'golf_round_stats_cache'],
    player: { means: 'Your rounds: the day, the kind, the course, score, to par, putts, greens, fairways and strokes gained.', readers: ['get_player_stats', 'get_round', 'get_season'] },
  },
  {
    id: 'holes',
    name: 'Holes',
    means: 'One per hole of a round scored hole by hole: par, score, putts, fairway hit, green hit, penalty strokes.',
    readers: ['get_round'],
    backing: ['golf_holes'],
    player: { means: 'Each hole of one of your rounds: par, score, putts, fairway, green, penalties.', readers: ['get_round'] },
  },
  {
    id: 'shots',
    name: 'Shots and putts',
    means: 'One per shot the player logged: its type, the lie and distance before and after, the result, where a miss went, and for a putt its length and whether it dropped. Many rounds have no shots logged.',
    readers: ['get_player_stats', 'get_team_stats', 'get_shots'],
    backing: ['golf_shots'],
    player: { means: 'The shots you logged: lie, distance, result, where misses went, and each putt\'s length and result.', readers: ['get_player_stats', 'get_shots'] },
  },
  {
    id: 'courses',
    name: 'Courses and tees',
    means: 'A course with its holes and tees (par, yardage, rating, slope), and how this team has scored on each hole there.',
    readers: ['get_reference'],
    backing: ['golf_courses', 'golf_course_tees', 'golf_course_tee_holes'],
  },
  {
    id: 'career',
    name: 'Career figures and standing',
    means: 'Stored lifetime figures for each player over every completed round, practice included, and where the player stands against the team and their level. Not a window and not the Stats page: never quote one as a recent figure or as the team average.',
    readers: ['query_team_data'],
    backing: ['golf_player_stats_cache', 'golf_player_standing'],
  },
  {
    id: 'schedule',
    name: 'Schedule, attendance and travel',
    means: 'Calendar events, each player\'s reply and check-in, attendance totals, who is in class during an event, school terms, and trips with transport and hotel.',
    readers: ['get_schedule'],
    backing: ['golf_events', 'golf_event_attendance', 'golf_attendance_summary', 'golf_team_terms', 'golf_travel_itineraries'],
    player: { name: 'Schedule', means: 'Your team\'s coming events and your own reply to each.', readers: ['get_schedule'] },
  },
  {
    id: 'qualifiers',
    name: 'Qualifiers',
    means: 'A qualifier with its dates, course, rounds, squad size and coach\'s picks; who entered; the board; and who was selected, on score or as a pick.',
    readers: ['get_qualifiers', 'get_rounds'],
    backing: ['golf_qualifiers', 'golf_qualifier_entries', 'golf_qualifier_selections'],
  },
  {
    id: 'tournaments',
    name: 'Tournaments',
    means: 'A tournament with its format, its rounds, the lineup, each player\'s round scores, where the team finished, and the coach\'s and players\' notes on it.',
    readers: ['get_tournaments', 'get_rounds'],
    backing: ['golf_tournaments', 'golf_tournament_entries', 'golf_tournament_rounds', 'golf_tournament_player_rounds'],
  },
  {
    id: 'practice',
    name: 'Practice, plans and drills',
    means: 'Practices held, practice plans, the team\'s drills and the GolfHelm drill library, the plan format, and the practice sessions players logged.',
    readers: ['get_practice'],
    backing: ['golf_drills', 'golf_practice_sessions'],
  },
  {
    id: 'coachhelm',
    name: 'CoachHelm reads',
    means: 'What CoachHelm has found for a player: open signals with their evidence, the causes behind them, and patterns several players share.',
    readers: ['get_coachhelm'],
    backing: ['golf_coach_insights'],
    player: { means: 'The titles of your open CoachHelm reads.', readers: ['get_coachhelm'] },
  },
  {
    id: 'focus',
    name: 'Focus areas, goals and tasks',
    means: 'A player\'s focus areas with their target and status, the practice logged toward each, goals (baseline, current, target, time left) and the team\'s outstanding tasks.',
    readers: ['get_coachhelm'],
    backing: ['golf_player_focus_areas', 'golf_focus_area_criteria', 'golf_focus_area_practice_sessions', 'golf_goals', 'golf_tasks'],
    player: { name: 'Focus areas', means: 'Your active focus areas.', readers: ['get_coachhelm'] },
  },
  {
    id: 'reference',
    name: 'Standards and definitions',
    means: 'What each metric measures, and the published Tour and level figures for it, on the right tour for this team.',
    readers: ['get_reference'],
    backing: ['golf_pga_standards', 'golf_metrics'],
    player: { means: 'What a metric measures, and the published Tour and level figures for it.', readers: ['get_reference'] },
  },
  {
    id: 'documents',
    name: 'Documents and messages',
    means: 'Document titles and folders. Message threads can be found by title so a draft can be opened in one.',
    readers: ['get_reference', 'find_thread'],
    backing: ['golf_documents', 'golf_conversations'],
  },
];

/** Which read answers which question. `{reader}: line`. Order is the order printed. Checked against the registry. */
export const READER_GUIDE: ReadonlyArray<{ reader: string; use: string; player?: string }> = [
  { reader: 'get_player_stats', use: 'how a player is playing over a window, players compared, where a player trails the team; sections add the rounds, putting by distance, approach by distance, and hole figures (toughest holes, pressure gap).', player: 'how you are playing over a window; sections add your rounds, putting by distance, approach by distance and hole figures.' },
  { reader: 'get_team_stats', use: 'the team\'s figures for a window, the team average, every player ranked on one measure, team putting by distance.' },
  { reader: 'get_rounds', use: 'which rounds were played, by player, kind and dates, with counts and averages. Its averages include practice rounds unless you give a kind.' },
  { reader: 'get_round', use: 'one round hole by hole, with its birdies, bogeys, putts and scoring by par counted.', player: 'one of your rounds hole by hole.' },
  { reader: 'get_shots', use: 'logged approach shots: where misses go, distance left, lies, by club or yardage.', player: 'your logged approach shots: where misses go and distance left.' },
  { reader: 'get_season', use: 'scoring this season for the team and each player, practice left out; and this season against last. This is the season figure.', player: 'your scoring this season, and this season against last.' },
  { reader: 'get_qualifiers', use: 'the qualifiers, and one qualifier\'s board with who was selected. Standings come from here, not from stored entry rows.' },
  { reader: 'get_tournaments', use: 'tournaments, results, lineups and notes.' },
  { reader: 'get_schedule', use: 'events between two dates with replies and check-ins; travel, class conflicts and attendance on request.', player: 'your team\'s coming events and your own reply.' },
  { reader: 'get_coachhelm', use: 'CoachHelm\'s signals, causes and patterns; focus areas and their practice; goals; tasks.', player: 'your open reads and your focus areas.' },
  { reader: 'get_practice', use: 'practices and plans, the drill bank, the plan format.' },
  { reader: 'get_reference', use: 'by topic: golf knowledge, metric definitions, Tour and level standards, a course, document titles, team settings, and the column list of query_team_data.', player: 'by topic: golf knowledge, metric definitions, and Tour and level standards.' },
  { reader: 'query_team_data', use: 'rows from the tables listed below, only when no read above answers. It returns rows, so hand them to summarise_data for any count or average.' },
];

/** Tools that are reads on the contract but are not ways to read the team's golf data; the map does not list them. */
export const NOT_DATA_READERS: readonly string[] = ['summarise_data', 'show_visual', 'find_thread', 'find_in_app', 'save_note', 'remove_note', 'write_artifact', 'ask_practice_brief', 'draft_practice_plan', 'draft_message', 'draft_poll', 'draft_board'];

/** One line on each allowlisted table: what a row is and the caution that matters. A table added to the allowlist without a line here does not compile. */
export const QUERY_TABLE_NOTES: Record<TeamQueryTable, string> = {
  golf_rounds: 'one row per round. round_date is a calendar day and a player can have several rounds on one day. An empty column means not recorded.',
  golf_round_stats_cache: 'one row per round with its counted figures (birdies, three-putts, scrambles). Order by the round, never by updated_at.',
  golf_player_stats_cache: 'one row per player: lifetime figures over every completed round, practice included. Not a window.',
  golf_player_standing: 'one row per player and metric: lifetime value, team average and level average. Not the Stats page\'s team average.',
  golf_attendance_summary: 'one row per player and period: events, attended, excused, absent.',
  golf_goals: 'one row per goal; baseline, current and target are in the unit of its metric.',
  golf_player_focus_areas: 'one row per focus area.',
  golf_focus_area_practice_sessions: 'one row per practice logged toward a focus area.',
  golf_focus_area_criteria: 'one row per criterion of a focus area, met or not.',
  golf_qualifiers: 'one row per qualifier.',
  golf_qualifier_entries: 'one row per player entered; its stored position and totals can lag the board.',
  golf_qualifier_selections: 'one row per player selected, once the coach has confirmed the squad.',
  golf_events: 'one row per calendar event; times are stored in UTC, so give them in the team\'s timezone.',
  golf_event_attendance: 'one row per player and event: the reply and the check-in.',
  golf_team_seasons: 'one row per season: conference, division, official rank.',
  golf_team_terms: 'one row per school term.',
  golf_team_settings: 'one row for the team\'s settings.',
  golf_practice_sessions: 'one row per practice session a player logged.',
  golf_tournaments: 'one row per tournament.',
  golf_tournament_entries: 'one row per player in a tournament: lineup, alternate or individual.',
  golf_tournament_rounds: 'one row per round of a tournament.',
  golf_tournament_player_rounds: 'one row per player and tournament round: the score entered and whether it stands.',
};

export interface ValueList {
  table: string;
  column: string;
  /** `schema`: a subset of the column's CHECK constraint (the test reads the schema mirror). `code`: fixed by code the test names. */
  check: 'schema' | 'code';
  /** value → what it means, in plain words. */
  values: Readonly<Record<string, string>>;
  /** Printed in the player's map too. */
  player?: boolean;
}

/** What the values of the status columns mean. Only columns a reader returns or the allowlist exposes. */
export const VALUE_LISTS: readonly ValueList[] = [
  { table: 'golf_rounds', column: 'round_type', check: 'code', values: { practice: 'practice round', qualifier: 'team qualifier round', tournament: 'tournament round' }, player: true },
  { table: 'golf_rounds', column: 'status', check: 'code', values: { completed: 'finished; only these count', in_progress: 'still being played' } },
  { table: 'golf_qualifiers', column: 'selection_state', check: 'schema', values: { open: 'entries open', scoring: 'being played', closed: 'scoring closed, squad not confirmed', selected: 'squad confirmed by the coach' } },
  { table: 'golf_qualifier_selections', column: 'selection_type', check: 'schema', values: { top_score: 'on score', coach_pick: 'coach\'s pick' } },
  { table: 'golf_event_attendance', column: 'status', check: 'schema', values: { pending: 'no reply yet', accepted: 'coming', attending: 'coming', declined: 'not coming', not_attending: 'not coming', tentative: 'maybe', maybe: 'maybe', excused: 'excused', unexcused: 'not excused' } },
  { table: 'golf_event_attendance', column: 'attendance_status', check: 'schema', values: { present: 'was there', late: 'arrived late', no_show: 'did not come' } },
  { table: 'golf_goals', column: 'state', check: 'schema', values: { active: 'running', paused: 'paused', achieved: 'target reached', missed: 'ended short of the target', partial: 'ended part of the way', abandoned: 'dropped', pending_baseline: 'waiting for enough rounds to start' } },
  { table: 'golf_team_seasons', column: 'division', check: 'schema', values: { d1: 'NCAA Division I', d2: 'Division II', d3: 'Division III', naia: 'NAIA', njcaa: 'junior college', other: 'another association' } },
  { table: 'golf_tournaments', column: 'format', check: 'schema', values: { '5c4': 'five play, four count', '6c5': 'six play, five count', '6c4': 'six play, four count', custom: 'see players_per_team and counting', match: 'match play', medal_match: 'medal match play', individual: 'individuals only' } },
  { table: 'golf_tournament_entries', column: 'role', check: 'schema', values: { lineup: 'in the lineup', alternate: 'alternate', individual: 'playing as an individual' } },
  { table: 'golf_tournament_player_rounds', column: 'status', check: 'schema', values: { ok: 'the score stands', wd: 'withdrew', dq: 'disqualified', dq_pending: 'disqualification not confirmed' } },
];

/** What the app does not hold, or does not let you read. True of the schema: the test checks the "no column" claims against database.ts. */
export const NOT_RECORDED: readonly string[] = [
  'Club speed, ball speed, launch, spin and carry: nothing from a launch monitor is recorded.',
  'Which iron or wedge was hit: a shot\'s club is only driver, another club, or putter.',
  'Weather as figures: a round may carry a short weather note, and most do not. Wind speed, temperature, green speed and pin positions are not recorded.',
  'Why a shot was played, or what the player aimed at.',
  'Anything about a swing, a body, an injury, sleep or fitness. Strength training lives in a separate product you cannot read.',
  'Other teams\' players and their statistics.',
  'Rounds a player never entered into the app. A missing round is not a round that was not played.',
  'A published average for a college division: none is in the app.',
];
export const NOT_READABLE: readonly string[] = [
  'Messages and announcements (you can open a draft; you cannot read a thread).',
  'The contents of documents.',
  'Recruits and recruiting notes (you can add a recruit; you cannot read the list).',
  'A player\'s contact details, grades, class timetable, handicap and coach\'s private availability notes.',
];

/** Columns the "not recorded" lines claim golf tables do not have. The test fails if one appears on a golf table in database.ts. */
export const ABSENT_COLUMNS: readonly string[] = ['club_speed', 'swing_speed', 'ball_speed', 'launch_angle', 'spin_rate', 'carry_distance', 'wind_speed', 'temperature', 'green_speed', 'stimp', 'pin_position'];

export const PLAYER_NOT_AVAILABLE: readonly string[] = [
  'Any teammate\'s rounds, figures, standing or replies, and any team average or ranking: you can read only this player\'s own data.',
  'Qualifier boards, lineups and tournament results: their coach has those.',
  'Tasks, goals a coach keeps, causes behind a read, documents and messages.',
];
