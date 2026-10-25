import type { ChCalEvent } from './model';
import { roundTitleParts } from '../tournaments/fields/rounds-model';

/**
 * P-5 4.9: how a tournament round reads on the calendar. With a round ref the block shows the tournament's name and a
 * round pill (`R2`), the agenda a trailing `R2 of 3`, and the accessible name adds ", round 2 of 3" (", cancelled" when
 * it is). Without a ref (the flag off, or the refs failed to load) every part is the stored title, unchanged.
 */
export interface ChRoundLabel {
  /** The name to draw: the tournament's name with a ref, the stored title without. */
  name: string;
  round: number | null;
  /** "R2 of 3", or null. */
  caption: string | null;
  /** ", round 2 of 3" (+ ", cancelled"), or "". */
  spoken: string;
  /** ", round 2 of 3" alone, for a name that already says cancelled. */
  spokenRound: string;
}

export function roundLabel(e: Pick<ChCalEvent, 'round' | 'cancelled'>, title: string): ChRoundLabel {
  const { name, round } = roundTitleParts(title, e.round);
  if (round == null || !e.round) return { name, round: null, caption: null, spoken: '', spokenRound: '' };
  const of = e.round.roundsCount;
  const spokenRound = `, round ${round} of ${of}`;
  return { name, round, caption: `R${round} of ${of}`, spoken: `${spokenRound}${e.cancelled ? ', cancelled' : ''}`, spokenRound };
}

/** P-5 4.9: a block shorter than this drops the pill and keeps ` · R1` in its title. */
export const ROUND_PILL_MIN_PX = 28;

/**
 * A chip's or bar's title (month, the week's all-day lane): the name, then ` R1` after it, kept whole while the name
 * ellipsizes. No pill at this size (P-5 4.9).
 */
export function RoundTitle({ e, title }: { e: Pick<ChCalEvent, 'round' | 'cancelled'>; title: string }) {
  const rl = roundLabel(e, title);
  if (rl.round == null) return <span>{title}</span>;
  return (
    <>
      <span>{rl.name}</span>
      <span className="ch-rn ch-num">{`R${rl.round}`}</span>
    </>
  );
}
