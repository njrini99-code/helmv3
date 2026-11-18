import type { ChTeamStats } from '../../data/stats-team';
import { roundsWord } from '../../data/stats-filter';
import { pluralWord } from '../../lib/plural';
import { FLOORS } from '../../lib/stats-signal';
import { puttBelowTour, puttGraded } from './putt-bands';

/** Putts a band needs before it grades against the Tour: the make floor's steady read, as the Putting bands chart (CH-18). */
const PUTT_GRADE_FLOOR = FLOORS.make.early;

/** C-24(f), CH-5213: the profile's round cache didn't load, so its figures are missing, never "no data" (a dash read as an empty sample). */
export const CACHE_ERROR = {
  title: 'Some round figures didn’t load.',
  body: 'Scores and strokes gained are correct; fairways, greens, putts and scrambling are missing. Try again.',
};

/** "2 countable rounds", or with nine-hole rounds in, "3 countable rounds, 2.5 counting 9-hole rounds as half" (the early-read floors count whole rounds). */
export function countWords(raw: number, whole: number): string {
  const base = `${raw} countable ${pluralWord(raw, 'round')}`;
  return whole === raw ? base : `${base}, ${roundsWord(whole)} counting 9-hole rounds as half`;
}

/** "2 of 3 rounds with shots", and the whole-round count when a 9-hole round makes it differ. */
export function shotsWords(raw: number, total: number, whole: number): string {
  return `${raw} of ${total} rounds with shots${whole === raw ? '' : ` (${roundsWord(whole)} counting 9-hole rounds as half)`}`;
}

/** The putting note under the team's make rates, shared by desktop and the phone: which bands are below the Tour. */
export function puttingNote(bands: NonNullable<ChTeamStats['putting']>['bands']): string {
  // The rings draw every band and grade on the Putting bands chart's rule (CH-18): 30 putts, the rate against the Tour.
  const graded = bands.filter(puttGraded);
  const below = graded.filter(puttBelowTour);
  if (!graded.length) return `Bands grade against the Tour once they have ${PUTT_GRADE_FLOOR} or more putts.`;
  if (!below.length) return 'Every graded band is at or above the Tour make rate.';
  // A no-break space keeps each distance's unit on its line ("5–10 ft", never "5–10" then "ft").
  if (below.length === 1) return `${below[0]!.label.replace('–', ' to ').replace(' ft', '\u00a0feet')} is the only band below the Tour make rate.`;
  return `${below.length} bands are below the Tour make rate: ${below.map((b) => b.label.replace(' ft', '\u00a0ft')).join(', ')}.`;
}

/** Strokes a round: the change in form (newer half of the rounds against the older) that counts as a move, not as holding steady. */
export const FORM_STEADY = 0.5;
