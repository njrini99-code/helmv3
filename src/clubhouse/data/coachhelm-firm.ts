import { rankFactorsFromEvidence } from '@/lib/coachhelm/v3/effectiveness/exposure-rows';
import { supportOf } from './coachhelm-engine-shape';
import { readTextFor, speak, type ChViewer } from './coachhelm-voice';

/**
 * The coach board shows only reads at Working hypothesis or firmer (decided 2026-10-21, round 2C): a read the support pass rated
 * "Not enough yet" is not a card. Those reads sit in one collapsed line, "Not enough yet (N)", under the board, which opens in place
 * to each read's title and what it is waiting for. Only with `coachhelm_support_v1` on, because only then does the row carry a
 * ladder; with it off the board is exactly what it was. A read the pass has not rated (no `evidence.ladder`) is not held back.
 * Player surfaces are not touched: the player feed drops the ladder and never reads this.
 *
 * Pure: reads in, the split out. The delivery's own rank still picks each player's head; only a head rated Not enough yet is
 * replaced, by the player's firmest other read (03 §2.2: strokes at stake times the rung weight), so the board never reranks
 * reads that were already firm.
 */

/** A read held back, as the line lists it. */
export interface ChNotEnoughRead {
  id: string;
  /** The read's title in the coach's voice. */
  title: string;
  /** "Watching: 28 attempts so far. 12 more and this read can say something." Null when the row carries no support field. */
  watching: string | null;
}

/** A player's reads held back. `card`: the player still has a card on the board (a firm read); false when every read is held back. */
export interface ChNotEnoughPlayer {
  id: string;
  name: string;
  card: boolean;
  reads: ChNotEnoughRead[];
}

/** Every read the board held back, by player, roster order. Absent from the board data with the flag off or none held back. */
export interface ChNotEnough {
  count: number;
  players: ChNotEnoughPlayer[];
}

interface Rated {
  id: string;
  evidence: unknown;
}

const ladderOf = (evidence: unknown): string | null => {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  const l = (evidence as Record<string, unknown>).ladder;
  return typeof l === 'string' ? l : null;
};

/** The support pass rated this read Not enough yet. */
export const isNotEnoughYet = (evidence: unknown): boolean => ladderOf(evidence) === 'not_enough_yet';

/** Strokes at stake times the rung weight (03 §2.2); 0 when the read carries neither. Only orders a replacement head. */
const firmness = (evidence: unknown): number => {
  const f = rankFactorsFromEvidence(evidence, { score: undefined, position: 0, surface: 'coach_board' });
  if (!f) return 0;
  return (f.S ?? 0) * f.R + f.R / 100;
};

/**
 * One player's reads split for the board: the head it draws, and the reads held back. `head` is the delivery's ranked head;
 * `rest` the player's other visible reads (it may repeat the head). With `on` false nothing is held back and the head is kept.
 */
export function splitFirm<T extends Rated>(head: T | undefined, rest: readonly T[], on: boolean): { head: T | null; held: T[] } {
  if (!on) return { head: head ?? null, held: [] };
  const seen = new Set<string>();
  const all: T[] = [];
  for (const r of head ? [head, ...rest] : rest) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    all.push(r);
  }
  const held = all.filter((r) => isNotEnoughYet(r.evidence));
  // No head is no card, as before: a player the delivery drew nothing for is not given one here.
  if (!head) return { head: null, held };
  if (!isNotEnoughYet(head.evidence)) return { head, held };
  // The head was held back: the firmest other read leads, the first of equals in the order the reads came.
  let best: T | null = null;
  let bestScore = -1;
  for (const r of all) {
    if (isNotEnoughYet(r.evidence)) continue;
    const s = firmness(r.evidence);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return { head: best, held };
}

/** A held-back read as the line lists it, in the coach's voice. */
export function notEnoughRead(ins: Rated & { title: string; content?: string }, viewer: ChViewer): ChNotEnoughRead {
  // chs-40: the stored coach copy's title when the row has one (`readTextFor`), else the row's own through `speak`.
  const title = readTextFor({ title: ins.title, content: ins.content ?? '', evidence: ins.evidence }, viewer.role === 'coach').title;
  return { id: ins.id, title: speak(title, viewer), watching: supportOf(ins.evidence, viewer)?.watching ?? null };
}

/** The board's held-back reads from each player's, or undefined when none is held back. */
export function notEnoughOf(players: readonly ChNotEnoughPlayer[]): ChNotEnough | undefined {
  const withReads = players.filter((p) => p.reads.length > 0);
  if (withReads.length === 0) return undefined;
  return { count: withReads.reduce((n, p) => n + p.reads.length, 0), players: withReads };
}
