/**
 * The pure rules behind the Today, Product, Ship and Desk spaces (plan:
 * docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md, branch E).
 *
 * Every number a landing shows passes through here, so the rules are written once and tested once
 * (`__tests__/model.test.ts`). Nothing here reads the clock, the network or the database: callers pass `now` and the
 * readers' results. A source that could not be read arrives as `{ ok: false }` and is carried through as unknown, never
 * as a zero (AGENTS.md honesty rules: `null` reads "not measured yet", a failed read is never a clean number).
 */

import type { Tone } from '../_ui/ui';
import { teamState } from '@/lib/admin/data/people-space-model';

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** One reader's outcome. `ok: false` is a failed read: the screen shows the failed state, never a number. */
export type Read<T> = { ok: true; data: T } | { ok: false; error: string };

export const readOk = <T,>(data: T): Read<T> => ({ ok: true, data });
export const readFailed = <T,>(error: string): Read<T> => ({ ok: false, error });
export const valueOf = <T,>(r: Read<T>): T | null => (r.ok ? r.data : null);

// ---------------------------------------------------------------------------
// Words and time (UTC everywhere: Vercel runs in UTC and a dev laptop does not)
// ---------------------------------------------------------------------------

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function utcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "Thursday 26 November". */
export function utcDateLine(now: number): string {
  return new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "14:05", 24-hour UTC. */
export function utcClock(iso: string | number): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}

/** "26 Nov". */
export function utcShortDate(t: number): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "3 hours ago", "2 days ago", "just now". */
export function ago(fromMs: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - fromMs) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${plural(mins, 'minute')} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.floor(hours / 24), 'day')} ago`;
}

export const shortSha = (sha: string) => sha.slice(0, 7);

// ---------------------------------------------------------------------------
// Rounds per week: rolling 7-day windows ending now (a calendar week would read near zero every Monday)
// ---------------------------------------------------------------------------

/**
 * Counts per rolling 7-day window, oldest first; the last entry is the 7 days ending `now`. A timestamp in the future
 * or older than the oldest window is ignored, as is one that does not parse.
 */
export function bucketWeeks(timestamps: readonly string[], now: number, weeks = 12): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const iso of timestamps) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t > now) continue;
    const back = Math.floor((now - t) / WEEK_MS);
    if (back >= weeks) continue;
    out[weeks - 1 - back]! += 1;
  }
  return out;
}

/** Four labels under a 12-week chart: the start of the oldest window, two in between, and "last 7 days". */
export function weekTicks(now: number, weeks = 12): string[] {
  const startOf = (i: number) => now - (weeks - i) * WEEK_MS;
  const step = Math.round(weeks / 3);
  return [utcShortDate(startOf(0)), utcShortDate(startOf(step)), utcShortDate(startOf(step * 2)), 'last 7 days'];
}

// ---------------------------------------------------------------------------
// Teams: active this week, and who went quiet (from fetchPulseGrid's 30 daily buckets)
// ---------------------------------------------------------------------------

export interface TeamBucketsLite {
  teamId: string;
  name: string;
  sport: 'golf' | 'baseball';
  /** Oldest first, one per UTC day, the last one today. */
  buckets: ReadonlyArray<{ activity: number }>;
  /** Teams pulse's halo, the same input People's team state reads. Absent in older callers: then not counted as active now. */
  halo?: 'fresh' | 'cooling' | 'silent';
}

export interface TeamActivity {
  total: number;
  /** Teams with any activity in the last 7 daily buckets (today included). */
  activeThisWeek: number;
  /** Teams People calls "active": its teamState() on the pulse halo (did something in the last 2 days). */
  activeNow: number;
  /** Active in the 7 days before that, silent in the last 7: the halo went from lit to dark this week. */
  wentQuiet: ReadonlyArray<{ teamId: string; name: string }>;
}

const activityIn = (buckets: ReadonlyArray<{ activity: number }>, from: number, to: number) =>
  buckets.slice(Math.max(0, buckets.length - to), Math.max(0, buckets.length - from)).reduce((a, b) => a + b.activity, 0);

export function teamActivity(teams: readonly TeamBucketsLite[]): TeamActivity {
  let activeThisWeek = 0;
  let activeNow = 0;
  const wentQuiet: Array<{ teamId: string; name: string }> = [];
  for (const t of teams) {
    const thisWeek = activityIn(t.buckets, 0, 7);
    const weekBefore = activityIn(t.buckets, 7, 14);
    if (t.halo && teamState(t.halo, true) === 'active') activeNow += 1;
    if (thisWeek > 0) activeThisWeek += 1;
    else if (weekBefore > 0) wentQuiet.push({ teamId: t.teamId, name: t.name });
  }
  return { total: teams.length, activeThisWeek, activeNow, wentQuiet };
}

/** fetchPulseGrid reports a failed sub-read only in its note text; treat that as a failed read, not a partial zero. */
export function pulseGridIncomplete(degradedNote: string): boolean {
  return degradedNote.includes('INCOMPLETE THIS RUN');
}

// ---------------------------------------------------------------------------
// The live release
// ---------------------------------------------------------------------------

export interface ReleaseCardLite {
  commitSha: string | null;
  commitMessage: string | null;
  createdAt: number;
  gatheringSignal: boolean;
  errorsBefore2h: number;
  errorsAfter2h: number | null;
  newFingerprintsSince: number;
  resolvedAndQuietSince: number;
  verdict: { tone: 'success' | 'neutral' | 'danger'; label: string };
}

export type ReleaseState = 'clean' | 'gathering' | 'new-errors' | 'regressed' | 'unstamped' | 'outside-ledger';

export interface ReleaseHealth {
  state: ReleaseState;
  /** The served SHA (full), when this deployment carries its release stamp. */
  sha: string | null;
  card: ReleaseCardLite | null;
}

/** The ledger card for one deploy, judged. "Clean" needs the 2-hour after-window to be full and no new fingerprints. */
export function judgeCard(card: ReleaseCardLite): Exclude<ReleaseState, 'unstamped' | 'outside-ledger'> {
  if (card.gatheringSignal) return 'gathering';
  if (card.newFingerprintsSince > 0) return 'new-errors';
  if (card.verdict.tone === 'danger') return 'regressed';
  return 'clean';
}

/**
 * Which release is live is read from the deployment's own stamp (`liveRef()`: NEXT_PUBLIC_SENTRY_RELEASE, then
 * VERCEL_GIT_COMMIT_SHA), never assumed to be the newest card: a rollback serves an older one.
 */
export function releaseHealth(servedSha: string | null, cards: readonly ReleaseCardLite[]): ReleaseHealth {
  if (!servedSha) return { state: 'unstamped', sha: null, card: null };
  const card = cards.find((c) => c.commitSha !== null && (c.commitSha.startsWith(servedSha) || servedSha.startsWith(c.commitSha)));
  if (!card) return { state: 'outside-ledger', sha: servedSha, card: null };
  return { state: judgeCard(card), sha: servedSha, card };
}

export const RELEASE_WORD: Record<ReleaseState, { word: string; tone: Tone }> = {
  clean: { word: 'Clean', tone: 'good' },
  gathering: { word: 'Gathering', tone: 'muted' },
  'new-errors': { word: 'New errors', tone: 'bad' },
  regressed: { word: 'More errors', tone: 'bad' },
  unstamped: { word: 'Unknown', tone: 'muted' },
  'outside-ledger': { word: 'No verdict', tone: 'muted' },
};

export function releaseSentence(r: ReleaseHealth): string {
  const sha = r.sha ? shortSha(r.sha) : null;
  switch (r.state) {
    case 'clean':
      return `The live release ${sha} is clean: no new error fingerprints since it went out.`;
    case 'gathering':
      return `The live release ${sha} went out under two hours ago and is still gathering signal.`;
    case 'new-errors':
      return `The live release ${sha} has ${plural(r.card?.newFingerprintsSince ?? 0, 'new error fingerprint')} since it went out.`;
    case 'regressed':
      return `The live release ${sha} logged more errors in its first two hours than in the two before it.`;
    case 'outside-ledger':
      return `The live release ${sha} went out more than 7 days ago, outside the release ledger, so it has no verdict here.`;
    case 'unstamped':
      return 'This deployment carries no release stamp, so which release is live is unknown.';
  }
}

// ---------------------------------------------------------------------------
// Jobs and integrity checks
// ---------------------------------------------------------------------------

export type JobStatus = 'ok' | 'overdue' | 'never-ran' | 'failed' | 'degraded';

export interface JobsSummary {
  total: number;
  ok: number;
  failed: number;
  degraded: number;
  overdue: number;
  neverRan: number;
  /** Job types whose history could not be read: unknown, not "never ran". */
  unreadable: number;
  integrityTotal: number;
  integrityFailed: number;
}

export function summarizeJobs(
  board: ReadonlyArray<{ status: JobStatus; unreadable?: boolean }>,
  integrity: ReadonlyArray<{ status: 'pass' | 'fail' }>,
): JobsSummary {
  const s: JobsSummary = {
    total: board.length,
    ok: 0,
    failed: 0,
    degraded: 0,
    overdue: 0,
    neverRan: 0,
    unreadable: 0,
    integrityTotal: integrity.length,
    integrityFailed: integrity.filter((i) => i.status === 'fail').length,
  };
  for (const j of board) {
    if (j.unreadable) s.unreadable += 1;
    else if (j.status === 'ok') s.ok += 1;
    else if (j.status === 'failed') s.failed += 1;
    else if (j.status === 'degraded') s.degraded += 1;
    else if (j.status === 'overdue') s.overdue += 1;
    else s.neverRan += 1;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Held migrations (supabase/migrations/HELD.md, read by command-deck/held-migrations.ts)
// ---------------------------------------------------------------------------

export function heldCount(rows: ReadonlyArray<{ status: string }>): number {
  return rows.filter((r) => r.status === 'HOLD').length;
}

// ---------------------------------------------------------------------------
// Clubhouse failures today (clubhouse_signal_hourly)
// ---------------------------------------------------------------------------

export interface ClubhouseToday {
  /** Distinct CH codes that failed today: each one is a cause, the unit "waiting on you" counts. */
  causes: number;
  failures: number;
  people: number;
  /** False when the signal pipe is off, silent or unread (R-09): a zero then means nothing. */
  trusted: boolean;
  pipeLabel: string;
}

export function clubhouseToday(
  rows: ReadonlyArray<{ kind: string; outcome: string | null; code: string; signal_count: number; user_ids: string[] }>,
  pipe: { untrusted: boolean; label: string },
): ClubhouseToday {
  const codes = new Set<string>();
  const people = new Set<string>();
  let failures = 0;
  for (const r of rows) {
    if (!(r.kind === 'crash' || r.outcome === 'failure')) continue;
    codes.add(r.code);
    failures += Number(r.signal_count || 0);
    for (const u of r.user_ids ?? []) people.add(u);
  }
  return { causes: codes.size, failures, people: people.size, trusted: !pipe.untrusted, pipeLabel: pipe.label };
}

// ---------------------------------------------------------------------------
// Waiting on you
// ---------------------------------------------------------------------------

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * A log line made readable for the Today list: leading [tags] out, user ids as "a user" (never an id on a glance list;
 * players may be minors) and other ids dropped, snake_case words as words, first letter up, one line.
 * "[push.sendPushNotification.deliver] [push] no device accepted this new_message for user 52ed…" →
 * "No device accepted this new message for a user".
 */
export function plainActivityTitle(title: string): string {
  let t = title
    .replace(/^(\s*\[[^\]]{1,80}\]\s*)+/, '')
    .replace(new RegExp(`\\b(user|player|coach|for|by)\\s+${UUID.source}`, 'gi'), (_m, w: string) => (/^(for|by)$/i.test(w) ? `${w} a user` : `a ${w.toLowerCase()}`))
    .replace(new RegExp(`\\s*${UUID.source}`, 'gi'), '')
    .replace(/\b([a-z]+)_([a-z]+)\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  // An email or handle at the start stays as written.
  if (!/^\S*@/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 140 ? `${t.slice(0, t.lastIndexOf(' ', 138))}…` : t;
}

/**
 * A line that starts with an email ("coach@school.edu signed in") as who, what and where: on a phone the whole
 * address is one unbreakable word that wrapped as "demo-" / "coach@…". The row shows who and what, the domain after.
 */
export function splitLeadingEmail(text: string): { who: string; rest: string; domain: string } | null {
  const m = /^([^\s@]+)@([^\s@]+\.[^\s@]+)(\s.*)?$/.exec(text);
  if (!m) return null;
  return { who: m[1]!, domain: m[2]!, rest: (m[3] ?? '').trim() };
}

/** "2 could not be read", "1 unknown", "1 could not be read, 1 unknown": why the total is only "at least". */
export function needUnknownWords(n: Pick<Needs, 'unread' | 'failed'>): string {
  const unknown = n.unread - n.failed;
  const parts = [n.failed ? `${n.failed} could not be read` : '', unknown ? `${unknown} unknown` : ''].filter(Boolean);
  return parts.join(', ');
}

/** Why the release's error count is unknown although the ledger read worked. */
const RELEASE_UNKNOWN: Partial<Record<ReleaseState, string>> = {
  unstamped: 'unknown: this deployment carries no release stamp',
  'outside-ledger': 'unknown: the live release is not in the ledger',
  gathering: 'unknown yet: the release is under two hours old',
};

export interface NeedRow {
  key: string;
  /** `null` when the count is not known: its source could not be read, or it answered without a usable number. */
  count: number | null;
  /** Why a null count is unknown when the read itself worked ("no release stamp"); absent means the read failed. */
  unknown?: string;
  title: string;
  href: string;
  tone: Tone;
}

export interface Needs {
  rows: NeedRow[];
  /** Sum of the rows that read. Every row counts discrete items (a job, a migration, a team, a cause). */
  total: number;
  /** Rows whose source could not be read: the total is then "at least". */
  /** Rows whose count is null for any reason (failed read or unknown). */
  unread: number;
  /** Of those, rows whose read failed. The rest are unknown for a stated reason. */
  failed: number;
}

export interface NeedsInput {
  jobs: Read<JobsSummary>;
  held: Read<number>;
  teams: Read<TeamActivity>;
  release: Read<ReleaseHealth>;
  clubhouse: Read<ClubhouseToday>;
}

export function assembleNeeds(i: NeedsInput): Needs {
  const rows: NeedRow[] = [];
  const add = (row: NeedRow) => {
    if (row.count === null || row.count > 0) rows.push(row);
  };
  const jobs = valueOf(i.jobs);
  add({
    key: 'jobs-failing',
    count: jobs ? jobs.failed + jobs.degraded + jobs.integrityFailed : null,
    title: 'Jobs and checks failing',
    href: '/admin/jobs',
    tone: 'bad',
  });
  if (jobs) add({ key: 'jobs-overdue', count: jobs.overdue, title: 'Jobs overdue', href: '/admin/jobs', tone: 'watch' });
  add({ key: 'held', count: valueOf(i.held), title: 'Migrations held for your decision', href: '/admin/spaces/desk', tone: 'watch' });
  const teams = valueOf(i.teams);
  const quiet = teams?.wentQuiet ?? [];
  add({
    key: 'quiet-teams',
    count: teams ? quiet.length : null,
    title: quiet.length === 1 ? `${quiet[0]!.name} went quiet this week` : 'Teams went quiet this week',
    href: '/admin/spaces/people',
    tone: 'watch',
  });
  const release = valueOf(i.release);
  add({
    key: 'release-errors',
    // No stamp, no ledger card or still gathering: the count is unknown, so the total reads "at least", never a clean 0.
    count: !release || release.state === 'unstamped' || release.state === 'outside-ledger' || release.state === 'gathering' ? null : release.state === 'new-errors' ? (release.card?.newFingerprintsSince ?? 0) : 0,
    unknown: !release ? undefined : RELEASE_UNKNOWN[release.state],
    title: 'New error fingerprints since the release',
    href: '/admin/deploys',
    tone: 'bad',
  });
  const ch = valueOf(i.clubhouse);
  add({
    key: 'clubhouse',
    // A zero from a pipe that is off or silent is not a zero (R-09).
    count: ch ? (ch.causes > 0 || ch.trusted ? ch.causes : null) : null,
    unknown: ch && !ch.trusted && ch.causes === 0 ? `unknown (${ch.pipeLabel})` : undefined,
    title: ch && ch.causes > 0 ? `Clubhouse failure causes today · ${plural(ch.people, 'person', 'people')}` : 'Clubhouse failures today',
    href: '/admin/spaces/reliability',
    tone: 'bad',
  });
  const total = rows.reduce((a, r) => a + (r.count ?? 0), 0);
  const unread = rows.filter((r) => r.count === null);
  return { rows, total, unread: unread.length, failed: unread.filter((r) => !r.unknown).length };
}

// ---------------------------------------------------------------------------
// Today's headline
// ---------------------------------------------------------------------------

export interface HeadlineInput {
  teams: Read<TeamActivity>;
  /** 12 rolling weeks, oldest first. */
  rounds: Read<number[]>;
  release: Read<ReleaseHealth>;
  needs: Needs;
  /** Sources on the page that answered, and how many it reads. */
  reading: { ok: number; total: number };
}

export interface Headline {
  title: string;
  second: string;
  secondTone: Tone;
  lede: string;
}

export function usageLine(teams: TeamActivity | null, rounds: number[] | null): { second: string; tone: Tone } {
  if (!teams) return { second: 'Usage could not be read.', tone: 'muted' };
  if (teams.total === 0) return { second: 'No teams yet.', tone: 'muted' };
  if (teams.activeThisWeek === 0) return { second: 'Nobody used it this week.', tone: 'watch' };
  const thisWeek = rounds?.at(-1) ?? null;
  const lastWeek = rounds?.at(-2) ?? null;
  if (teams.activeThisWeek / teams.total < 1 / 3 || thisWeek === 0) return { second: 'Usage is thin.', tone: 'watch' };
  if (thisWeek !== null && lastWeek !== null && lastWeek > 0 && thisWeek < lastWeek / 2) return { second: 'Usage is falling.', tone: 'watch' };
  return { second: 'Teams are using it.', tone: 'good' };
}

export function todayHeadline(i: HeadlineInput): Headline {
  const teams = valueOf(i.teams);
  const rounds = valueOf(i.rounds);
  const release = valueOf(i.release);

  let title = 'Helm is up.';
  if (i.reading.total > 0 && i.reading.ok * 2 < i.reading.total) title = 'Bridge can’t see much.';
  else if (release && (release.state === 'new-errors' || release.state === 'regressed')) title = 'The release left errors.';

  const { second, tone } =
    title === 'Bridge can’t see much.' ? { second: 'Most reads failed.', tone: 'bad' as Tone } : usageLine(teams, rounds);

  const parts: string[] = [];
  const thisWeek = rounds?.at(-1);
  if (teams) {
    const roundsPart =
      thisWeek === undefined ? '' : thisWeek === 0 ? ', and nobody logged a round' : `, and ${plural(thisWeek, 'round was', 'rounds were')} logged`;
    parts.push(`${teams.activeThisWeek} of ${plural(teams.total, 'team')} used Helm in the last 7 days${roundsPart}.`);
  } else {
    parts.push('Team activity could not be read.');
  }
  parts.push(release ? releaseSentence(release) : 'The release ledger could not be read.');
  if (i.needs.total === 0 && i.needs.unread > 0) {
    parts.push('What is waiting on you could not be fully read.');
  } else if (i.needs.total > 0) {
    const n = i.needs.unread > 0 ? `At least ${i.needs.total}` : String(i.needs.total);
    parts.push(`${n} ${i.needs.total === 1 && i.needs.unread === 0 ? 'thing is' : 'things are'} waiting on you.`);
  } else {
    parts.push('Nothing is waiting on you.');
  }
  return { title, second, secondTone: tone, lede: parts.join(' ') };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export type HealthStatus = 'green' | 'amber' | 'red' | 'neutral';

export interface FeatureLite {
  key: string;
  label: string;
  app: 'golfhelm' | 'coachhelm' | 'baseballhelm';
  tier: 'high' | 'med' | 'low';
  uniqueUsers30d: number;
  uniqueUsers7d: number;
  usedToday: boolean;
  quietDays: number;
}

export interface ProductSummary {
  total: number;
  usedToday: number;
  used7d: number;
  used30d: number;
  /** null when feature health could not be read (never 0). */
  red: number | null;
  amber: number | null;
}

export function productSummary(features: readonly FeatureLite[], health: ReadonlyMap<string, HealthStatus> | null): ProductSummary {
  return {
    total: features.length,
    usedToday: features.filter((f) => f.usedToday).length,
    used7d: features.filter((f) => f.uniqueUsers7d > 0).length,
    used30d: features.filter((f) => f.uniqueUsers30d > 0).length,
    red: health ? [...health.values()].filter((s) => s === 'red').length : null,
    amber: health ? [...health.values()].filter((s) => s === 'amber').length : null,
  };
}

export const APP_WORD: Record<FeatureLite['app'], string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

const TIER_RANK: Record<FeatureLite['tier'], number> = { high: 0, med: 1, low: 2 };

/** One band per app, live features first (most people in 30 days), then by how core the feature is. */
export function featureBands(features: readonly FeatureLite[]): Array<{ app: FeatureLite['app']; features: FeatureLite[]; alive: number }> {
  const order: FeatureLite['app'][] = ['golfhelm', 'coachhelm', 'baseballhelm'];
  return order
    .map((app) => {
      const list = features
        .filter((f) => f.app === app)
        .sort((a, b) => b.uniqueUsers30d - a.uniqueUsers30d || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.label.localeCompare(b.label));
      return { app, features: list, alive: list.filter((f) => f.uniqueUsers30d > 0).length };
    })
    .filter((b) => b.features.length > 0);
}

export function productHeadline(s: ProductSummary): { title: string; second: string; tone: Tone } {
  const title =
    s.used7d === 0 ? 'No feature was used this week.' : `${s.used7d} of ${plural(s.total, 'feature')} used this week.`;
  if (s.red === null || s.amber === null) return { title, second: 'Health could not be read.', tone: 'muted' };
  if (s.red > 0) return { title, second: `${s.red} red, ${s.amber} amber.`, tone: 'bad' };
  if (s.amber > 0) return { title, second: `${plural(s.amber, 'amber flag')}, none red.`, tone: 'watch' };
  return { title, second: 'No health flags.', tone: 'good' };
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

export interface FlagLite {
  status: 'active' | 'archived';
  rolloutStatus: 'active' | 'expiring_soon' | 'expired' | 'archived' | 'no_expiry';
  environment: { production: boolean };
}

export function flagSummary(flags: readonly FlagLite[]): { live: number; onInProduction: number; expiringSoon: number; expired: number } {
  const live = flags.filter((f) => f.status === 'active');
  return {
    live: live.length,
    onInProduction: live.filter((f) => f.environment.production).length,
    expiringSoon: live.filter((f) => f.rolloutStatus === 'expiring_soon').length,
    expired: live.filter((f) => f.rolloutStatus === 'expired').length,
  };
}

export interface Freshness {
  state: 'unknown' | 'current' | 'behind' | 'stale';
  summary: string;
}

export function shipHeadline(release: ReleaseHealth | null, fresh: Freshness): { title: string; second: string; tone: Tone } {
  if (!release || !release.sha) return { title: 'The live release is unknown.', second: 'This deployment has no release stamp.', tone: 'muted' };
  const title = `${shortSha(release.sha)} is live.`;
  if (fresh.state === 'current') return { title, second: 'Level with main.', tone: 'good' };
  if (fresh.state === 'behind') return { title, second: 'Main has more to ship.', tone: 'watch' };
  if (fresh.state === 'stale') return { title, second: 'Production is behind main.', tone: 'watch' };
  return { title, second: 'Drift from main is unknown.', tone: 'muted' };
}

// ---------------------------------------------------------------------------
// Desk
// ---------------------------------------------------------------------------

export interface DecisionRow {
  key: string;
  kind: 'held-migration' | 'ben-leah';
  state: string;
  title: string;
  why: string;
  href: string;
  tone: Tone;
}

export function excerpt(text: string, max = 220): string {
  const plain = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function deskQueue(
  held: ReadonlyArray<{ migration: string; status: string; why: string; decided: string }> | null,
  reports: ReadonlyArray<{ number: number; displayTitle: string; priority: 'normal' | 'high' | 'urgent' | null; kind: string | null; created_at: string }> | null,
): DecisionRow[] {
  const rows: DecisionRow[] = [];
  const PRI: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
  for (const r of [...(reports ?? [])].sort((a, b) => (PRI[a.priority ?? 'normal'] ?? 2) - (PRI[b.priority ?? 'normal'] ?? 2) || b.created_at.localeCompare(a.created_at))) {
    rows.push({
      key: `ben-leah:${r.number}`,
      kind: 'ben-leah',
      state: r.priority === 'urgent' ? 'Urgent report' : r.priority === 'high' ? 'High report' : 'Open report',
      title: `#${r.number} ${r.displayTitle}`,
      why: r.kind ? `A ${r.kind} from Ben + Leah, filed ${r.created_at.slice(0, 10)}.` : `From Ben + Leah, filed ${r.created_at.slice(0, 10)}.`,
      href: '/admin/ben-leah',
      tone: r.priority === 'urgent' || r.priority === 'high' ? 'bad' : 'watch',
    });
  }
  for (const h of held ?? []) {
    if (h.status !== 'HOLD') continue;
    rows.push({
      key: `held:${h.migration}`,
      kind: 'held-migration',
      state: 'Held migration',
      title: h.migration,
      why: excerpt(h.why),
      href: '/admin/engineering',
      tone: 'watch',
    });
  }
  return rows;
}

export function deskHeadline(held: number | null, reports: number | null): { title: string; second: string; tone: Tone } {
  if (held === null && reports === null) return { title: 'The queue could not be read.', second: 'Neither source answered.', tone: 'bad' };
  const total = (held ?? 0) + (reports ?? 0);
  const atLeast = held === null || reports === null ? 'At least ' : '';
  if (total === 0 && !atLeast) return { title: 'Nothing is waiting on you.', second: 'The queue is empty.', tone: 'good' };
  if (total === 0) return { title: 'Nothing found so far.', second: 'One source could not be read, so the queue may not be empty.', tone: 'watch' };
  const title = `${atLeast}${plural(total, 'decision')} ${total === 1 && !atLeast ? 'is' : 'are'} waiting.`;
  const bits: string[] = [];
  if (held !== null && held > 0) bits.push(plural(held, 'held migration'));
  if (reports !== null && reports > 0) bits.push(plural(reports, 'open report'));
  return { title: atLeast ? title.charAt(0).toUpperCase() + title.slice(1) : title, second: bits.length ? `${bits.join(', ')}.` : 'One source could not be read.', tone: 'watch' };
}

// ---------------------------------------------------------------------------
// Copy report (no names: players may be minors)
// ---------------------------------------------------------------------------

export function todayReport(i: {
  now: number;
  headline: Headline;
  tiles: ReadonlyArray<{ label: string; value: string | null; sub: string }>;
  needs: Needs;
  rounds: number[] | null;
}): string {
  const lines = [
    `# Helm today · ${utcDateLine(i.now)} · ${utcClock(i.now)} UTC`,
    '',
    `${i.headline.title} ${i.headline.second}`,
    '',
    i.headline.lede,
    '',
    '## Pulse',
    ...i.tiles.map((t) => `- ${t.label}: ${t.value ?? 'not measured yet'} (${t.sub})`),
    '',
    '## Waiting on you',
    ...(i.needs.rows.length
      ? i.needs.rows.map((r) => `- ${r.count ?? 'could not read'} · ${r.key === 'quiet-teams' ? 'Teams went quiet this week' : r.title}`)
      : ['- nothing']),
    '',
    '## GolfHelm rounds, rolling 7-day windows (oldest first, test rounds excluded)',
    i.rounds ? i.rounds.join(', ') : 'could not read',
  ];
  return lines.join('\n');
}
