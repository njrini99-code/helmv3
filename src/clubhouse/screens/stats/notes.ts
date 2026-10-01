import type { ChTeamStats } from '../../data/stats-team';
import { roundsWord } from '../../data/stats-filter';

/** "2 countable rounds", or with nine-hole rounds in, "3 countable rounds, 2.5 counting 9-hole rounds as half" (the early-read floors count whole rounds). */
export function countWords(raw: number, whole: number): string {
  const base = `${raw} countable ${raw === 1 ? 'round' : 'rounds'}`;
  return whole === raw ? base : `${base}, ${roundsWord(whole)} counting 9-hole rounds as half`;
}

/** "2 of 3 rounds with shots", and the whole-round count when a 9-hole round makes it differ. */
export function shotsWords(raw: number, total: number, whole: number): string {
  return `${raw} of ${total} rounds with shots${whole === raw ? '' : ` (${roundsWord(whole)} counting 9-hole rounds as half)`}`;
}

/** The putting note under the team's make rates, shared by desktop and the phone: which bands are below the Tour. */
export function puttingNote(all: NonNullable<ChTeamStats['putting']>['bands']): string {
  // Grade only the bands the rings draw.
  const bands = all.slice(0, 5);
  const graded = bands.filter((b) => b.bench != null && b.attempts >= 10);
  const below = graded.filter((b) => (b.made / b.attempts) * 100 < b.bench!);
  if (!graded.length) return 'Bands grade against the Tour once they have 10 or more putts.';
  if (!below.length) return 'Every graded band is at or above the Tour make rate.';
  if (below.length === 1) return `${below[0]!.label.replace('–', ' to ').replace(' ft', ' feet')} is the only band below the Tour make rate.`;
  return `${below.length} bands are below the Tour make rate: ${below.map((b) => b.label).join(', ')}.`;
}
