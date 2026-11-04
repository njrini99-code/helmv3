import type { ChAvailability, ChRoster, ChRosterPlayer } from '../../data/roster';
import { classYearKey, classYearLineFor, type ChYearKey } from '../../lib/class-year';
import { formatSigned, MINUS } from '../../lib/format';
import type { ChPlayerPeek } from '../../ui/PlayerPeek';
import { displayPlaces } from '../../lib/rank';
import { plural } from '../../lib/plural';

export { MINUS };

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

/** "today", "yesterday", "3 days ago": a join request's age, and when a player's availability last changed. */
export function relativeAgo(iso: string, now: Date): string {
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/** Availability in a word. Never the status's words: Active and Inactive are team access, these are whether they can play. */
export const AVAILABILITY_WORD: Record<ChAvailability, string> = {
  available: 'Available',
  injured: 'Injured',
  away: 'Away',
};

/** "Injured" or "Away", or null for an available player: the word that stands for them on the roster (P003, availability). */
export function availabilityLine(p: Pick<ChRosterPlayer, 'availability'>): string | null {
  const a = p.availability ?? 'available';
  return a === 'available' ? null : AVAILABILITY_WORD[a];
}

const FORM_WORD: Record<ChRosterPlayer['form'], string> = {
  improving: 'Improving',
  steady: 'Steady',
  slipping: 'Slipping',
  early: 'Early read',
};

/**
 * The note under a player's name: their availability word when they are injured or away ("Injured", plain ink: no
 * colour of its own), else their "needs a look" reason when there is one (amber for a quiet spell or scores rising, green for a good run),
 * otherwise their form in a word. The form is left out when season stats didn't load, so a missing read never looks
 * like "no rounds".
 */
export function rowNote(p: ChRosterPlayer, statsError: boolean): { text: string; tone: NonNullable<ChRosterPlayer['attention']>['tone'] | null } | null {
  const away = availabilityLine(p);
  if (away) return { text: away, tone: null };
  if (p.attention) return { text: p.attention.text, tone: p.attention.tone };
  if (statsError) return null;
  if (p.form !== 'early') return { text: FORM_WORD[p.form], tone: null };
  if (p.rounds === 0) return { text: 'No rounds this season', tone: null };
  return { text: `Early read · ${plural(p.rounds, 'round')}`, tone: null };
}

/** Under this many rounds a player's average is an early read: no place on the team, no strip (P003 #3). */
export const ROSTER_EARLY_FLOOR = 3;

export type RosterStanding = { place: number; of: number; /** Another player shows the same average (B13). */ tied: boolean };

/**
 * Where each player's scoring average sits on the team. Ranked among active players with an average and at least
 * the early floor of rounds, never among the rows a search or filter left on screen (P003 #2): searching "Jo" keeps
 * "4th of 7", and "All" doesn't rank inactive players. Places are taken on the average as shown, to a tenth, so two
 * players shown at 74.3 share a place (B13, lib/rank.ts).
 */
export function rosterStandings(players: ChRosterPlayer[]): { avgs: number[]; byId: Map<string, RosterStanding> } {
  const ranked = players.filter((p) => p.status === 'active' && p.avg != null && p.rounds >= ROSTER_EARLY_FLOOR);
  const avgs = ranked.map((p) => p.avg!);
  const byId = new Map<string, RosterStanding>();
  const places = displayPlaces(avgs);
  ranked.forEach((p, i) => byId.set(p.id, { place: places[i]!.place, of: avgs.length, tied: places[i]!.tied }));
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

/** A leg of strokes gained as the roster's CoachHelm caption names it. */
export const LEG_WORD: Record<keyof ChRosterPlayer['sgLegs'], string> = {
  tee: 'off the tee',
  approach: 'on approach',
  around: 'around the green',
  putting: 'putting',
};

/**
 * The roster's strokes-by-leg caption (spec D build B), in parts so the figure can take its tone: the leg that loses the most
 * ("Loses most putting, −1.1 a round"), or, with none losing, the leg that gains the most ("Gains in every leg; most on approach,
 * +0.4", or "Gains most on approach, +0.4" when a leg has too few rounds to say "every"). Null with no strokes gained for the season
 * or no leg read. Rule-based on the season's own figures; nothing is estimated.
 */
export function legsCaption(p: Pick<ChRosterPlayer, 'sgPerRound' | 'sgLegs'>): { lead: string; figure: string; tail: string; tone: 'gain' | 'loss' } | null {
  if (p.sgPerRound == null) return null;
  const legs = (Object.entries(p.sgLegs) as Array<[keyof ChRosterPlayer['sgLegs'], number | null]>).filter((e): e is [keyof ChRosterPlayer['sgLegs'], number] => e[1] != null);
  if (legs.length === 0) return null;
  const worst = legs.reduce((a, b) => (b[1] < a[1] ? b : a));
  // A leg that rounds to 0.0 neither loses nor gains in what is drawn.
  if (Number(worst[1].toFixed(1)) < 0) return { lead: `Loses most ${LEG_WORD[worst[0]]}, `, figure: formatSigned(worst[1]), tail: ' a round', tone: 'loss' };
  const best = legs.reduce((a, b) => (b[1] > a[1] ? b : a));
  const every = legs.length === Object.keys(p.sgLegs).length;
  return { lead: every ? `Gains in every leg; most ${LEG_WORD[best[0]]}, ` : `Gains most ${LEG_WORD[best[0]]}, `, figure: formatSigned(best[1]), tail: '', tone: 'gain' };
}

/** The team's zone and day, on the roster's data behind the lane's flag; a fixture has none and reads the product default. */
export type RosterClock = { tz: string; day: string } | undefined;

/** A player's year key on the team's calendar: null keeps the neutral coin. */
export const yearKeyOf = (gradYear: number | null | undefined, clock: RosterClock): ChYearKey | null => classYearKey(gradYear, new Date(), clock?.tz);

/** "Junior · Class of 2028" on the team's calendar, a far class once, null for a past or missing year. */
export const yearLineOf = (gradYear: number | null | undefined, clock: RosterClock): string | null => classYearLineFor(gradYear, new Date(), clock?.tz);

const YEAR_ORDER: readonly ChYearKey[] = ['sr', 'jr', 'so', 'fr'];
const YEAR_WORD: Record<ChYearKey, [one: string, many: string]> = {
  sr: ['Senior', 'Seniors'],
  jr: ['Junior', 'Juniors'],
  so: ['Sophomore', 'Sophomores'],
  fr: ['Freshman', 'Freshmen'],
};

export type ClassMixRow = { key: ChYearKey; count: number; label: string };

/** The class mix in year order: one row per year, a year with none included (the legend shows 0, as drawn). An unknown year is not counted. */
export function classMix(players: ReadonlyArray<{ gradYear: number | null }>, clock: RosterClock): ClassMixRow[] {
  const counts: Record<ChYearKey, number> = { sr: 0, jr: 0, so: 0, fr: 0 };
  for (const p of players) {
    const k = yearKeyOf(p.gradYear, clock);
    if (k) counts[k] += 1;
  }
  return YEAR_ORDER.map((key) => ({ key, count: counts[key], label: YEAR_WORD[key][counts[key] === 1 ? 0 : 1] }));
}

export interface RosterTeamFigures {
  total: number;
  active: number;
  injured: number;
  /** The five lowest averages among active players with 3+ counting rounds; null until five qualify (or stats failed). */
  topFive: ChRosterPlayer[] | null;
  topFiveMean: number | null;
}

/** The team card's figures. Injured count as active (DECISIONS); the top five needs five players with three counting rounds. */
export function teamCardFigures(players: ChRosterPlayer[], statsError = false): RosterTeamFigures {
  const active = players.filter((p) => p.status === 'active');
  const ranked = statsError ? [] : active.filter((p) => p.avg != null && p.rounds >= ROSTER_EARLY_FLOOR).sort((a, b) => a.avg! - b.avg!);
  const topFive = ranked.length >= 5 ? ranked.slice(0, 5) : null;
  return {
    total: players.length,
    active: active.length,
    injured: active.filter((p) => p.availability === 'injured').length,
    topFive,
    topFiveMean: topFive ? topFive.reduce((a, p) => a + p.avg!, 0) / topFive.length : null,
  };
}

export type RosterLeader = { kind: 'low' | 'heater' | 'look'; player: ChRosterPlayer; value: number };

/**
 * The leader cards, in order: Low average, On a heater (best mean of the last three), Needs a look. Only active players with three
 * counting rounds count. Needs a look is the lowest strokes gained among players carrying a warning or loss note; missing strokes
 * gained hides that card, and nobody with the note hides it too.
 */
export function leaderPicks(players: ChRosterPlayer[], statsError = false): RosterLeader[] {
  if (statsError) return [];
  const pool = players.filter((p) => p.status === 'active' && p.rounds >= ROSTER_EARLY_FLOOR);
  const out: RosterLeader[] = [];
  const low = pool.filter((p) => p.avg != null).sort((a, b) => a.avg! - b.avg!)[0];
  if (low) out.push({ kind: 'low', player: low, value: low.avg! });
  const lastThree = (p: ChRosterPlayer) => p.trend.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const hot = pool.filter((p) => p.trend.length >= 3).sort((a, b) => lastThree(a) - lastThree(b))[0];
  if (hot) out.push({ kind: 'heater', player: hot, value: lastThree(hot) });
  const look = pool
    .filter((p) => (p.attention?.tone === 'warning' || p.attention?.tone === 'loss') && p.sgPerRound != null)
    .sort((a, b) => a.sgPerRound! - b.sgPerRound!)[0];
  if (look) out.push({ kind: 'look', player: look, value: look.sgPerRound! });
  return out;
}

/** The last five rounds' range on one scale for the whole list: bars draw the same five they colour (R10). */
export const lastFive = (trend: readonly number[]): readonly number[] => trend.slice(-5);
