import type { ChForm } from '../../data/season';

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

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/**
 * "Practice green · 6 players", "Green 2 · Priya, Ava". Names only for up to
 * three invitees, and not when the title already names the one invitee ("1:1
 * with Jonah"). With no invitee rows, or when the attendance read failed, only
 * the location.
 */
export function inviteDetail(input: { location: string | null; title: string; invitees: string[] | null; names: Map<string, string> }): string | null {
  const { location, title, invitees, names } = input;
  let who: string | null = null;
  if (invitees && invitees.length > 0) {
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

/** "5 of 6 confirmed" from RSVP rows; null without invitees or when the read failed. */
export function confirmedLine(invitees: string[] | null, accepted: number): string | null {
  if (!invitees || invitees.length === 0) return null;
  return `${accepted} of ${invitees.length} confirmed`;
}

export interface ChSublineRow {
  name: string;
  status: ChForm;
  quietDays: number | null;
}

function reason(r: ChSublineRow): string {
  const quiet = r.quietDays != null && r.quietDays >= QUIET_DAYS;
  const who = firstName(r.name);
  if (r.status === 'slipping' && quiet) return `${who} is slipping and hasn't posted a round in ${r.quietDays} days`;
  if (r.status === 'slipping') return `${who} is slipping`;
  return `${who} hasn't posted a round in ${r.quietDays} days`;
}

function list(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The line under the greeting: who needs a look (slipping form, or no round
 * in QUIET_DAYS), then the week's next competition, then the rest. Early-read
 * players are never counted as on track. Null when the rounds read failed.
 */
export function homeSubline(rows: ChSublineRow[], opts: { roundsError: boolean; nextCompetition: { title: string; when: string } | null }): string | null {
  if (opts.roundsError) return null;
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
