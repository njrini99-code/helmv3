import type { ChLadderAreaId } from './coachhelm-ladder-shape';
import type { ChCoachHelmData, ChInsight, ChBoardMissing } from './coachhelm-shape';
import type { ChCoachBrief, ChBriefWorking } from './coachhelm-coach-brief-shape';
import type { ChDiveTheme } from './coachhelm-dive-shape';
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
  /** 02-PLAN 9.2 option A: no trails, so always null. */
  first10: Record<ChStation, number | null> | null;
  reads: { needs: ChInsight[]; working: ChInsight[] };
  heldBack: number;
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
  teamTotal: { strokes: number | null; rounds: number };
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
}

export function worstOf(legs: Record<ChStation, ChTeamLeg>): ChStation | null {
  let worst: ChStation | null = null;
  for (const s of STATIONS) {
    const v = legs[s].strokes;
    if (v != null && v < 0 && (worst == null || v < (legs[worst].strokes as number))) worst = s;
  }
  return worst;
}

/** Station figures: the mean of the current roster's legs, never a stored `team_avg` (AC-HOLE-26). */
export function stationFigures(players: ReadonlyArray<Pick<ChTeamPlayer, 'legs'>>): ChTeamBoardData['stations'] {
  const out = {} as ChTeamBoardData['stations'];
  for (const s of STATIONS) {
    const xs = players.map((p) => p.legs[s].strokes).filter((v): v is number => v != null);
    out[s] = { team: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, n: xs.length };
  }
  return out;
}

/** The hero: the team mean of stored per-round totals, never the sum of the legs (AC-HOLE-26, 8 K). */
export function teamTotalOf(players: ReadonlyArray<Pick<ChTeamPlayer, 'total'>>): number | null {
  const xs = players.map((p) => p.total).filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
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

export type ChTeamStory =
  | { kind: 'read'; id: string; who: string; line: string; href: string }
  | { kind: 'working'; id: string; playerId: string | null; who: string; line: string; href: string }
  | { kind: 'theme'; id: string; playerId: string; who: string; word: 'Improving' | 'Slipping'; line: string };

/** Stories only from a structured source: the brief's rows, working rows and an Improving or Slipping theme. No round story, 9.3 A; "No clear change" never tells one. */
export function storiesOf(brief: ChCoachBrief | null, themes: Record<string, Record<string, ChDiveTheme>> | null, names: ReadonlyMap<string, string>): ChTeamStory[] {
  const out: ChTeamStory[] = [];
  for (const r of brief?.reads ?? []) if (r.kind === 'read') out.push({ kind: 'read', id: `read:${r.id}`, who: r.who, line: r.title, href: r.href });
  for (const w of brief?.working ?? ([] as ChBriefWorking[])) out.push({ kind: 'working', id: `working:${w.id}`, playerId: w.playerId ?? null, who: w.who, line: w.line ?? w.title, href: w.href });
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
