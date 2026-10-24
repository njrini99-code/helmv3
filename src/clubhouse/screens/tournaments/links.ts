/*
 * Round link inbox (P016, handoff 4.33 section 5.12): which tournament round a player's GolfHelm round belongs to, and how sure the
 * match is. Same date and same course as an event round is High; same date with a different or unknown course is Medium; a day
 * either side is Low; anything further is no suggestion. Only rounds logged as tournament rounds are candidates (qualifier and
 * practice rounds are not), and rounds already linked or dismissed ("Not a tournament round") are left out.
 *
 * Dates are calendar days, `yyyy-mm-dd`. The loader turns an event round's `start_time` into a date in the team's time zone
 * before it gets here; this module never parses a timestamp, so a 7 PM tee time can never slide to the next day.
 *
 * Pure: no Supabase, no React. Client-safe.
 */

import { NO_DATA } from '../../lib/format';

export type LinkConfidence = 'high' | 'medium' | 'low';

export interface LinkCandidateRound {
  /** `golf_rounds.id`. */
  id: string;
  playerId: string;
  playerName?: string | null;
  /** `golf_rounds.round_date`, yyyy-mm-dd. */
  date: string;
  courseId: string | null;
  courseName?: string | null;
  score: number | null;
  /** `golf_rounds.round_type`; only `tournament` is a candidate. */
  roundType: string | null;
  /** When the round started, to order two rounds of one day (a 36-hole day). */
  startedAt?: string | null;
}

export interface LinkEventRound {
  roundEventId: string;
  tournamentId: string;
  tournamentName: string;
  roundNumber: number;
  /** yyyy-mm-dd in the team's time zone. */
  date: string;
  courseId: string | null;
  courseName?: string | null;
}

export interface LinkMatch {
  eventRound: LinkEventRound;
  confidence: LinkConfidence;
  /** Whole days between the round and the event round. */
  days: number;
}

export interface LinkSuggestion {
  round: LinkCandidateRound;
  /** The suggested event round, or null when none is within a day. */
  match: LinkMatch | null;
  /** Every other event round in reach, best first, for "Change". */
  alternatives: LinkMatch[];
  /** Two event rounds fit equally well, or two of the player's rounds want one event round: the coach picks. Never bulk linked. */
  ambiguous: boolean;
}

export interface SuggestOptions {
  /** Rounds already linked to an event round. */
  linkedRoundIds?: Iterable<string>;
  /** Rounds the coach marked "Not a tournament round" (remembered). */
  dismissedRoundIds?: Iterable<string>;
  /** Event rounds each player already has a round linked to (or a score entered for): never suggested twice. */
  taken?: Iterable<{ playerId: string; roundEventId: string }>;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function dayNumber(date: string): number | null {
  const m = DATE.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

/** Whole calendar days between two `yyyy-mm-dd` dates; null when either is not a date. */
export function dayDiff(a: string, b: string): number | null {
  const x = dayNumber(a);
  const y = dayNumber(b);
  return x == null || y == null ? null : Math.abs(x - y);
}

/** How sure a round belongs to an event round, or null when they are more than a day apart. */
export function linkConfidence(round: Pick<LinkCandidateRound, 'date' | 'courseId'>, eventRound: Pick<LinkEventRound, 'date' | 'courseId'>): LinkConfidence | null {
  const days = dayDiff(round.date, eventRound.date);
  if (days == null || days > 1) return null;
  if (days === 1) return 'low';
  return round.courseId != null && round.courseId === eventRound.courseId ? 'high' : 'medium';
}

const RANK: Record<LinkConfidence, number> = { high: 0, medium: 1, low: 2 };

function byStrength(a: LinkMatch, b: LinkMatch): number {
  return (
    RANK[a.confidence] - RANK[b.confidence] ||
    a.days - b.days ||
    a.eventRound.roundNumber - b.eventRound.roundNumber ||
    a.eventRound.roundEventId.localeCompare(b.eventRound.roundEventId)
  );
}

const equallyGood = (a: LinkMatch, b: LinkMatch) => a.confidence === b.confidence && a.days === b.days;

/**
 * One suggestion per candidate round, in the order given. Ties are settled deterministically (confidence, then nearest date,
 * then round number); where a tie is real, the suggestion is marked ambiguous. Two rounds of one player on a 36-hole day are
 * paired with that day's event rounds in start order when every one of them has a start time.
 */
export function suggestLinks(candidates: readonly LinkCandidateRound[], eventRounds: readonly LinkEventRound[], opts: SuggestOptions = {}): LinkSuggestion[] {
  const linked = new Set(opts.linkedRoundIds ?? []);
  const dismissed = new Set(opts.dismissedRoundIds ?? []);
  const taken = new Set([...(opts.taken ?? [])].map((t) => `${t.playerId}|${t.roundEventId}`));

  const rounds = candidates.filter((r) => r.roundType === 'tournament' && !linked.has(r.id) && !dismissed.has(r.id));
  const out: LinkSuggestion[] = rounds.map((round) => {
    const matches = eventRounds
      .filter((e) => !taken.has(`${round.playerId}|${e.roundEventId}`))
      .flatMap((eventRound): LinkMatch[] => {
        const confidence = linkConfidence(round, eventRound);
        return confidence ? [{ eventRound, confidence, days: dayDiff(round.date, eventRound.date) as number }] : [];
      })
      .sort(byStrength);
    const [best, next, ...rest] = matches;
    const ambiguous = best != null && next != null && equallyGood(best, next);
    return { round, match: best ?? null, alternatives: next ? [next, ...rest] : [], ambiguous };
  });

  settleSameDay(out);
  markContested(out);
  return out;
}

/**
 * A player with two rounds on a day that holds two equally good event rounds of one tournament (a 36-hole day): the earlier
 * round goes to the lower round number. Only when every round of the group has a start time; otherwise they stay ambiguous.
 */
function settleSameDay(out: LinkSuggestion[]): void {
  const groups = new Map<string, LinkSuggestion[]>();
  for (const s of out) {
    if (!s.ambiguous || !s.match) continue;
    const key = `${s.round.playerId}|${s.round.date}|${s.match.eventRound.tournamentId}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (!first?.match || group.length < 2 || group.some((s) => !s.round.startedAt)) continue;
    const pool = [first.match, ...first.alternatives].filter((m) => first.match != null && equallyGood(m, first.match));
    if (pool.length !== group.length) continue;
    const slots = [...pool].sort((a, b) => a.eventRound.roundNumber - b.eventRound.roundNumber);
    const ordered = [...group].sort((a, b) => (a.round.startedAt as string).localeCompare(b.round.startedAt as string) || a.round.id.localeCompare(b.round.id));
    ordered.forEach((s, i) => {
      const slot = slots[i] as LinkMatch;
      s.alternatives = [...(s.match ? [s.match] : []), ...s.alternatives].filter((m) => m.eventRound.roundEventId !== slot.eventRound.roundEventId).sort(byStrength);
      s.match = slot;
      s.ambiguous = false;
    });
  }
}

/** Two of one player's rounds suggested for the same event round: neither is safe to link without the coach. */
function markContested(out: LinkSuggestion[]): void {
  const seen = new Map<string, LinkSuggestion[]>();
  for (const s of out) {
    if (!s.match) continue;
    const key = `${s.round.playerId}|${s.match.eventRound.roundEventId}`;
    seen.set(key, [...(seen.get(key) ?? []), s]);
  }
  for (const group of seen.values()) if (group.length > 1) for (const s of group) s.ambiguous = true;
}

/** The rows "Link all high-confidence" links: High and not ambiguous. */
export function highConfidence(suggestions: readonly LinkSuggestion[]): LinkSuggestion[] {
  return suggestions.filter((s) => s.match?.confidence === 'high' && !s.ambiguous);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 18" from `yyyy-mm-dd`, without a time zone in sight. */
export function shortDay(date: string): string {
  const m = DATE.exec(date);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[3])}` : date;
}

/**
 * The two halves of an inbox row: "Theo · 72 · Oct 18 · Oakmont North" and "Oakmont Invitational R2". The screen draws the
 * arrow between them as an icon, since the type has no arrow glyph.
 */
export function linkRowParts(s: Pick<LinkSuggestion, 'round' | 'match'>): { round: string; target: string | null } {
  const r = s.round;
  const parts = [r.playerName, r.score != null ? String(r.score) : NO_DATA, shortDay(r.date), r.courseName].filter((p): p is string => !!p);
  const target = s.match ? `${s.match.eventRound.tournamentName} R${s.match.eventRound.roundNumber}` : null;
  return { round: parts.join(' · '), target };
}

/** Lineup players with no round linked and no score entered for an event round. */
export function missingLinks(lineup: readonly string[], scored: Iterable<{ playerId: string }>): string[] {
  const has = new Set([...scored].map((s) => s.playerId));
  return lineup.filter((id) => !has.has(id));
}

/** Who counted's line: "1 lineup player has no round linked for R2". Null when nobody is missing. */
export function missingLinksText(count: number, roundNumber: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? `1 lineup player has no round linked for R${roundNumber}` : `${count} lineup players have no round linked for R${roundNumber}`;
}
