/**
 * ============================================================================
 * Team intelligence: the payload behind CoachHelm Home
 * ----------------------------------------------------------------------------
 * One read of the team's countable rounds this season plus every tracked
 * shot in them, shaped for the Home page to slice on the client (round type,
 * window, theme, player) without another round trip.
 *
 * Strokes gained per round per category is the round's STORED figure
 * (`golf_rounds.strokes_gained_*`, the same numbers the stats cache
 * averages), never recomputed here, so a player's SG on Home matches the
 * stats pages. Shot rows are only used for the "why" visuals (where drives
 * finish, approach proximity, up-and-downs, putting), never to re-derive SG.
 *
 * Plain module (no 'use client' / 'use server'): the server loader builds it
 * and the client components read it.
 * ========================================================================== */

export const INTEL_THEMES = ['tee', 'app', 'atg', 'putt'] as const;
export type IntelTheme = (typeof INTEL_THEMES)[number];

export const INTEL_ROUND_TYPES = ['practice', 'qualifier', 'tournament'] as const;
export type IntelRoundType = (typeof INTEL_ROUND_TYPES)[number] | 'other';

export interface IntelPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface IntelRound {
  id: string;
  playerId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  type: IntelRoundType;
  /** Stored SG per category for this round; null when the round has none. */
  sg: Record<IntelTheme, number | null>;
}

/** Where a tee shot finished. Penalty wins over the lie it came to rest in;
 *  `miss` is off the fairway with no side tagged. */
export type TeeZone = 'fairway' | 'left' | 'right' | 'miss' | 'penalty';

export interface TeeShot {
  /** Index into `TeamIntelligenceData.rounds` (the round, and so the player). */
  ri: number;
  zone: TeeZone;
  /** Carry + roll in yards, when measurable. */
  yards: number | null;
}

/** The approach entry control's eight directions (ApproachMissSelector). */
export type ApproachMiss =
  | 'short'
  | 'long'
  | 'left'
  | 'right'
  | 'short_left'
  | 'short_right'
  | 'long_left'
  | 'long_right';

export interface ApproachShot {
  /** Index into `TeamIntelligenceData.rounds` (the round, and so the player). */
  ri: number;
  /** Distance to the hole before the shot, yards. */
  fromYards: number;
  onGreen: boolean;
  /** Distance to the hole after the shot, feet (proximity). */
  leaveFeet: number | null;
  /** The tagged miss direction, all eight ways; null for greens hit or
   *  untagged misses. With `leaveFeet` it places the miss around the pin:
   *  the distance is measured, the direction is one of eight. */
  miss: ApproachMiss | null;
}

export type ChipLie = 'fairway' | 'rough' | 'sand';

export interface ChipShot {
  /** Index into `TeamIntelligenceData.rounds` (the round, and so the player). */
  ri: number;
  fromYards: number;
  lie: ChipLie;
  /** First chip's leave, feet; null when it did not finish on the green. */
  leaveFeet: number | null;
  /** Up and down: the hole was finished within one more stroke. */
  saved: boolean;
  /** Tagged miss direction when the chip missed the green or was tagged. */
  miss: ApproachMiss | null;
}

export type PuttBreak = 'rl' | 'st' | 'lr';
export type PuttSlope = 'up' | 'level' | 'down';

export interface PuttShot {
  /** Index into `TeamIntelligenceData.rounds` (the round, and so the player). */
  ri: number;
  feet: number;
  made: boolean;
  /** The first putt on its hole (3-putt and lag reads use only these). */
  first: boolean;
  /** Set on a first putt: the hole took three or more putts. */
  threePutt: boolean;
  brk: PuttBreak | null;
  slope: PuttSlope | null;
  /** Miss sides, from the tagged miss direction; null when made or untagged. */
  side: 'low' | 'high' | null;
  depth: 'short' | 'long' | null;
  /** A missed putt's leave: the next putt's length, feet (measured). */
  leaveFeet: number | null;
}

/** The engine's live counterfactual for one theme, when it has one (read
 *  client-side from the category insights the page already loads). */
export interface IntelStrokesAvailable {
  perRound: number;
  message: string;
}

export interface TeamIntelligenceData {
  teamId: string;
  /** "PGA Tour" / "LPGA": the baseline the stored SG is read against. */
  baselineLabel: string;
  /** ISO date the page was built for (the team's today). */
  today: string;
  players: IntelPlayer[];
  rounds: IntelRound[];
  tee: TeeShot[];
  approach: ApproachShot[];
  chips: ChipShot[];
  putts: PuttShot[];
}

export type TeamIntelligenceResult =
  | { success: true; data: TeamIntelligenceData }
  | { success: false; error: string };
