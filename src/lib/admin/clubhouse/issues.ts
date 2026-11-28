/**
 * Issues on the Reliability feed (B19): the failures of the window grouped by what went wrong, most people first.
 *
 * Pure: no reads, no clock. The page passes the feed items (feed.ts buildFeed) and `now`. Every count is of failures
 * the session store kept; people are counted by user id (signed out, by session) and never printed.
 */
import { PLATFORM_WORDS } from './live-scope';
import { itemExplanation, itemHeadline, itemHeadlineQuoted, personKey, windowStart, type FeedItem, type FeedState, type FeedWindow } from './feed';
import type { Explanation } from './explain';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// The sparkline's buckets
// ---------------------------------------------------------------------------

export interface SparkFrame {
  /** The first bucket's start (ms). */
  start: number;
  /** One bucket (ms): an hour for today and 24 hours, a day for 7 days. */
  size: number;
  /** How many buckets: today's hours so far (at least one), 24, or 7. */
  n: number;
  unit: 'hour' | 'day';
}

/** Buckets that end with the one holding `now`, so the last bar is always the current hour (or day). */
export function sparkFrame(w: FeedWindow, now: number): SparkFrame {
  if (w === 'today') {
    const start = windowStart('today', now);
    return { start, size: HOUR_MS, n: Math.max(1, Math.floor((now - start) / HOUR_MS) + 1), unit: 'hour' };
  }
  if (w === '24h') return { start: Math.floor(now / HOUR_MS) * HOUR_MS - 23 * HOUR_MS, size: HOUR_MS, n: 24, unit: 'hour' };
  return { start: Math.floor(now / DAY_MS) * DAY_MS - 6 * DAY_MS, size: DAY_MS, n: 7, unit: 'day' };
}

/** The bucket a time falls in; a time before the first bucket counts in it, one after the last in the last. Null when unreadable. */
export function bucketIndex(iso: string, frame: SparkFrame): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.min(frame.n - 1, Math.max(0, Math.floor((ms - frame.start) / frame.size)));
}

/** How many of `times` fall in each bucket, each time weighing `weight` (1 unless given). */
export function bucketCounts(times: readonly string[], frame: SparkFrame, weight: (index: number) => number = () => 1): number[] {
  const out = new Array<number>(frame.n).fill(0);
  times.forEach((t, k) => {
    const i = bucketIndex(t, frame);
    if (i !== null) out[i]! += weight(k);
  });
  return out;
}

/**
 * Rising: the last quarter of the buckets holds at least 3 failures, at twice the rate of the rest or more. Needs four
 * buckets, so early in the day nothing is called rising on one hour's evidence.
 */
export function isRising(spark: readonly number[]): boolean {
  const n = spark.length;
  if (n < 4) return false;
  const tail = Math.max(1, Math.round(n / 4));
  const recent = spark.slice(n - tail).reduce((a, b) => a + b, 0);
  const rest = spark.slice(0, n - tail).reduce((a, b) => a + b, 0);
  if (recent < 3) return false;
  return recent / tail >= (2 * rest) / (n - tail);
}

// ---------------------------------------------------------------------------
// "Mostly": where an issue concentrates
// ---------------------------------------------------------------------------

export type MostlyDim = 'role' | 'platform' | 'release' | 'team';

export interface Mostly {
  dim: MostlyDim;
  text: string;
}

const ROLE_PLURAL: Readonly<Record<string, string>> = { coach: 'coaches', player: 'players', 'signed-out': 'signed-out visitors' };

function valueOf(i: FeedItem, dim: MostlyDim): string | null {
  if (dim === 'role') return i.role;
  if (dim === 'platform') return i.platform && i.platform !== 'unknown' ? i.platform : null;
  if (dim === 'release') return i.release && i.release !== 'unknown' ? i.release : null;
  return i.teamName;
}

function words(dim: MostlyDim, value: string): string {
  if (dim === 'role') return ROLE_PLURAL[value] ?? value;
  if (dim === 'platform') return `on ${PLATFORM_WORDS[value] ?? value}`;
  if (dim === 'release') return `on release ${value.slice(0, 7)}`;
  return `at ${value}`;
}

const MOSTLY_DIMS: readonly MostlyDim[] = ['role', 'platform', 'team', 'release'];
/** A share at or over this, of the failures whose value is known, is "mostly". */
export const MOSTLY_SHARE = 0.8;
/** Fewer failures than this say nothing about where an issue concentrates. */
export const MOSTLY_MIN = 3;

/**
 * Where an issue's failures concentrate: "only coaches", "mostly on iPhone Safari (8 of 9)". A dimension is named only
 * when the whole window has two or more values on it (one release live all window says nothing about this issue), the
 * value is known for most of the issue's failures, and one value holds 80% or more of them.
 */
export function mostlyOf(issueItems: readonly FeedItem[], windowItems: readonly FeedItem[]): Mostly[] {
  if (issueItems.length < MOSTLY_MIN) return [];
  const out: Mostly[] = [];
  for (const dim of MOSTLY_DIMS) {
    const inWindow = new Set(windowItems.map((i) => valueOf(i, dim)).filter((v): v is string => v !== null));
    if (inWindow.size < 2) continue;
    const counts = new Map<string, number>();
    let known = 0;
    for (const i of issueItems) {
      const v = valueOf(i, dim);
      if (v === null) continue;
      known += 1;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (known < MOSTLY_SHARE * issueItems.length) continue;
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ['', 0];
    if (!top || n < MOSTLY_SHARE * known) continue;
    out.push({ dim, text: n === known ? `only ${words(dim, top)}` : `mostly ${words(dim, top)} (${n} of ${known})` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The issues
// ---------------------------------------------------------------------------

export interface Issue {
  /** The catalog code, else `x:<kind>|<page>|<words>` for a failure that carried no code. */
  key: string;
  catalogCode: string | null;
  /** The code as the newest failure carried it, for the chip. */
  code: string | null;
  headline: string;
  quoted: boolean;
  /** The likely cause, from the newest failure; null when nothing points anywhere. */
  cause: Explanation | null;
  count: number;
  /** Distinct people: signed in by user id, signed out by session. */
  people: number;
  coaches: number;
  players: number;
  /** Signed-out sessions that hit it. */
  signedOut: number;
  /** Failures whose session row was not found, so whose role is not known. */
  unknownRole: number;
  firstAt: string;
  lastAt: string;
  /** Expected, Watching or New in this release, as the newest failure carries it. */
  state: FeedState;
  spark: number[];
  rising: boolean;
  mostly: Mostly[];
  /** Distinct pages it happened on, with the one page's name when there is only one. */
  pages: number;
  pageName: string | null;
  newest: FeedItem;
}

function issueKey(i: FeedItem): string {
  return i.catalogCode ?? `x:${i.kind}|${i.page}|${itemHeadline(i)}`;
}

function distinct(items: readonly FeedItem[], f: (i: FeedItem) => string | null): number {
  return new Set(items.map(f).filter((v): v is string => v !== null)).size;
}

/**
 * The window's failures as issues: most people first, then most failures, then the most recent. `items` is the feed in
 * view (feed order, newest first); the "mostly" context is the same items, so a filter narrows both.
 */
export function groupIssues(items: readonly FeedItem[], o: { w: FeedWindow; now: number }): Issue[] {
  const frame = sparkFrame(o.w, o.now);
  const groups = new Map<string, FeedItem[]>();
  for (const i of items) {
    const k = issueKey(i);
    const list = groups.get(k);
    if (list) list.push(i);
    else groups.set(k, [i]);
  }
  const issues: Issue[] = [];
  for (const [key, list] of groups) {
    const byTime = [...list].sort((a, b) => b.at.localeCompare(a.at));
    const newest = byTime[0]!;
    const explanation = itemExplanation(newest);
    const spark = bucketCounts(
      list.map((i) => i.at),
      frame,
    );
    issues.push({
      key,
      catalogCode: newest.catalogCode,
      code: newest.code ?? newest.catalogCode,
      headline: itemHeadline(newest),
      quoted: itemHeadlineQuoted(newest),
      cause: explanation.basis === 'nothing' ? null : explanation,
      count: list.length,
      people: distinct(list, personKey),
      coaches: distinct(
        list.filter((i) => i.role === 'coach'),
        (i) => i.userId,
      ),
      players: distinct(
        list.filter((i) => i.role === 'player'),
        (i) => i.userId,
      ),
      signedOut: distinct(
        list.filter((i) => i.role === 'signed-out'),
        (i) => i.sessionId,
      ),
      unknownRole: list.filter((i) => i.role === null).length,
      firstAt: byTime[byTime.length - 1]!.at,
      lastAt: newest.at,
      state: newest.state,
      spark,
      rising: isRising(spark),
      mostly: mostlyOf(list, items),
      pages: distinct(list, (i) => i.page || null),
      pageName: distinct(list, (i) => i.page || null) === 1 ? newest.pageName : null,
      newest,
    });
  }
  return issues.sort((a, b) => b.people - a.people || b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.key.localeCompare(b.key));
}

/** "3 coaches, 1 player and 2 signed out": who it reached, in words, with the parts that are zero left out. */
export function whoWords(issue: Pick<Issue, 'coaches' | 'players' | 'signedOut' | 'unknownRole'>): string {
  const parts: string[] = [];
  if (issue.coaches) parts.push(`${issue.coaches} ${issue.coaches === 1 ? 'coach' : 'coaches'}`);
  if (issue.players) parts.push(`${issue.players} ${issue.players === 1 ? 'player' : 'players'}`);
  if (issue.signedOut) parts.push(`${issue.signedOut} signed out`);
  if (issue.unknownRole) parts.push(`${issue.unknownRole} with the role unknown`);
  if (!parts.length) return 'no one we can name';
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The issues as Markdown, for the Copy report button (no user ids, no team ids). */
export function issuesReport(issues: readonly Issue[], o: { windowLabel: string; pipeLabel: string }): string {
  const lines = [`# Reliability issues · ${o.windowLabel}`, '', `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} · ${o.pipeLabel}`, ''];
  for (const i of issues) {
    const flags = [i.state === 'new' ? 'new in this release' : null, i.rising ? 'rising' : null, ...i.mostly.map((m) => m.text)].filter(Boolean).join(', ');
    lines.push(
      `- **${i.headline}**${i.code ? ` (${i.code})` : ''}: ${i.count} ${i.count === 1 ? 'failure' : 'failures'}, ${i.people} ${i.people === 1 ? 'person' : 'people'} (${whoWords(i)})${i.pageName ? ` on ${i.pageName}` : ` on ${i.pages} pages`}${flags ? `; ${flags}` : ''}`,
    );
  }
  return lines.join('\n');
}
