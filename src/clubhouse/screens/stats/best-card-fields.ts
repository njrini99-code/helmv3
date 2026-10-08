import type { ChBests } from '../../data/stats-figures';
import type { ChViewer } from '../../data/stats-player';
import { formatToPar } from '../../lib/format';

/**
 * The personal-best card (P005-C2, owner 2026-10-08; sharing per D2-4): a quiet dated card of one best score (the
 * name, the score, the course, the date and the coach who attests it), drawn on a canvas and handed to the share
 * sheet. Minors' rule: no school or team name anywhere on it, and the player is their first name and last initial
 * unless the player is the one sharing it. Nothing is sent or posted: the share sheet is the player's or coach's.
 */
export interface ChBestCard {
  who: string;
  score: number;
  toPar: string | null;
  course: string;
  date: string;
  attest: string | null;
}

/** The card's fields. `name` is the player's full name; a coach's card says "Jonah O.", the player's own says it in full. */
export function bestCardFields(input: {
  viewer: ChViewer;
  name: string;
  bests: ChBests;
  coach: string | null | undefined;
}): ChBestCard | null {
  const s = input.bests.score;
  if (!s) return null;
  const parts = input.name.trim().split(/\s+/);
  const who = input.viewer === 'player' || parts.length < 2 ? input.name.trim() : `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.`;
  const tp = input.bests.toPar;
  // The best to par is its own round; it rides on this card only when it is the same round.
  const sameRound = tp && tp.course === s.course && tp.date === s.date;
  return {
    who,
    score: s.value,
    toPar: sameRound ? formatToPar(tp.value, 0) : null,
    course: s.course,
    date: s.date,
    attest: input.coach ? `Attested by ${input.coach}` : null,
  };
}

