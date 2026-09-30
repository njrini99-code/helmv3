import type { ChRosterPlayer } from '../../data/roster';
import { MINUS, NO_DATA } from '../../lib/format';

/** Handicap index: a plus handicap (better than scratch) is written +0.8. */
export function formatHcp(v: number | null): string {
  if (v == null) return NO_DATA;
  if (v < 0) return `+${Math.abs(v).toFixed(1)}`;
  return v.toFixed(1);
}

export { MINUS };

const FORM_WORD: Record<ChRosterPlayer['form'], string> = {
  improving: 'Improving',
  steady: 'Steady',
  slipping: 'Slipping',
  early: 'Early read',
};

/**
 * The note under a player's name: their "needs a look" reason when there is
 * one (amber for a warning, green for a good run), otherwise their form in a
 * word. It is left out when season stats didn't load, so a missing read never
 * looks like "no rounds".
 */
export function rowNote(p: ChRosterPlayer, statsError: boolean): { text: string; tone: 'warning' | 'positive' | null } | null {
  if (p.attention) return { text: p.attention.text, tone: p.attention.tone };
  if (statsError) return null;
  if (p.form !== 'early') return { text: FORM_WORD[p.form], tone: null };
  if (p.rounds === 0) return { text: 'No rounds this season', tone: null };
  return { text: `Early read · ${p.rounds} ${p.rounds === 1 ? 'round' : 'rounds'}`, tone: null };
}
