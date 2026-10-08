import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { MINUS, NO_DATA } from '../../lib/format';
import type { ChPlayerPeek } from '../../ui/PlayerPeek';

/** Handicap index: a plus handicap (better than scratch) is written +0.8. */
export function formatHcp(v: number | null): string {
  if (v == null) return NO_DATA;
  if (v < 0) return `+${Math.abs(v).toFixed(1)}`;
  return v.toFixed(1);
}

export { MINUS };

/**
 * A figure split for a rolling numeral (Number Flow): the sign as text and the size as the number that rolls, so the
 * numeral reads "−0.9" with a true minus, never Intl's hyphen. `text` is the whole figure, exactly as `formatSigned`
 * (signed) or `formatFixed` writes it, for the row's accessible name and for no data ("—", which does not roll). A
 * figure that rounds to zero is "0.0", unsigned, as `formatSigned` has it.
 */
export function figureParts(
  value: number | null | undefined,
  { signed = false, digits = 1 }: { signed?: boolean; digits?: number } = {},
): { text: string; prefix: string; size: number } | null {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Number(value.toFixed(digits));
  const size = Math.abs(rounded);
  const prefix = rounded === 0 ? '' : rounded < 0 ? MINUS : signed ? '+' : '';
  return { text: prefix + size.toFixed(digits), prefix, size };
}

/**
 * The parts of a coach's Roster that failed, as phrases inside a sentence, for the page's one notice (CH-1209). Season
 * stats count only with the roster in: without the players there are no averages to miss.
 */
export function rosterFailedParts(data: Pick<ChRoster, 'playersError' | 'requestsError' | 'statsError'>): string[] {
  const parts: string[] = [];
  if (data.playersError) parts.push('the roster');
  if (data.requestsError) parts.push('join requests');
  if (!data.playersError && data.statsError) parts.push('season stats');
  return parts;
}

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

/** Under this many rounds a player's average is an early read: no place on the team, no strip (P003 #3). */
export const ROSTER_EARLY_FLOOR = 3;

export type RosterStanding = { place: number; of: number };

/**
 * Where each player's scoring average sits on the team. Ranked among active players with an average and at least
 * the early floor of rounds, never among the rows a search or filter left on screen (P003 #2): searching "Jo" keeps
 * "4th of 7", and "All" doesn't rank inactive players. Ties share the better place.
 */
export function rosterStandings(players: ChRosterPlayer[]): { avgs: number[]; byId: Map<string, RosterStanding> } {
  const ranked = players.filter((p) => p.status === 'active' && p.avg != null && p.rounds >= ROSTER_EARLY_FLOOR);
  const avgs = ranked.map((p) => p.avg!);
  const byId = new Map<string, RosterStanding>();
  for (const p of ranked) byId.set(p.id, { place: avgs.filter((v) => v < p.avg!).length + 1, of: avgs.length });
  return { avgs, byId };
}

/** "Needs 1 more" under the early floor, or null once a player is ranked. */
export function earlyNeed(rounds: number): string | null {
  return rounds >= ROSTER_EARLY_FLOOR ? null : `Needs ${ROSTER_EARLY_FLOOR - rounds} more`;
}

/** The player peek (P003-C1) from what the roster already holds: no reads of its own. */
export function rosterPeek(p: ChRosterPlayer): ChPlayerPeek {
  // A player row that came back without its rounds still peeks (the list's boundary contains the rest).
  const last = (p.recent ?? [])[0] ?? null;
  return {
    id: p.id,
    name: p.name,
    sub: p.classYear,
    lastRound: last ? { score: last.score, toPar: last.toPar, label: [last.course, last.date].filter(Boolean).join(' \u00b7 ') } : null,
    avg: p.avg,
    trend: p.trend,
    reason: p.attention?.tone === 'warning' ? p.attention.text : null,
  };
}

/** The team inside a sentence: its name, or "your team" when the team row didn't load and the name is the fallback. */
export function teamInSentence(data: Pick<ChRoster, 'teamName' | 'teamError'>): string {
  return data.teamError ? 'your team' : data.teamName;
}
