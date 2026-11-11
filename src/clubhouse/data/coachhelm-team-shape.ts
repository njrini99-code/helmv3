import { plural } from '../lib/plural';
import type { ChLadderAreaId } from './coachhelm-ladder-shape';
import type { ChCoachHelmData, ChInsight, ChBoardMissing } from './coachhelm-shape';
import type { ChCoachBrief, ChBriefWorking } from './coachhelm-coach-brief-shape';
import { closesFor, type ChDeepInsight, type ChDiveTheme } from './coachhelm-dive-shape';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { AssembledThemes } from '@/lib/coachhelm/v3/themes/types';
import type { ChNotEnough } from './coachhelm-firm';
import type { ChTeamPatternRow, ChTeamPatterns } from './coachhelm-team-pattern';
import type { ChTrackRecord } from './coachhelm-track-record-shape';
import type { CourseHistory } from '@/lib/coachhelm/v3/team-board/course-shape';
import { TEAM_PATTERN_MIN_MEMBERS } from '@/lib/coachhelm/v3/team-pattern/pattern';

/** The coach's team board (the hole), pure and client-safe (coachhelm-team 02-PLAN 4.5). */
export type ChStation = ChLadderAreaId;
export const STATIONS: readonly ChStation[] = ['tee', 'approach', 'short_game', 'putting'];
/** Hollow coin under this many rounds on file (08 AC-HOLE-06, 04 section 8 H). */
export const TEAM_EARLY_ROUNDS = 5;

export interface ChTeamLeg {
  strokes: number | null;
  rounds: number;
  missing: string | null;
}

export interface ChTeamPlayer {
  id: string;
  name: string;
  first: string;
  classYear: string | null;
  rounds: number;
  early: boolean;
  legs: Record<ChStation, ChTeamLeg>;
  total: number | null;
  worst: ChStation | null;
  /**
   * Where the player stood over their first ten counted rounds this season (02-PLAN 9.2 B), by the legs' own maths; null unless they
   * have twenty or more counted rounds this season, so the trail's start and the dot (their last ten) never share a round.
   */
  first10: Record<ChStation, number | null> | null;
  reads: { needs: ChInsight[]; working: ChInsight[] };
  heldBack: number;
}

/**
 * What a read is worth, a round: the cascade's figure and what it closes the gap to (`closesFor`, coachhelm-dive-shape.ts), the one
 * function the Read page and the Player file print too. Never the engine's own `strokes_impact` (`ChInsight.stakes`), which was a
 * second number for the same read.
 */
export type ChReadWorth = NonNullable<ChDeepInsight['closes']>;

/** Each read's worth from one player's assembled themes, by read id; a read with no cascade cause has none, and nothing is drawn for it. */
export function worthByRead(readIds: readonly string[], themes: AssembledThemes | null): Record<string, ChReadWorth> {
  const out: Record<string, ChReadWorth> = {};
  for (const id of readIds) {
    const worth = closesFor({ id } as EvidenceInsight, themes);
    if (worth) out[id] = worth;
  }
  return out;
}

/** "Worth 0.4 a round, to the Tour": the sheet's words, naming what the gap is closed to as the file's sentence does. */
export function worthWords(worth: ChReadWorth): string {
  return `Worth ${worth.strokes} a round, to ${worth.anchor === 'team' ? 'the team' : 'the Tour'}`;
}

/** A part the board draws from when it lands: a value or a promise, like the pulse; failed says so with its own Try again. */
export type ChTeamPart<T> = { status: 'ok'; value: T } | { status: 'failed' };

export interface ChTourRow {
  id: 'scoring_par_3' | 'scoring_par_4' | 'scoring_par_5' | 'penalty_rate_per_round' | 'big_number_rate' | 'opening_hole_delta';
  /** Mean of each player's own value; null: "Not measured yet". */
  team: number | null;
  tour: number | null;
  n: number;
}

export interface ChTeamBoardData {
  off: ChCoachHelmData['off'];
  team: { name: string; tourKnown: boolean; baselineLabel: string };
  roster: { count: number; error: boolean };
  players: { list: ChTeamPlayer[]; error: boolean };
  /** Leg figures from the season's rounds; `error`: that read failed, and the hole says so. */
  legsError: boolean;
  stations: Record<ChStation, { team: number | null; n: number }>;
  /**
   * `strokes`: the one team figure over each player's last ten (`teamStrokesGained`). `rounds`: every counted round the board read
   * (a rolling year, `lastTenFloor`), which says whether there is anything to draw. `seasonRounds`: the counted rounds since the
   * season's first day, the only count the head may call "this season"; absent on a board built before it was carried.
   */
  teamTotal: { strokes: number | null; rounds: number; seasonRounds?: number };
  course: { history: CourseHistory | null; reads: ChInsight[]; against: ChTourRow[] | null };
  patterns?: ChTeamPatterns | null;
  /** off: nothing is drawn; failed: the card says so, never "no pattern" (W-TEAM-6). */
  patternsStatus?: 'ok' | 'off' | 'failed';
  notEnough?: ChNotEnough;
  missing?: ChBoardMissing;
  pulse: ChCoachHelmData['pulse'];
  /** Absent with their flags off (never an empty card); promises the hole doesn't wait on. */
  brief?: Promise<ChTeamPart<ChCoachBrief>> | ChTeamPart<ChCoachBrief>;
  record?: Promise<ChTeamPart<ChTrackRecord>> | ChTeamPart<ChTrackRecord>;
  themes?: Promise<ChTeamPart<Record<string, Record<string, ChDiveTheme>>>> | ChTeamPart<Record<string, Record<string, ChDiveTheme>>>;
  /** Each drawn read's worth, by read id, from the same theme reads as `themes` (so it lands when they do). Absent: nothing is drawn. */
  worth?: Promise<ChTeamPart<Record<string, ChReadWorth>>> | ChTeamPart<Record<string, ChReadWorth>>;
  /** By player name, as stories are: the newest round inside the week. */
  storyRounds?: Promise<ChTeamPart<Record<string, ChStoryRound>>> | ChTeamPart<Record<string, ChStoryRound>>;
}

export function worstOf(legs: Record<ChStation, ChTeamLeg>): ChStation | null {
  let worst: ChStation | null = null;
  for (const s of STATIONS) {
    const v = legs[s].strokes;
    if (v != null && v < 0 && (worst == null || v < (legs[worst].strokes as number))) worst = s;
  }
  return worst;
}

/**
 * The station figures from the one team figure (`teamStrokesGained`, data/stats-team-sg.ts): what the loader draws, so the hole and
 * Team stats' leg bars are one value over one window. `n` is how many players' rounds a station rests on. Never a stored `team_avg` (AC-HOLE-26).
 */
export function stationsOfTeamSg(sg: { legs: ReadonlyArray<number | null>; legPlayers: ReadonlyArray<number> }): ChTeamBoardData['stations'] {
  const out = {} as ChTeamBoardData['stations'];
  STATIONS.forEach((s, i) => {
    out[s] = { team: sg.legs[i] ?? null, n: sg.legs[i] == null ? 0 : (sg.legPlayers[i] ?? 0) };
  });
  return out;
}

/**
 * Station figures from players' own legs, for a board built without its rounds (a preview fixture, a test). Weighted by the rounds
 * behind each leg, which is the team figure's own pooling (`teamStrokesGained`) whenever every leg carries its count. The loader does
 * not call this: it reads the rounds themselves through `stationsOfTeamSg`.
 */
export function stationFigures(players: ReadonlyArray<Pick<ChTeamPlayer, 'legs'>>): ChTeamBoardData['stations'] {
  const out = {} as ChTeamBoardData['stations'];
  for (const s of STATIONS) {
    const xs = players.map((p) => p.legs[s]).filter((l): l is ChTeamLeg & { strokes: number } => l.strokes != null);
    const weight = xs.reduce((a, l) => a + Math.max(l.rounds, 0), 0);
    // A leg with no count behind it (an old fixture) weighs as one round, so a list of bare figures is still their mean.
    const w = (l: ChTeamLeg) => (weight > 0 ? Math.max(l.rounds, 0) : 1);
    const total = xs.reduce((a, l) => a + w(l), 0);
    out[s] = { team: total > 0 ? xs.reduce((a, l) => a + l.strokes * w(l), 0) / total : null, n: xs.length };
  }
  return out;
}

/** How many players the hole's figures rest on: the station most of them reach (a player can be at the floor on one leg only). */
export function boardPlayerCount(stations: ChTeamBoardData['stations']): number {
  return Math.max(0, ...STATIONS.map((s) => stations[s].n));
}

/** Beside the board's window: whose average the figures are. */
export function boardPlayerWords(n: number): string {
  return `average of ${plural(n, 'player')}`;
}

/**
 * The head's round count, in the only words each count allows: "62 rounds this season" for the counted rounds since the season's
 * first day, and "no rounds yet this season" for none. A board that carries no season count says the year its read covers instead,
 * never "this season" over a count that can start before it.
 */
export function boardRoundsWords(teamTotal: ChTeamBoardData['teamTotal']): string {
  if (teamTotal.seasonRounds == null) return teamTotal.rounds === 0 ? 'no rounds yet' : `${plural(teamTotal.rounds, 'round')} in the last year`;
  return teamTotal.seasonRounds === 0 ? 'no rounds yet this season' : `${plural(teamTotal.seasonRounds, 'round')} this season`;
}

/**
 * The hero for a board built without its rounds (a preview fixture, a test): the players' stored per-round totals, weighted by the
 * rounds in each player's window, never the sum of the legs (AC-HOLE-26, 8 K). The loader's hero is `teamStrokesGained(...).total`.
 */
export function teamTotalOf(players: ReadonlyArray<Pick<ChTeamPlayer, 'total'> & { rounds?: number }>): number | null {
  const xs = players.filter((p): p is typeof p & { total: number } => p.total != null);
  const counted = xs.every((p) => (p.rounds ?? 0) > 0);
  const w = (p: { rounds?: number }) => (counted ? (p.rounds as number) : 1);
  const total = xs.reduce((a, p) => a + w(p), 0);
  return total > 0 ? xs.reduce((a, p) => a + p.total * w(p), 0) / total : null;
}

/** Biggest loss first: "biggest leak", "second biggest", "third", "smallest". Unknown figures go last. */
export function stationOrder(stations: ChTeamBoardData['stations']): ChStation[] {
  return [...STATIONS].sort((a, b) => (stations[a].team ?? Infinity) - (stations[b].team ?? Infinity));
}

/** A spot's reads: findings only, current first, then out of date, the feed's own order within each (AC-SPOT-11). */
export function readsAt(players: readonly ChTeamPlayer[], station: ChStation): Array<{ player: ChTeamPlayer; read: ChInsight }> {
  const all = players.flatMap((player) => player.reads.needs.filter((r) => r.area === station).map((read) => ({ player, read })));
  return [...all.filter((x) => !x.read.stale), ...all.filter((x) => x.read.stale)];
}

/** The Course tab's reads: drawn findings with no station, in feed order (AC-COURSE-12). */
export function courseReads(players: readonly ChTeamPlayer[]): ChInsight[] {
  return players.flatMap((p) => p.reads.needs.filter((r) => r.area == null));
}

/** The shared pattern at a station, needing the engine's member floor. */
export function patternAt(patterns: ChTeamPatterns | null | undefined, station: ChStation): ChTeamPatternRow[] {
  return (patterns?.rows ?? []).filter((r) => r.area === station && (r.memberIds?.length ?? 0) >= TEAM_PATTERN_MIN_MEMBERS);
}

/** The huddle's point; null when any leg is missing (that player is named in the not-plotted note). */
export function huddlePoint(p: Pick<ChTeamPlayer, 'legs'>): { x: number; y: number } | null {
  const { tee, approach, short_game, putting } = p.legs;
  if (tee.strokes == null || approach.strokes == null || short_game.strokes == null || putting.strokes == null) return null;
  return { x: tee.strokes + approach.strokes, y: short_game.strokes + putting.strokes };
}

/** A player's newest round inside the week, for a read's story (AC-TODAY-04). Each hole's score against par; null where no score was kept. */
export interface ChStoryRound {
  date: string;
  course: string | null;
  holes: Array<{ n: number; toPar: number | null }>;
  /** Holes with shots kept (a putt count or a fairway or green call), said in the source line. */
  tracked: number;
}

export type ChTeamStory =
  | { kind: 'read'; id: string; who: string; line: string; href: string; body?: string | null }
  | { kind: 'working'; id: string; playerId: string | null; who: string; title: string; line: string; href: string; progress?: { from: number; now: number; target: number } | null }
  | { kind: 'theme'; id: string; playerId: string; who: string; word: 'Improving' | 'Slipping'; line: string };

/** Stories only from a structured source: the brief's rows, working rows and an Improving or Slipping theme. No round story, 9.3 A; "No clear change" never tells one. */
export function storiesOf(brief: ChCoachBrief | null, themes: Record<string, Record<string, ChDiveTheme>> | null, names: ReadonlyMap<string, string>): ChTeamStory[] {
  const out: ChTeamStory[] = [];
  for (const r of brief?.reads ?? []) if (r.kind === 'read') out.push({ kind: 'read', id: `read:${r.id}`, who: r.who, line: r.title, href: r.href, body: r.behind ?? r.next ?? null });
  for (const w of brief?.working ?? ([] as ChBriefWorking[])) out.push({ kind: 'working', id: `working:${w.id}`, playerId: w.playerId ?? null, who: w.who, title: w.title, line: w.line ?? w.title, href: w.href, progress: w.progress ?? null });
  for (const [playerId, byCat] of Object.entries(themes ?? {})) {
    for (const [cat, t] of Object.entries(byCat)) {
      const word = t.trend?.word;
      if (word !== 'Improving' && word !== 'Slipping') continue;
      out.push({ kind: 'theme', id: `theme:${playerId}:${cat}`, playerId, who: names.get(playerId) ?? 'Player', word, line: t.trend?.text ?? t.label });
    }
  }
  return out;
}

/** The context line's "reads drawn" count: reads the board actually draws, after the caps; never the signals count (AC-TEAM-22). */
export const readsDrawn = (players: readonly ChTeamPlayer[]): number => players.reduce((n, p) => n + p.reads.needs.length + p.reads.working.length, 0);
