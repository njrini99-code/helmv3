import type { ChCoachHome, ChLatestRound } from '../../data/home';
import type { ChPlayerHome } from '../../data/player-home';
import type { ChForm } from '../../data/season';
import { isOut, type ChAvailability } from '../../data/availability';
import { firstName } from '../../lib/names';
import { plural } from '../../lib/plural';

/**
 * Coach Home's derived copy, kept pure so it can be tested without a
 * database: the greeting subline, the agenda row details and the quiet-player
 * status. Every sentence here is built from loaded rows; when the read behind
 * it failed, the sentence is absent rather than reassuring.
 */

/** A player with no countable round (any length) for this many days reads "No rounds N days". */
export const QUIET_DAYS = 7;

/**
 * The leaderboard's order, the one Fairway's Top performers uses: an early read (fewer than three 18-hole rounds) last, then the
 * average AT THE PRECISION THE ROW PRINTS (one decimal), so two players who both read 74.8 are level and the player with more
 * rounds ranks first, then the name. Ordering on the hidden second decimal put a 20-round 74.8 behind a 19-round 74.8 for no reason
 * anyone could see (parity check, staging 2026-11-07).
 */
export function compareLeaderRows(
  a: { status: string; avg: number; rounds: number; name: string },
  b: { status: string; avg: number; rounds: number; name: string },
  /** False on All time (span.ts): Fairway has no floor, so a short sample ranks on its average like any other. */
  floor = true,
): number {
  const early = (r: { status: string }) => (floor && r.status === 'early' ? 1 : 0);
  return early(a) - early(b) || Math.round(a.avg * 10) - Math.round(b.avg * 10) || b.rounds - a.rounds || a.name.localeCompare(b.name);
}

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
    if (invitees > 0) who = `${plural(invitees, 'player')}`;
  } else if (invitees && invitees.length > 0) {
    const firsts = invitees.map((id) => names.get(id)).filter((n): n is string => !!n).map(firstName);
    if (invitees.length <= 3 && firsts.length === invitees.length) {
      const named = firsts.length === 1 && title.toLowerCase().includes(firsts[0]!.toLowerCase());
      who = named ? null : firsts.join(', ');
    } else {
      who = `${plural(invitees.length, 'player')}`;
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

const isQuiet = (r: ChSublineRow) => r.quietDays != null && r.quietDays >= QUIET_DAYS;

/** Most in need first: slipping and quiet, then slipping, then quiet; the longer quiet first within each. */
function byNeed(a: ChSublineRow, b: ChSublineRow): number {
  const rank = (r: ChSublineRow) => (r.status === 'slipping' ? 2 : 0) + (isQuiet(r) ? 1 : 0);
  return rank(b) - rank(a) || (b.quietDays ?? 0) - (a.quietDays ?? 0);
}

/**
 * Three or more flagged (W5, owner's preview, 11 Nov 2026: "7 players need a look: Cole, Mason, Owen, Ethan, Jackson, Dylan and
 * Tyler" named seven of eight and said nothing). A team-wide quiet spell is one sentence about the team, with the longest named;
 * otherwise the two who need it most, with their reasons, and a count of the rest.
 */
function manyFlagged(flagged: ChSublineRow[]): string {
  const ranked = [...flagged].sort(byNeed);
  const since = (rows: ChSublineRow[]) => Math.min(...rows.map((r) => r.quietDays ?? Infinity));
  if (ranked.every((r) => r.status !== 'slipping')) {
    const longest = ranked[0]!;
    const floor = since(ranked);
    // F-0016: a longest is named only when one player is strictly longest; all tied, the team's line says the one figure.
    if (longest.quietDays === floor) return `${ranked.length} players haven’t posted a round in ${floor} days.`;
    return `${ranked.length} players haven’t posted a round in ${floor}+ days, ${firstName(longest.name)} the longest at ${longest.quietDays}.`;
  }
  const lead = list(ranked.slice(0, 2).map(reason));
  const rest = ranked.slice(2);
  const tail = rest.every((r) => r.status === 'slipping')
    ? `${rest.length} more ${rest.length === 1 ? 'is' : 'are'} slipping.`
    : rest.every((r) => r.status !== 'slipping')
      ? `${rest.length} ${rest.length === 1 ? 'other hasn’t' : 'others haven’t'} posted a round in ${since(rest)}+ days.`
      : `${rest.length} more need a look.`;
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. ${tail}`;
}

/**
 * The line under the greeting: who needs a look (slipping form, or no round
 * in QUIET_DAYS), then the week's next competition, then the rest. Early-read
 * players are never counted as on track. Null when the rounds read failed.
 */
export function homeSubline(
  allRows: ChSublineRow[],
  opts: {
    roundsError: boolean;
    nextCompetition: { title: string; when: string } | null;
    /** Active players with no 18-hole round this season: no leaderboard row, so never "on track" either, and never a sentence of their own (HOME-S5). */
    unposted?: Pick<ChSublineRow, 'name' | 'availability'>[];
  },
): string | null {
  if (opts.roundsError) return null;
  // A player who is out is neither flagged for a quiet stretch nor counted on track (same rule as the roster's Needs a look).
  const rows = allRows.filter((r) => !isOut(r.availability));
  const unposted = (opts.unposted ?? []).filter((r) => !isOut(r.availability));
  const flagged = rows.filter((r) => r.status === 'slipping' || (r.quietDays != null && r.quietDays >= QUIET_DAYS));
  const onTrack = rows.filter((r) => !flagged.includes(r) && r.status !== 'early');
  const early = rows.filter((r) => !flagged.includes(r) && r.status === 'early');
  const out: string[] = [];
  // Not everyone has a read: say "with enough rounds", never "the team".
  const partial = early.length > 0 || unposted.length > 0;

  if (flagged.length === 0) {
    if (onTrack.length > 0) out.push(partial ? 'Everyone with enough rounds is on track.' : 'The team is on track.');
  } else if (flagged.length <= 2) {
    const s = list(flagged.map(reason));
    out.push(`${s.charAt(0).toUpperCase()}${s.slice(1)}.`);
  } else {
    out.push(manyFlagged(flagged));
  }
  // A no-break space ahead of a title's dot keeps "· Pinehurst No. 2" from opening a line.
  if (opts.nextCompetition) out.push(`${opts.nextCompetition.title.replace(/ · /g, '\u00a0· ')} is ${opts.nextCompetition.when}.`);
  if (flagged.length > 0 && onTrack.length > 0) out.push(partial ? 'The others with enough rounds are on track.' : 'The rest of the team is on track.');
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

/** One row of the desk's Latest rounds: a round, or one player's rounds of one event, folded (W4). */
export interface ChLatestRow {
  key: string;
  playerId: string;
  playerName: string;
  meta: string;
  /** The round's score, or the event's total when the row folds two or more rounds. */
  score: number;
  toPar: number | null;
  /** The folded rounds' scores, oldest first; null for a single round. */
  scores: number[] | null;
}

/** An event's rounds sit within three days of each other. */
const EVENT_SPAN_DAYS = 2;
const dayIndex = (d: string | undefined) => (d ? Date.parse(`${d}T12:00:00Z`) / 86_400_000 : Number.NaN);

/**
 * The desk's Latest rounds, newest first, at most `max` rows. One player's tournament (or qualifier) rounds at one course
 * within three days are one event and one row: "Springfield CC · Wed 21 Oct · Rounds 74, 77, 73" over the total (W4, owner's preview, 11 Nov 2026: three
 * rows that read the same). A round with no course or date stands alone.
 */
export function latestRows(rounds: ChLatestRound[], max: number): ChLatestRow[] {
  const groups: ChLatestRound[][] = [];
  for (const r of rounds) {
    // Only an event's rounds fold: two practice rounds at the home course on Tuesday and Wednesday are two rounds, not a total.
    const isEvent = r.kind === 'tournament' || r.kind === 'qualifier';
    const g = isEvent ? groups.find(([h]) => h!.kind === r.kind && h!.playerId === r.playerId && !!h!.course && h!.course === r.course && Math.abs(dayIndex(h!.date) - dayIndex(r.date)) <= EVENT_SPAN_DAYS) : undefined;
    if (g) g.push(r);
    else groups.push([r]);
  }
  return groups.slice(0, max).map((g) => {
    const newest = g[0]!;
    if (g.length === 1) return { key: newest.id, playerId: newest.playerId, playerName: newest.playerName, meta: newest.meta, score: newest.score, toPar: newest.toPar, scores: null };
    const oldest = g[g.length - 1]!;
    const scores = [...g].reverse().map((r) => r.score);
    const days = oldest.day === newest.day ? newest.day : `${oldest.day}–${newest.day}`;
    return {
      key: g.map((r) => r.id).join('+'),
      playerId: newest.playerId,
      playerName: newest.playerName,
      meta: [newest.course, days, `Rounds ${scores.join(', ')}`].filter(Boolean).join(' · '),
      score: scores.reduce((a, b) => a + b, 0),
      toPar: g.every((r) => r.toPar != null) ? g.reduce((a, r) => a + r.toPar!, 0) : null,
      scores,
    };
  });
}
