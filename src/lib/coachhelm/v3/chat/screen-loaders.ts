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
 *   qualifierList      loadQualifierList({ role, teamId, playerId, mode: 'all' })     src/clubhouse/data/qualifiers.ts
 *   qualifierBoard     loadQualifierDetail({ role, teamId, playerId, qualifierId })   src/clubhouse/data/qualifiers.ts
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
  win: { rounds: number; avg: number | null; toPar: number | null; sgPerRound: number | null; sgRounds: number; sgLegs: Legs; holeRounds: number; lastRoundDate: string | null };
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
  /** The Qualifiers list. */
  qualifierList?: () => Promise<QualifierListScreen | null>;
  /** One qualifier's board. */
  qualifierBoard?: (qualifierId: string) => Promise<QualifierBoardScreen | null>;
}

/** The loaders on a tool context, whatever the engine's own (narrower) declaration of them says. */
export const screenLoaders = (ctx: { loaders: unknown }): ScreenLoaders => (ctx.loaders ?? {}) as ScreenLoaders;
