/**
 * CoachHelm chat: the Clubhouse screens' loaders, as the tools see them.
 *
 * One number, one source: a figure a screen draws is read through the loader that screen calls, for the same window.
 * `src/lib` may not import `src/clubhouse`, so the route (app layer) binds the real functions and hands them in on
 * `ToolContext.loaders`. The shapes below are the parts of each loader's return value the tools read, written
 * structurally: the real return types (`ChPlayerProfile`, `ChTeamStats`, `ChRoster`, `ChTeamRounds`, `ChQList`,
 * `ChQDetailLoad`) are assignable to them, so a field renamed in a loader is a type error where the route binds it.
 *
 * What the route binds (each wrapped so a throw resolves to null: a failed read is reported as failed, never as empty):
 *
 *   playerFigures      loadPlayersFigures(sb, { timezone }, ids, window)              src/clubhouse/data/player-figures.ts
 *   puttBands          loadPlayerPuttBands(sb, { timezone }, id, window)              src/clubhouse/data/player-figures.ts
 *   teamStrokesGained  loadTeamStrokesGained(sb, { timezone, playerIds }, window)     src/clubhouse/data/team-sg.ts
 *   playerStats        loadPlayerProfile({ viewer, teamId, playerId, window: w === 'season' ? 'season' : 'last10',
 *                        filter: filterForFigureWindow(w) })                          src/clubhouse/data/stats-player.ts
 *   teamStats          loadTeamStats({ teamId, window: w === 'season' ? 'season' : 'last10',
 *                        filter: filterForFigureWindow(w) })                          src/clubhouse/data/stats-team.ts
 *   roster             loadRoster({ teamId, coachId })                                src/clubhouse/data/roster.ts
 *   teamRounds         loadTeamRounds({ teamId })                                     src/clubhouse/data/team-rounds.ts
 *   myRounds           loadRoundsLibrary({ playerId, teamId })                        src/clubhouse/data/rounds.ts
 *                        a player only: their own Rounds page, bound to the signed-in player's id
 *   qualifierList      loadQualifierList({ role, teamId, playerId })     src/clubhouse/data/qualifiers.ts
 *   qualifierBoard     loadQualifierDetail({ role, teamId, playerId, qualifierId })   src/clubhouse/data/qualifiers.ts
 *   roundReview        loadRoundReview(roundId, viewer)                               src/clubhouse/data/round-review.ts
 *                        viewer: { role: 'coach', teamId } or { role: 'player', playerId, teamId }
 *   tournaments        loadTournamentsHome(await tourContext({ role: 'coach', teamId }))  src/clubhouse/data/tournaments.ts
 *                        coach only, and only while golf_tournaments_v1 is on
 *
 * Not bound, and why: a course. The Course page's loader (`loadCourseHistory`) is one player's history at a course, keyed by the Rounds
 * page's course key and a window; `get_reference` topic course answers the team's scoring by hole for a course id, which no screen draws.
 *
 * `viewer` and `role` are the signed-in person's: a player's Stats page has no team column and a player's qualifier
 * board is the one a player sees, so the screen's own privacy rule travels with the loader.
 * Every loader is optional: a tool whose loader is missing says the figure could not be read.
 */
import type { TeamSgSource } from './practice-reads';
import type { FigureWindow, PlayerFiguresSource, PuttBandsSource } from './read-tools';

/** The windows the Stats pages offer: each player's newest 5, 10 or 20 rounds that count, or this season. */
export type StatsWindow = FigureWindow;
export const STATS_WINDOWS = ['last5', 'last10', 'last20', 'season'] as const;

type Legs = { tee: number | null; approach: number | null; around: number | null; putting: number | null };

/** One row of the Stats page's comparison table: the player, the team over the same window, and the Tour. */
export interface StatsComparisonRow {
  label: string;
  group: string;
  you: number | null;
  team: number | null;
  bench: number | null;
  unit: '' | '%' | ' ft';
  digits: number;
  lowerIsBetter: boolean;
  signed?: boolean;
  /** Why there is no value yet ("Needs 20 putts"). */
  floor?: string;
  early?: string;
}

export interface StatsPuttBand {
  label: string;
  made: number;
  attempts: number;
  bench: number | null;
}

export interface StatsRoundRow {
  id: string;
  course: string;
  date: string;
  iso?: string;
  type: 'practice' | 'qualifier' | 'tournament' | null;
  holes: number;
  score: number;
  toPar: number | null;
  fairwaysPct: number | null;
  girPct: number | null;
  scramblePct: number | null;
  putts: number | null;
  sg: number | null;
  sgLegs: [number | null, number | null, number | null, number | null];
}

/** Stats, one player (`loadPlayerProfile`). */
export interface PlayerStatsScreen {
  name: string;
  win: {
    rounds: number;
    avg: number | null;
    toPar: number | null;
    sgPerRound: number | null;
    sgRounds: number;
    sgLegs: Legs;
    holeRounds: number;
    lastRoundDate: string | null;
    /** How many of `sgRounds` had shots logged; the rest are estimated from the scorecard. Optional until the Stats loader exposes it: absent, nothing is printed. */
    sgShotRounds?: number;
  };
  /** The baseline this page's strokes gained is measured against, as the loader chose it (`SgBaselineKey`). Optional: absent, the reader takes the team's default from its gender. */
  sgBaseline?: 'pga_tour' | 'womens';
  season: { rounds: number; avg: number | null; toPar: number | null };
  teamAvg: number | null;
  puttBands: StatsPuttBand[] | null;
  rounds: StatsRoundRow[];
  comparisons: StatsComparisonRow[];
  extra: {
    toughest: { holes: Array<{ hole: number; par: number; avgToPar: number; plays: number; doublePlus: number }>; belowFloor: boolean; minPlays: number } | null;
    pressure: { gap: number | null; pressureRounds: number; practiceRounds: number };
    opening: { delta: number | null; rounds: number } | null;
    approach: Array<{ label: string; value: number | null; bench: number | null; shots: number; belowFloor: boolean; greenHitPct: number | null }> | null;
    holesError: boolean;
    approachError: boolean;
    puttsError: boolean;
    truncated: boolean;
  };
  roundsError: boolean;
  statsError: boolean;
  cacheError: boolean;
}

/** Team Stats (`loadTeamStats`). `legs` and `legTotals` run off the tee, approach, around the green, putting. */
export interface TeamStatsScreen {
  teamName: string;
  activeCount: number;
  roundCount: number;
  figures: Array<{ key: string; label: string; value: number | null; unit: '' | '%'; digits: number; delta: number | null; lowerIsBetter: boolean; context: string; note?: string }>;
  team: { sgMean: number | null; scoreMean: number | null };
  grid: Array<{ id: string; name: string; rounds: number; legs: Array<number | null>; total: number | null; change: number | null; avg: number | null; last?: { score: number; toPar: number | null; label: string } | null }>;
  legTotals: Array<number | null>;
  putting: { bands: StatsPuttBand[]; putts: number } | null;
  bests: Array<{ label: string; playerId: string; name: string; value: string; meta: string }>;
  sgRounds: number;
  /** As on `PlayerStatsScreen`: how many of `sgRounds` had shots logged, and the baseline the loader used. Both optional. */
  sgShotRounds?: number;
  sgBaseline?: 'pga_tour' | 'womens';
  roundsError: boolean;
  cacheError: boolean;
  puttsError: boolean;
}

/** Roster (`loadRoster`): each player's season, by Roster's rule (full rounds that count since 1 August, practice out). */
export interface RosterScreen {
  teamName: string;
  season: string | null;
  players: Array<{ id: string; name: string; status: 'active' | 'inactive'; rounds: number; avg: number | null; sgPerRound: number | null; sgLegs: Legs; trend: number[]; form: string }>;
  playersError: boolean;
  statsError: boolean;
  teamAvg: number | null;
}

export interface TeamRoundRow {
  id: string;
  date: string;
  course: string;
  type: 'practice' | 'tournament' | 'qualifier' | null;
  holes: number;
  score: number;
  toPar: number | null;
  putts: number | null;
  countable: boolean;
  playerId: string;
  player: string;
}

/**
 * Rounds, a player's own page (`loadRoundsLibrary`): every finished round they posted, practice included, and the ones still in
 * progress (the page reads at most 20 of those). `rounds.error`: the list did not load; it is never "no rounds".
 */
export interface MyRoundsScreen {
  rounds: { list: Array<Omit<TeamRoundRow, 'playerId' | 'player'> & { totalOnly?: boolean }>; error: boolean; unscored?: number };
  unfinished: { list: Array<{ id: string; date: string; course: string; type: TeamRoundRow['type']; holes: number }>; error: boolean };
}

/** Rounds, the team's list (`loadTeamRounds`). */
export interface TeamRoundsScreen {
  seasonStart: string;
  rounds: { list: TeamRoundRow[]; error: boolean; unscored?: number };
  rosterError: boolean;
  season: { rounds: number; players: number; avg: number | null; underPar: number; best: { score: number; toPar: number | null; player: string; course: string; date: string } | null };
}

/** Qualifiers, the list (`loadQualifierList`). */
export interface QualifierListScreen {
  items: Array<{
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string | null;
    course: string | null;
    numRounds: number;
    squad: number;
    picks: number;
    entrants: number;
    submitted: number;
    leaders: Array<{ playerId: string; name: string; position: string; played: number; toPar: number | null; move: number | null }>;
  }>;
  listError: boolean;
  standingsError: boolean;
}

/** Qualifiers, one board (`loadQualifierDetail`): the rows in the board's own order. */
export interface QualifierBoardScreen {
  id: string;
  name: string;
  status: string;
  selectionState: string;
  startDate: string;
  endDate: string | null;
  numRounds: number;
  squad: number;
  picks: number;
  entrants: number;
  board: {
    rows: Array<{ playerId: string; name: string; position: number | null; tied: boolean; played: number; toPar: number | null; total: number | null; avg: number | null; shortRounds: number; state: string | null }>;
    unscored: Array<{ playerId: string; name: string }>;
  } | null;
  selections: Array<{ playerId: string; name: string; type: string; reasoning: string | null }> | null;
  entriesError: boolean;
  roundsError: boolean;
}

/** The Round page (`loadRoundReview`): one round as the review draws it. */
export interface RoundReviewScreen {
  /** The baseline this round's strokes gained is measured against, as the loader chose it. Optional. */
  sgBaseline?: 'pga_tour' | 'womens';
  id: string;
  playerId: string;
  playerName: string | null;
  date: string;
  course: string;
  type: string | null;
  holesPlayed: number;
  score: number | null;
  toPar: number | null;
  front: { score: number | null; toPar: number | null };
  back: { score: number | null; toPar: number | null };
  putts: number | null;
  fairways: { hit: number; of: number } | null;
  greens: { hit: number; of: number } | null;
  strokesGained: { total: number | null; tee: number | null; approach: number | null; around: number | null; putting: number | null } | null;
  recap: string | null;
  notes: string | null;
  coachNote: string | null;
  holes: Array<{ n: number; par: number | null; yards: number | null; score: number | null; putts: number | null; fairway: boolean | null; gir: boolean | null; penalties: number }>;
  holesError: boolean;
}
export type RoundReviewLoad = { kind: 'ok'; review: RoundReviewScreen } | { kind: 'notFound' } | { kind: 'inProgress' } | { kind: 'error' };

/** The Tournaments season home (`loadTournamentsHome`): every event of the seasons shown, oldest first. */
export interface TournamentsScreen {
  players: Array<{ id: string; name: string }>;
  events: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    /** As the screen holds it: how many play, how many count, over how many holes (`TourFormat`). */
    format: { kind: string; players: number; counting: number; holes: number };
    kind: string;
    status: string;
    cancelled?: boolean;
    legacy: boolean;
    rounds: Array<{ number: number; date: string; status: string; par: number }>;
    playerRounds: Array<{ roundNumber: number; playerId: string; total: number | null; toPar: number | null; status: string }>;
    finish: { place: string; placeN: number; of: number } | null;
    lineup: { status: string; set: number; of: number };
  }>;
  errors: { events?: true };
}
export type TournamentsLoad = { kind: 'ready'; data: TournamentsScreen } | { kind: 'not_set_up' } | { kind: 'missing' } | { kind: 'failed' };

export interface ScreenLoaders {
  /** Stats' per-player figures for a window, with the team's pooled figures beside them. */
  playerFigures?: PlayerFiguresSource;
  /** Stats' six putting bands for one player and window. */
  puttBands?: PuttBandsSource;
  /** Team Stats' strokes gained for a window. */
  teamStrokesGained?: TeamSgSource;
  /** The Stats page of one player for a window. Null: it could not be read, or the player is not on the team. */
  playerStats?: (playerId: string, window: StatsWindow) => Promise<PlayerStatsScreen | null>;
  /** The Team Stats page for a window. */
  teamStats?: (window: StatsWindow) => Promise<TeamStatsScreen | null>;
  /** The Roster page: each player's season. */
  roster?: () => Promise<RosterScreen | null>;
  /** The Rounds page's team list. */
  teamRounds?: () => Promise<TeamRoundsScreen | null>;
  /** The signed-in player's own Rounds page. Bound for a player only. */
  myRounds?: () => Promise<MyRoundsScreen | null>;
  /** The Qualifiers list. */
  qualifierList?: () => Promise<QualifierListScreen | null>;
  /** One qualifier's board. */
  qualifierBoard?: (qualifierId: string) => Promise<QualifierBoardScreen | null>;
  /** One round as the Round page draws it, for the signed-in viewer. */
  roundReview?: (roundId: string) => Promise<RoundReviewLoad | null>;
  /** The Tournaments season home. */
  tournaments?: () => Promise<TournamentsLoad | null>;
}

/** The loaders on a tool context, whatever the engine's own (narrower) declaration of them says. */
export const screenLoaders = (ctx: { loaders: unknown }): ScreenLoaders => (ctx.loaders ?? {}) as ScreenLoaders;
