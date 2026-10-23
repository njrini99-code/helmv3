import type { ChCoachHome } from '../../data/home';
import type { ChPlayerHome } from '../../data/player-home';
import type { ChForm } from '../../data/season';
import { isOut, type ChAvailability } from '../../data/availability';
import { firstName } from '../../lib/names';

/**
 * Coach Home's derived copy, kept pure so it can be tested without a
 * database: the greeting subline, the agenda row details and the quiet-player
 * status. Every sentence here is built from loaded rows; when the read behind
 * it failed, the sentence is absent rather than reassuring.
 */

/** A player with no countable round (any length) for this many days reads "No rounds N days". */
export const QUIET_DAYS = 7;

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(to) - t(from)) / 86400000);
}

export { firstName };

/**
 * "Practice green · 6 players", "Green 2 · Priya, Ava". Names only for up to
 * three invitees, and not when the title already names the one invitee ("1:1
 * with Jonah"). With no invitee rows, or when the attendance read failed, only
 * the location. A number is a count without identities (a player's Home reads
 * counts, never teammates' rows): always "N players".
 */
export function inviteDetail(input: { location: string | null; title: string; invitees: string[] | number | null; names: Map<string, string> }): string | null {
  const { location, title, invitees, names } = input;
  let who: string | null = null;
  if (typeof invitees === 'number') {
    if (invitees > 0) who = `${invitees} ${invitees === 1 ? 'player' : 'players'}`;
  } else if (invitees && invitees.length > 0) {
    const firsts = invitees.map((id) => names.get(id)).filter((n): n is string => !!n).map(firstName);
    if (invitees.length <= 3 && firsts.length === invitees.length) {
      const named = firsts.length === 1 && title.toLowerCase().includes(firsts[0]!.toLowerCase());
      who = named ? null : firsts.join(', ');
    } else {
      who = `${invitees.length} ${invitees.length === 1 ? 'player' : 'players'}`;
    }
  }
  return [location, who].filter(Boolean).join(' · ') || null;
}

/** "5 of 6 going" from RSVP rows, or from an invitee count; null without invitees or when the read failed. */
export function confirmedLine(invitees: string[] | number | null, accepted: number): string | null {
  const n = typeof invitees === 'number' ? invitees : (invitees?.length ?? 0);
  if (n === 0) return null;
  return `${accepted} of ${n} going`;
}

export interface ChSublineRow {
  name: string;
  status: ChForm;
  quietDays: number | null;
  /** Injured or away: left out of "needs a look" and "on track" alike (the coach already knows). Absent reads as available. */
  availability?: ChAvailability;
}

function reason(r: ChSublineRow): string {
  const quiet = r.quietDays != null && r.quietDays >= QUIET_DAYS;
  const who = firstName(r.name);
  if (r.status === 'slipping' && quiet) return `${who} is slipping and hasn’t posted a round in ${r.quietDays} days`;
  if (r.status === 'slipping') return `${who} is slipping`;
  return `${who} hasn’t posted a round in ${r.quietDays} days`;
}

function list(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The line under the greeting: who needs a look (slipping form, or no round
 * in QUIET_DAYS), then the week's next competition, then the rest. Early-read
 * players are never counted as on track. Null when the rounds read failed.
 */
export function homeSubline(allRows: ChSublineRow[], opts: { roundsError: boolean; nextCompetition: { title: string; when: string } | null }): string | null {
  if (opts.roundsError) return null;
  // A player who is out is neither flagged for a quiet stretch nor counted on track (same rule as the roster's Needs a look).
  const rows = allRows.filter((r) => !isOut(r.availability));
  const flagged = rows.filter((r) => r.status === 'slipping' || (r.quietDays != null && r.quietDays >= QUIET_DAYS));
  const onTrack = rows.filter((r) => !flagged.includes(r) && r.status !== 'early');
  const early = rows.filter((r) => !flagged.includes(r) && r.status === 'early');
  const out: string[] = [];

  if (flagged.length === 0) {
    if (onTrack.length > 0) out.push(early.length ? 'Everyone with enough rounds is on track.' : 'The team is on track.');
  } else if (flagged.length <= 2) {
    const s = list(flagged.map(reason));
    out.push(`${s.charAt(0).toUpperCase()}${s.slice(1)}.`);
  } else {
    out.push(`${flagged.length} players need a look: ${list(flagged.map((r) => firstName(r.name)))}.`);
  }
  if (opts.nextCompetition) out.push(`${opts.nextCompetition.title} is ${opts.nextCompetition.when}.`);
  if (flagged.length > 0 && onTrack.length > 0) out.push(early.length ? 'The others with enough rounds are on track.' : 'The rest of the team is on track.');
  return out.length ? out.join(' ') : null;
}

/**
 * The parts of Home whose reads failed, named as they read inside the page notice's sentence (CH-1209: "This week’s
 * schedule, recent rounds and the leaderboard didn’t load"). Two or more get the one page notice with the one Try
 * again, and each part's own notice keeps only its title (`covered`). Each entry tests the flag that draws that part's
 * notice, so the sentence never names a part with no gap under it. The phone draws team scoring where the desktop
 * draws the leaderboard.
 */
export function coachFailedParts(data: Pick<ChCoachHome, 'week' | 'latestRounds' | 'leaderboard' | 'phone' | 'legs' | 'queue'>, phone: boolean): string[] {
  const parts: string[] = [];
  const q = data.queue;
  // "Waiting on you" (CH-2220): a part of it that didn't load is never counted as 0.
  if (q && (q.joinRequests == null || q.replies == null || q.overdueTasks == null || q.unackedPosts == null)) parts.push('what’s waiting on you');
  if (data.week.error) parts.push('this week’s schedule');
  if (phone && data.latestRounds.error && !data.phone.form) parts.push('team scoring');
  // The team's four parts are drawn under the form: their notices (CH-2218, CH-2219) only where they are.
  const legs = data.phone.form ? data.legs : null;
  if (legs?.cacheError) parts.push('up-and-down figures');
  if (legs?.tourError) parts.push('Tour marks');
  if (data.latestRounds.error) parts.push('recent rounds');
  if (!phone && data.leaderboard.error) parts.push('the leaderboard');
  return parts;
}

/**
 * The player's (the phone and the desktop draw the same parts). The latest round and the scoring line read the same
 * rounds, so they fail together and are named by their sections, not twice as "rounds".
 */
/**
 * A player with no round posted yet, both rounds reads answered: a failed read is never taken for "new" (CH-2312). A
 * malformed read is not "none" either; it is left to its section's boundary.
 */
export function noRoundsYet(data: Pick<ChPlayerHome, 'latest' | 'scoring'>): boolean {
  const { latest, scoring } = data;
  return !latest.error && !scoring.error && Array.isArray(scoring.points) && scoring.points.length === 0 && Array.isArray(latest.rounds) && latest.rounds.length === 0;
}

export function playerFailedParts(data: Pick<ChPlayerHome, 'week' | 'latest' | 'scoring' | 'legs'>): string[] {
  const parts: string[] = [];
  if (data.week.error) parts.push('this week’s schedule');
  if (data.latest.error) parts.push('your latest round');
  if (data.scoring.error) parts.push('your scoring');
  if (data.legs?.cacheError) parts.push('some of your figures');
  return parts;
}
