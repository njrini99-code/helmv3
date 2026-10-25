import type { ChCalEvent } from './model';
import { roundOrderBreak, roundTitleParts, shortDay, teeText } from '../tournaments/fields/rounds-model';
import type { ChBarTarget, ChMoveTarget } from './drag-model';

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

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/**
 * P-5 6.4: a round dropped where it would start before the round ahead of it (or after the one behind it) is refused
 * before anything is asked or written, with the CH-6843 line. The check is roundOrderBreak, the same rule the editor and
 * the RPC use, on the rounds the calendar has; cancelled rounds don't count. Null when the drop keeps the order.
 */
export function roundMoveRefusal(e: ChCalEvent, to: ChMoveTarget | ChBarTarget, events: readonly ChCalEvent[]): string | null {
  const r = e.round;
  if (!r) return null;
  const rounds = events.filter((x) => x.round?.tournamentId === r.tournamentId).sort((a, b) => a.round!.roundNo - b.round!.roundNo);
  const list = rounds.map((x) =>
    x.id === e.id
      ? 'from' in to
        ? { date: to.from, tee: e.allDay || e.start == null ? null : hhmm(e.start), cancelled: x.cancelled }
        : { date: to.date, tee: hhmm(to.start), cancelled: x.cancelled }
      : { date: x.date, tee: x.allDay || x.start == null ? null : hhmm(x.start), cancelled: x.cancelled },
  );
  const br = roundOrderBreak(list);
  if (!br) return null;
  const n = (i: number) => rounds[i - 1]!.round!.roundNo;
  const [a, b] = [n(br.before), n(br.after)];
  if (b === r.roundNo) return `R${b} can’t move before R${a}. Move R${a} first.`;
  if (a === r.roundNo) return `R${a} can’t move after R${b}. Move R${b} first.`;
  return null;
}

/** P-5 6.4 / P-4 4.8: the round confirm's question, "Move Pinehurst Invitational R1 to Fri 6 Nov, 8:42 AM?". */
export function roundMoveQuestion(e: ChCalEvent, to: ChMoveTarget | ChBarTarget, clock: '12' | '24' = '12'): string {
  const r = e.round;
  const what = r ? `${r.name} R${r.roundNo}` : e.title;
  if ('from' in to) return `Move ${what} to ${shortDay(to.from)}?`;
  return `Move ${what} to ${shortDay(to.date)}, ${teeText(hhmm(to.start), clock)}?`;
}
