import type { ChTeamStats } from '../../data/stats-team';

/** The putting note under the team's make rates, shared by desktop and the phone: which bands are below D1. */
export function puttingNote(all: NonNullable<ChTeamStats['putting']>['bands']): string {
  // Grade only the bands the rings draw.
  const bands = all.slice(0, 5);
  const graded = bands.filter((b) => b.d1 != null && b.attempts >= 10);
  const below = graded.filter((b) => (b.made / b.attempts) * 100 < b.d1!);
  if (!graded.length) return 'Bands grade against D1 once they have 10 or more putts.';
  if (!below.length) return 'Every graded band is at or above the D1 make rate.';
  if (below.length === 1) return `${below[0]!.label.replace('–', ' to ').replace(' ft', ' feet')} is the only band below the D1 make rate.`;
  return `${below.length} bands are below the D1 make rate: ${below.map((b) => b.label).join(', ')}.`;
}
