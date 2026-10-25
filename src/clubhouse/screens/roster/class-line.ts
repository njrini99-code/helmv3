import type { ChClassDay } from '../../data/class-day-shape';
import { classLabel, classStatusFor, type ChClassStatus } from '../../data/class-status';
import type { ChRosterPlayer } from '../../data/roster';
import { availabilityLine } from './format';

/**
 * P-10 class awareness on Roster: the class line a player's face, list row, phone row and peek can carry. Pure: the
 * payload, the minute-tick instant and the text function (useClassText) go in, a map of lines comes out.
 *
 * Priority in the note slot, highest first: a confirmed trip (Travelling), then the player's availability word
 * (Injured, Away), then In class / In an exam / Class at, then the existing note ("Needs a look", form). A class line
 * never hides an injury; a trip is the more specific "away".
 *
 * Fail open: only players the payload holds, only active players, only a status with text. Anyone else has no line.
 */
export type RosterClassLine = {
  kind: Exclude<ChClassStatus['kind'], 'none'>;
  text: string;
  /** "From Theo's class schedule · STAT 201" for the peek; null when no class names it (a trip). */
  source: string | null;
};

export type RosterClassLines = ReadonlyMap<string, RosterClassLine>;

export const NO_CLASS_LINES: RosterClassLines = new Map();

/** "Theo’s", "James’": the possessive the peek's source uses. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

function sourceFor(status: ChClassStatus, firstName: string | null): string | null {
  if (status.kind === 'travelling' || status.kind === 'none') return null;
  const block = status.island.blocks[0];
  const whose = firstName ? `${possessive(firstName)} class schedule` : 'the class schedule';
  const label = block?.label ? classLabel(block.label) : '';
  return label ? `From ${whose} · ${label}` : `From ${whose}`;
}

export function rosterClassLines(
  day: ChClassDay | null,
  now: number | null,
  text: (status: ChClassStatus) => string | null,
  players: readonly Pick<ChRosterPlayer, 'id' | 'status'>[],
): RosterClassLines {
  if (!day || now == null || players.length === 0) return NO_CLASS_LINES;
  const active = new Set(players.filter((p) => p.status === 'active').map((p) => p.id));
  const out = new Map<string, RosterClassLine>();
  for (const dp of day.players) {
    if (!active.has(dp.playerId)) continue;
    const status = classStatusFor(dp, now);
    if (status.kind === 'none') continue;
    const line = text(status);
    if (!line) continue;
    out.set(dp.playerId, { kind: status.kind, text: line, source: sourceFor(status, dp.firstName) });
  }
  return out.size === 0 ? NO_CLASS_LINES : out;
}

/** What the lines say, as one string: equal strings are the same lines, so a minute tick that changes nothing changes nothing. */
export function classLinesSignature(lines: RosterClassLines): string {
  let s = '';
  for (const [id, l] of lines) s += `${id}|${l.kind}|${l.text}|${l.source ?? ''};`;
  return s;
}

/**
 * The class line a player's note slot should show, or null when something outranks it: their availability word
 * (unless the line is a trip) or no line at all.
 */
export function classNoteFor(p: Pick<ChRosterPlayer, 'availability'>, line: RosterClassLine | undefined): RosterClassLine | null {
  if (!line) return null;
  if (line.kind !== 'travelling' && availabilityLine(p)) return null;
  return line;
}
