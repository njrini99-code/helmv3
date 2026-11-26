/**
 * The live lenses' view models (plan §8: B01 Pulse, B06 additions, B07 Sessions, B08 People and teams, B09
 * Experience, B10 Releases; §5 rules; §10 digest). Everything here is pure: rows in, numbers out. The server reads
 * (live.ts) fetch the rows; the screens, the rules runner and the digest call these.
 *
 * Isomorphic and offline: no database, no clock (callers pass `now`), no React. The tests seed
 * `__tests__/fixtures-live.ts`.
 */
import type { BridgeGraph } from './graph';
import { DURATION_EDGES_MS } from './ingest';
import {
  actionDegraded,
  contractDrift,
  crashLoop,
  frustration,
  newAfterRelease,
  pageWentQuiet,
  pipeSilent,
  retryStorm,
  silentActionRate,
  slowAction,
  spike,
  vitalRegression,
  type AlertSeverity,
  type BridgeAlert,
} from './rules';
import { DEFAULT_LIVE, PLATFORM_WORDS, type LiveScope } from './live-scope';
import { FAILURE_CATEGORIES, withScope, type ClubhouseScope } from './screens';

// ---------------------------------------------------------------------------
// Rows, as the held migration 20261124090000 stores them
// ---------------------------------------------------------------------------

export interface HourlyRow {
  bucket_hour: string;
  code: string;
  kind: string;
  outcome: string;
  /** The useAction name for actions, the control for taps and frustration, the metric (INP/LCP/CLS) for vitals. */
  act: string;
  role: string;
  platform: string;
  release: string;
  bridge_id: number | null;
  page_id: string;
  signal_count: number;
  user_ids: string[];
  duration_buckets: number[];
  last_at: string;
}

export interface SessionRow {
  session_id: string;
  user_id: string | null;
  role: string;
  team_id: string | null;
  platform: string;
  release: string;
  started_at: string;
  last_at: string;
  ended_at: string | null;
  pages: string[];
  signal_count: number;
  failure_count: number;
  replay_id: string | null;
}

export interface SessionEventRow {
  session_id: string;
  seq: number;
  sent_at: string;
  kind: string;
  outcome: string | null;
  code: string | null;
  bridge_id: number | null;
  page_id: string | null;
  act: string | null;
  action_id: string | null;
  control_id: string | null;
  duration_ms: number | null;
  server_code: string | null;
  message: string | null;
  trail: string[] | null;
  drift: string[];
}

export interface DriftRow {
  kind: string;
  code: string;
  release: string;
  drift_count: number;
  first_seen: string;
  last_seen: string;
}

/** What one read returns: rows, nothing to read yet (the migration is held, or the pipe is off), or a real failure. */
export type LiveState = 'ok' | 'no-signal' | 'error';
export interface LiveRead<T> {
  state: LiveState;
  data: T;
  /** More rows matched than the read keeps; the screen says so on its truth line. */
  truncated?: boolean;
  error?: string;
}

/**
 * PostgREST and Postgres codes for "this table, column or function isn't there". While the migration is held, every
 * read hits one of these, and the screen shows "No signal yet" (BR-xx93), never an error page.
 */
export const MISSING_SCHEMA_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883']);

export function classifyReadError(error: { code?: string | null; message?: string | null } | null | undefined): LiveState {
  if (!error) return 'ok';
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return 'no-signal';
  // Some PostgREST builds put the missing relation only in the message.
  if (/relation .* does not exist|could not find the table|column .* does not exist/i.test(error.message ?? '')) return 'no-signal';
  return 'error';
}

// ---------------------------------------------------------------------------
// The live scope: window and platform join page, role and viewport (plan §7.3)
// ---------------------------------------------------------------------------

export {
  DEFAULT_LIVE,
  LIVE_PLATFORMS,
  LIVE_WINDOWS,
  PLATFORM_WORDS,
  WINDOW_MS,
  describeLive,
  parseLiveScope,
  type LivePlatform,
  type LiveScope,
  type LiveWindow,
} from './live-scope';

const HOUR_MS = 3_600_000;

/** A Clubhouse link that keeps the registry scope and the live one. Defaults add nothing to the URL. */
export function withLive(href: string, scope: ClubhouseScope, live: LiveScope, extra?: Record<string, string | number | null | undefined>): string {
  return withScope(href, scope, {
    w: live.w === DEFAULT_LIVE.w ? null : live.w,
    pf: live.pf === DEFAULT_LIVE.pf ? null : live.pf,
    ...extra,
  });
}

export const liveHref = {
  pulse: () => '/admin',
  sessions: () => '/admin/clubhouse/sessions',
  session: (id: string) => `/admin/clubhouse/sessions/${encodeURIComponent(id)}`,
  person: (id: string) => `/admin/clubhouse/people/${encodeURIComponent(id)}`,
  team: (id: string) => `/admin/clubhouse/teams/${encodeURIComponent(id)}`,
  experience: () => '/admin/clubhouse/experience',
  releases: () => '/admin/clubhouse/releases',
  release: (sha: string) => `/admin/clubhouse/releases/${encodeURIComponent(sha)}`,
  incident: (fp: string) => `/admin/errors/${encodeURIComponent(fp)}`,
};

/** Rows in the scope: role and platform are columns; a page scope keeps that page's rows. */
export function inScope<T extends { role?: string; platform?: string; page_id?: string | null }>(rows: readonly T[], scope: ClubhouseScope, live: LiveScope): T[] {
  return rows.filter(
    (r) =>
      (scope.role === 'all' || r.role === scope.role) &&
      (live.pf === 'all' || r.platform === live.pf) &&
      (!scope.page || r.page_id === scope.page),
  );
}

// ---------------------------------------------------------------------------
// Durations: quantiles from the histogram, the same way clubhouse_bucket_quantile does
// ---------------------------------------------------------------------------

/** Merge histograms bucket by bucket. Never average each row's own p95: that is not a p95. */
export function mergeBuckets(rows: ReadonlyArray<{ duration_buckets: number[] }>): number[] {
  const out = DURATION_EDGES_MS.map(() => 0);
  for (const r of rows) r.duration_buckets.forEach((n, i) => { if (i < out.length) out[i]! += n; });
  return out;
}

/**
 * The upper edge of the first bucket whose running total reaches ceil(total × q), as the SQL function reads it. An
 * upper edge overstates: an LCP between 2.0 and 3.0 s reads as 3000 ms.
 */
export function bucketQuantile(buckets: readonly number[], q: number): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const need = Math.ceil(total * q);
  let cum = 0;
  for (let i = 0; i < buckets.length; i++) {
    cum += buckets[i] ?? 0;
    if (cum >= need) return DURATION_EDGES_MS[i] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

export function isFailureRow(r: { kind: string; outcome: string | null }): boolean {
  return r.kind === 'crash' || r.outcome === 'failure';
}

const sum = (rows: ReadonlyArray<{ signal_count: number }>) => rows.reduce((a, r) => a + Number(r.signal_count || 0), 0);

function usersOf(rows: ReadonlyArray<{ user_ids: string[] }>): Set<string> {
  const s = new Set<string>();
  for (const r of rows) for (const u of r.user_ids ?? []) s.add(u);
  return s;
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export interface CodeTotal {
  code: string;
  bridgeId: number | null;
  page: string;
  count: number;
  users: number;
  failure: boolean;
  lastAt: string;
}

/** One line per code: how often it fired, for how many people, and whether it is a failure. Busiest first. */
export function codeTotals(rows: readonly HourlyRow[]): CodeTotal[] {
  return [...groupBy(rows, (r) => r.code).entries()]
    .map(([code, list]) => ({
      code,
      bridgeId: list.find((r) => r.bridge_id !== null)?.bridge_id ?? null,
      page: mostCommon(list.map((r) => r.page_id)) ?? '',
      count: sum(list),
      users: usersOf(list).size,
      failure: list.some(isFailureRow),
      lastAt: list.reduce((a, r) => (r.last_at > a ? r.last_at : a), ''),
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function mostCommon(values: readonly string[]): string | undefined {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

export interface ActionStat {
  act: string;
  page: string;
  starts: number;
  /** Outcomes other than start: success, failure, offline, busy, stopped waiting, cancelled. */
  tries: number;
  successes: number;
  failures: number;
  silent: number;
  /** Success over tries; null with no tries. */
  rate: number | null;
  p50: number | null;
  p95: number | null;
}

/** Each useAction name: tries, success rate, silent starts and duration quantiles (outcomes only, never starts). */
export function actionStats(rows: readonly HourlyRow[]): ActionStat[] {
  const actions = rows.filter((r) => r.kind === 'action' && r.act);
  return [...groupBy(actions, (r) => r.act).entries()]
    .map(([act, list]) => {
      const starts = sum(list.filter((r) => r.outcome === 'start'));
      const done = list.filter((r) => r.outcome && r.outcome !== 'start' && r.outcome !== 'retry');
      const tries = sum(done);
      const successes = sum(done.filter((r) => r.outcome === 'success'));
      const buckets = mergeBuckets(done);
      return {
        act,
        page: mostCommon(list.map((r) => r.page_id)) ?? '',
        starts,
        tries,
        successes,
        failures: sum(done.filter((r) => r.outcome === 'failure')),
        silent: Math.max(0, starts - tries),
        rate: tries > 0 ? successes / tries : null,
        p50: bucketQuantile(buckets, 0.5),
        p95: bucketQuantile(buckets, 0.95),
      };
    })
    .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.tries - a.tries || a.act.localeCompare(b.act));
}

export interface PageTile {
  page: string;
  name: string;
  views: number;
  failures: number;
  /** Failures per view, null with no views. */
  rate: number | null;
  worstCode: string | null;
  lastViewAt: string | null;
  coachFailures: number;
  playerFailures: number;
}

/** The page wall (B01): one tile per page in the graph, even a page that sent nothing (that is the point of R-08). */
export function pageWall(rows: readonly HourlyRow[], graph: Pick<BridgeGraph, 'pages'>): PageTile[] {
  const byPage = groupBy(rows, (r) => r.page_id);
  return Object.keys(graph.pages)
    .sort()
    .map((page) => {
      const list = byPage.get(page) ?? [];
      const views = list.filter((r) => r.kind === 'view');
      const fails = list.filter(isFailureRow);
      const worst = codeTotals(fails)[0];
      const viewCount = sum(views);
      return {
        page,
        name: graph.pages[page as keyof typeof graph.pages]?.name ?? page,
        views: viewCount,
        failures: sum(fails),
        rate: viewCount > 0 ? sum(fails) / viewCount : null,
        worstCode: worst?.code ?? null,
        lastViewAt: views.reduce<string | null>((a, r) => (a === null || r.last_at > a ? r.last_at : a), null),
        coachFailures: sum(fails.filter((r) => r.role === 'coach')),
        playerFailures: sum(fails.filter((r) => r.role === 'player')),
      };
    });
}

export interface ReleaseSummary {
  release: string;
  firstSeen: string;
  lastSeen: string;
  signals: number;
  failures: number;
  users: number;
}

/** Releases newest first, by when each was first heard from. */
export function releaseList(rows: readonly HourlyRow[]): ReleaseSummary[] {
  return [...groupBy(rows, (r) => r.release).entries()]
    .map(([release, list]) => ({
      release,
      firstSeen: list.reduce((a, r) => (r.bucket_hour < a ? r.bucket_hour : a), list[0]!.bucket_hour),
      lastSeen: list.reduce((a, r) => (r.last_at > a ? r.last_at : a), ''),
      signals: sum(list),
      failures: sum(list.filter(isFailureRow)),
      users: usersOf(list).size,
    }))
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.release.localeCompare(b.release));
}

export type CodeDeltaKind = 'new' | 'rising' | 'gone' | 'falling';
export interface CodeDelta {
  code: string;
  page: string;
  kind: CodeDeltaKind;
  now: number;
  before: number;
  users: number;
}
export interface ActionDelta {
  act: string;
  page: string;
  rateNow: number | null;
  rateBefore: number | null;
  p95Now: number | null;
  p95Before: number | null;
}
export interface ReleaseDiff {
  release: string;
  base: string | null;
  /** Hours after each deploy compared: the shorter of the two releases' lives, so neither is favoured. */
  hours: number;
  codes: CodeDelta[];
  actions: ActionDelta[];
}

/** A code counts as rising when it fired at least 1.5 times as often and at least 3 more times. */
const RISING_RATIO = 1.5;
const RISING_MIN = 3;

function firstHours(rows: readonly HourlyRow[], release: string, hours: number): HourlyRow[] {
  const mine = rows.filter((r) => r.release === release);
  if (!mine.length) return [];
  const start = Date.parse(mine.reduce((a, r) => (r.bucket_hour < a ? r.bucket_hour : a), mine[0]!.bucket_hour));
  return mine.filter((r) => Date.parse(r.bucket_hour) < start + hours * HOUR_MS);
}

function lifeHours(rows: readonly HourlyRow[], release: string): number {
  const mine = rows.filter((r) => r.release === release);
  if (!mine.length) return 0;
  const times = mine.map((r) => Date.parse(r.bucket_hour));
  return Math.floor((Math.max(...times) - Math.min(...times)) / HOUR_MS) + 1;
}

/**
 * What a release changed (B10): failure codes new, rising, falling and gone, and each action's success rate and p95,
 * against the base release over the same number of hours after each one's first signal. Plan §8 B10.
 */
export function releaseDiff(rows: readonly HourlyRow[], release: string, base: string | null): ReleaseDiff {
  const hours = base ? Math.max(1, Math.min(lifeHours(rows, release), lifeHours(rows, base))) : lifeHours(rows, release);
  const now = firstHours(rows, release, hours);
  const before = base ? firstHours(rows, base, hours) : [];
  const nowCodes = new Map(codeTotals(now.filter(isFailureRow)).map((c) => [c.code, c]));
  const beforeCodes = new Map(codeTotals(before.filter(isFailureRow)).map((c) => [c.code, c]));
  const codes: CodeDelta[] = [];
  for (const c of nowCodes.values()) {
    const b = beforeCodes.get(c.code);
    if (!b) codes.push({ code: c.code, page: c.page, kind: 'new', now: c.count, before: 0, users: c.users });
    else if (c.count >= b.count * RISING_RATIO && c.count - b.count >= RISING_MIN) codes.push({ code: c.code, page: c.page, kind: 'rising', now: c.count, before: b.count, users: c.users });
    else if (b.count >= c.count * RISING_RATIO && b.count - c.count >= RISING_MIN) codes.push({ code: c.code, page: c.page, kind: 'falling', now: c.count, before: b.count, users: c.users });
  }
  if (base) for (const b of beforeCodes.values()) if (!nowCodes.has(b.code)) codes.push({ code: b.code, page: b.page, kind: 'gone', now: 0, before: b.count, users: 0 });
  const order: Record<CodeDeltaKind, number> = { new: 0, rising: 1, falling: 2, gone: 3 };
  codes.sort((a, b) => order[a.kind] - order[b.kind] || b.now - a.now || b.before - a.before || a.code.localeCompare(b.code));
  const nowActs = new Map(actionStats(now).map((a) => [a.act, a]));
  const beforeActs = new Map(actionStats(before).map((a) => [a.act, a]));
  const actions = [...new Set([...nowActs.keys(), ...beforeActs.keys()])]
    .sort()
    .map((act) => {
      const n = nowActs.get(act);
      const b = beforeActs.get(act);
      return { act, page: n?.page ?? b?.page ?? '', rateNow: n?.rate ?? null, rateBefore: b?.rate ?? null, p95Now: n?.p95 ?? null, p95Before: b?.p95 ?? null };
    });
  return { release, base, hours, codes, actions };
}

/** The release before this one, by first signal; null for the oldest. */
export function previousRelease(list: readonly ReleaseSummary[], release: string): string | null {
  const i = list.findIndex((r) => r.release === release);
  return i === -1 ? null : list[i + 1]?.release ?? null;
}

/** Codes from a list that never fired in these rows ("never seen" needs every count, D2). */
export function neverSeen(codes: readonly string[], rows: readonly HourlyRow[]): string[] {
  const seen = new Set(rows.map((r) => r.code));
  return codes.filter((c) => !seen.has(c));
}

// ---------------------------------------------------------------------------
// B09 Experience
// ---------------------------------------------------------------------------

export const VITAL_METRICS = ['INP', 'LCP', 'CLS'] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export interface VitalRow {
  page: string;
  platform: string;
  samples: number;
  /** p75 in ms; CLS is sent ×1000, so 100 here is a CLS of 0.1. */
  inp: number | null;
  lcp: number | null;
  cls: number | null;
}

/** INP, LCP and CLS p75 per page and platform (CH-1954). Field data from real users, not the lab tiers. */
export function vitalsByPage(rows: readonly HourlyRow[]): VitalRow[] {
  const vitals = rows.filter((r) => r.kind === 'vital');
  return [...groupBy(vitals, (r) => `${r.page_id}|${r.platform}`).entries()]
    .map(([key, list]) => {
      const [page, platform] = key.split('|') as [string, string];
      const p75 = (m: VitalMetric) => bucketQuantile(mergeBuckets(list.filter((r) => r.act === m)), 0.75);
      return { page, platform, samples: sum(list), inp: p75('INP'), lcp: p75('LCP'), cls: p75('CLS') };
    })
    .sort((a, b) => a.page.localeCompare(b.page) || a.platform.localeCompare(b.platform));
}

export interface FrustrationRow {
  control: string;
  page: string;
  code: string;
  count: number;
  users: number;
}

/** Rage, dead and slow clicks (CH-1951 to 1953) per control; a click with no numbered control groups as "unnumbered". */
export function frustrationByControl(rows: readonly HourlyRow[]): FrustrationRow[] {
  const f = rows.filter((r) => r.kind === 'frustration');
  return [...groupBy(f, (r) => `${r.act}|${r.code}`).entries()]
    .map(([key, list]) => {
      const [control, code] = key.split('|') as [string, string];
      return { control: control || 'unnumbered', page: mostCommon(list.map((r) => r.page_id)) ?? '', code, count: sum(list), users: usersOf(list).size };
    })
    .sort((a, b) => b.users - a.users || b.count - a.count || a.control.localeCompare(b.control));
}

export interface WaitRow {
  page: string;
  code: string;
  shown: number;
}

/** How often loading states (categories 02 and 03) were drawn, per page and code. */
export function waitsByPage(rows: readonly HourlyRow[], categoryOf: (code: string) => number | null): WaitRow[] {
  const waits = rows.filter((r) => r.kind === 'state' && [2, 3].includes(categoryOf(r.code) ?? 0));
  return [...groupBy(waits, (r) => `${r.page_id}|${r.code}`).entries()]
    .map(([key, list]) => {
      const [page, code] = key.split('|') as [string, string];
      return { page, code, shown: sum(list) };
    })
    .sort((a, b) => b.shown - a.shown || a.page.localeCompare(b.page));
}

// ---------------------------------------------------------------------------
// B07 Sessions
// ---------------------------------------------------------------------------

export interface TimelineLane {
  page: string;
  events: SessionEventRow[];
}

/** One lane per page, in the order the person first reached it; events in seq order inside each. */
export function timelineLanes(events: readonly SessionEventRow[]): TimelineLane[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const lanes: TimelineLane[] = [];
  const byPage = new Map<string, TimelineLane>();
  for (const e of sorted) {
    const page = e.page_id ?? '';
    let lane = byPage.get(page);
    if (!lane) {
      lane = { page, events: [] };
      byPage.set(page, lane);
      lanes.push(lane);
    }
    lane.events.push(e);
  }
  return lanes;
}

export function sessionMinutes(s: Pick<SessionRow, 'started_at' | 'last_at' | 'ended_at'>): number {
  const end = Date.parse(s.ended_at ?? s.last_at);
  return Math.max(0, Math.round((end - Date.parse(s.started_at)) / 60_000));
}

/** Sessions with a failure first, then newest. */
export function sortSessions(rows: readonly SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => Number(b.failure_count > 0) - Number(a.failure_count > 0) || b.last_at.localeCompare(a.last_at));
}

export interface SessionFilter {
  failed: boolean;
  role: string | null;
  platform: string | null;
  page: string | null;
  release: string | null;
  user: string | null;
}

export function filterSessions(rows: readonly SessionRow[], f: SessionFilter): SessionRow[] {
  return rows.filter(
    (s) =>
      (!f.failed || s.failure_count > 0) &&
      (!f.role || s.role === f.role) &&
      (!f.platform || s.platform === f.platform) &&
      (!f.page || s.pages.includes(f.page)) &&
      (!f.release || s.release === f.release) &&
      (!f.user || s.user_id === f.user),
  );
}

/**
 * BR-0707 Reproduce: a session written as steps someone can follow, pseudonymous (role, platform, pages, taps, the
 * failure). Pages resolve to their first route through `routeOf`.
 */
export function reproSteps(s: Pick<SessionRow, 'role' | 'platform' | 'release'>, events: readonly SessionEventRow[], routeOf: (page: string) => string | null): string[] {
  const steps = [`Sign in as a ${s.role} on ${PLATFORM_WORDS[s.platform] ?? s.platform}, release ${s.release.slice(0, 7)}.`];
  let lastPage = '';
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const page = e.page_id ?? '';
    if (page && page !== lastPage && (e.kind === 'view' || !lastPage)) {
      steps.push(`Open ${page}${routeOf(page) ? ` (${routeOf(page)})` : ''}.`);
      lastPage = page;
    }
    if (e.kind === 'tap' && e.control_id) steps.push(`Tap ${e.control_id}.`);
    else if (e.kind === 'action' && e.outcome === 'start') steps.push(`Start ${e.action_id ?? e.act ?? 'an action'}.`);
    else if (isFailureRow({ kind: e.kind, outcome: e.outcome })) {
      steps.push(`Expect ${e.code ?? 'a failure'}${e.server_code ? ` (server ${e.server_code})` : ''}${e.kind === 'crash' ? ', a crash' : ''}.`);
    } else if (e.outcome === 'retry') steps.push(`Press Try again on ${e.code ?? 'the error'}.`);
  }
  return steps;
}

/** Codes a set of session events failed with, busiest first. */
export function failingCodes(events: readonly SessionEventRow[]): Array<{ code: string; page: string; count: number; sessions: number }> {
  const fails = events.filter((e) => isFailureRow({ kind: e.kind, outcome: e.outcome }) && e.code);
  return [...groupBy(fails, (e) => e.code!).entries()]
    .map(([code, list]) => ({ code, page: mostCommon(list.map((e) => e.page_id ?? '')) ?? '', count: list.length, sessions: new Set(list.map((e) => e.session_id)).size }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Actions that failed in a set of session events. */
export function failedActions(events: readonly SessionEventRow[]): Array<{ act: string; count: number }> {
  const fails = events.filter((e) => e.kind === 'action' && e.outcome === 'failure');
  return [...groupBy(fails, (e) => e.action_id ?? e.act ?? '').entries()]
    .filter(([act]) => act)
    .map(([act, list]) => ({ act, count: list.length }))
    .sort((a, b) => b.count - a.count || a.act.localeCompare(b.act));
}

/** A page wall for one team or person, from their session events (hourly rows carry no team). */
export function pageWallFromEvents(events: readonly SessionEventRow[]): Array<{ page: string; views: number; failures: number }> {
  return [...groupBy(events, (e) => e.page_id ?? '').entries()]
    .filter(([page]) => page)
    .map(([page, list]) => ({ page, views: list.filter((e) => e.kind === 'view').length, failures: list.filter((e) => isFailureRow({ kind: e.kind, outcome: e.outcome })).length }))
    .sort((a, b) => b.failures - a.failures || a.page.localeCompare(b.page));
}

// ---------------------------------------------------------------------------
// The pipe (R-09) and active hours
// ---------------------------------------------------------------------------

/**
 * Active hours: the spec doesn't define them. Default: the same hour of the week had envelopes in the previous four
 * weeks, or, before there is that much history, 12:00 to 03:59 UTC (8 am to midnight US Eastern, when coaches use it).
 */
export function isActiveHour(now: number, baselineCount: number | null): boolean {
  if (baselineCount !== null && baselineCount > 0) return true;
  const h = new Date(now).getUTCHours();
  return h >= 12 || h < 4;
}

export type PipeTone = 'live' | 'silent' | 'off' | 'no-signal' | 'unknown';
export interface PipeStatus {
  tone: PipeTone;
  /** Short text for the truth line. */
  label: string;
  lastEnvelopeAt: string | null;
  /** R-09 holds: every "all clear" on screen is untrusted. */
  untrusted: boolean;
  alert: BridgeAlert | null;
}

export function pipeStatus(i: { flagOn: boolean; state: LiveState; lastEnvelopeAt: string | null; now: number; activeHours: boolean }): PipeStatus {
  if (!i.flagOn) return { tone: 'off', label: 'pipe: switched off', lastEnvelopeAt: i.lastEnvelopeAt, untrusted: true, alert: null };
  if (i.state === 'error') return { tone: 'unknown', label: 'pipe: could not be read', lastEnvelopeAt: null, untrusted: true, alert: null };
  if (i.state === 'no-signal' || !i.lastEnvelopeAt) return { tone: 'no-signal', label: 'pipe: no signal yet', lastEnvelopeAt: null, untrusted: true, alert: null };
  const last = Date.parse(i.lastEnvelopeAt);
  const alert = pipeSilent({ lastEnvelopeAt: last, now: i.now, activeHours: i.activeHours, switchedOff: false });
  const mins = Math.max(0, Math.floor((i.now - last) / 60_000));
  if (alert) return { tone: 'silent', label: `pipe: silent ${mins} min · all-clear untrusted`, lastEnvelopeAt: i.lastEnvelopeAt, untrusted: true, alert };
  return { tone: 'live', label: `pipe: live · ${mins < 1 ? 'under a minute' : `${mins} min`} ago`, lastEnvelopeAt: i.lastEnvelopeAt, untrusted: false, alert: null };
}

// ---------------------------------------------------------------------------
// The rules runner (plan §5): R-01 to R-12 over the live reads
// ---------------------------------------------------------------------------

export interface RulesInput {
  now: number;
  /** The live release; R-02 asks whether a code is new in it. */
  release: string | null;
  /** Rows for the current hour. */
  hourRows: readonly HourlyRow[];
  /** Rows for the same hour 7, 14, 21 and 28 days ago (R-01, active hours). */
  sameHourRows: readonly HourlyRow[];
  /** Rows in the last 24 hours (R-02 to R-05, R-08, R-11, R-12). */
  dayRows: readonly HourlyRow[];
  /** Rows in the 7 days before that (baselines for R-02, R-03, R-04, R-08). */
  baselineRows: readonly HourlyRow[];
  /** Events of sessions with a failure in the last 24 hours (R-06, R-07). */
  events: readonly SessionEventRow[];
  /** Drift rows seen in the last 24 hours (R-10). */
  drift: readonly DriftRow[];
  pipe: PipeStatus;
  /** The contract category of a code (R-01's severity; B09 waits). */
  categoryOf: (code: string) => number | null;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortAlerts(alerts: readonly BridgeAlert[]): BridgeAlert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule) || a.title.localeCompare(b.title));
}

/** Run every rule. Each alert names what it is about, so it opens a dossier. Critical first. */
export function runRules(i: RulesInput): BridgeAlert[] {
  const out: Array<BridgeAlert | null> = [];
  const hour = Math.floor(i.now / HOUR_MS) * HOUR_MS;

  // R-01: this hour's count against the same hour on each of the previous four weeks (a missing week counts as zero).
  const weeks = [1, 2, 3, 4].map((w) => new Date(hour - w * 7 * 24 * HOUR_MS).toISOString());
  for (const c of codeTotals(i.hourRows)) {
    if (c.code === 'unknown') continue;
    const baseline = weeks.map((iso) => sum(i.sameHourRows.filter((r) => r.code === c.code && Date.parse(r.bucket_hour) === Date.parse(iso))));
    out.push(spike({ code: c.code, page: c.page, release: i.release ?? '', category: i.categoryOf(c.code) ?? 0, count: c.count, baseline }));
  }

  // R-02: a failure code in the live release that no earlier release in the baseline sent.
  if (i.release) {
    const earlier = new Set([...i.baselineRows, ...i.dayRows].filter((r) => r.release !== i.release && isFailureRow(r)).map((r) => r.code));
    for (const c of codeTotals(i.dayRows.filter((r) => r.release === i.release && isFailureRow(r)))) {
      if (c.code === 'unknown') continue;
      out.push(newAfterRelease({ code: c.code, page: c.page, release: i.release, isFailure: true, seenInEarlierReleases: earlier.has(c.code), users: c.users }));
    }
  }

  // R-03, R-04, R-05: actions against their own 7-day baseline.
  const baseActs = new Map(actionStats(i.baselineRows).map((a) => [a.act, a]));
  for (const a of actionStats(i.dayRows)) {
    const b = baseActs.get(a.act);
    if (b?.rate !== null && b?.rate !== undefined) out.push(actionDegraded({ action: a.act, page: a.page, release: i.release ?? '', tries: a.tries, successes: a.successes, baselineRate: b.rate }));
    if (a.p95 !== null) out.push(slowAction({ action: a.act, page: a.page, release: i.release ?? '', p95: a.p95, baselineP95: b?.p95 ?? 0 }));
    out.push(silentActionRate({ action: a.act, page: a.page, release: i.release ?? '', starts: a.starts, silent: a.silent }));
  }

  // R-06, R-07: per session.
  for (const [sessionId, list] of groupBy(i.events, (e) => e.session_id)) {
    const ev = list.map((e) => ({ code: e.code ?? '', page: e.page_id ?? '', release: '', kind: e.kind, outcome: e.outcome ?? undefined }));
    out.push(crashLoop({ sessionId, events: ev }), retryStorm({ sessionId, events: ev }));
  }

  // R-08: a page with usual traffic that went quiet. Only when the pipe itself is live, or every page would fire.
  if (i.pipe.tone === 'live') {
    const baseViews = groupBy(i.baselineRows.filter((r) => r.kind === 'view'), (r) => r.page_id);
    const dayViews = groupBy(i.dayRows.filter((r) => r.kind === 'view'), (r) => r.page_id);
    for (const [page, list] of baseViews) {
      const last = (dayViews.get(page) ?? []).reduce<number | null>((a, r) => Math.max(a ?? 0, Date.parse(r.last_at)), null);
      out.push(pageWentQuiet({ page, usualViewsPerHour: sum(list) / (7 * 24), lastViewAt: last, now: i.now, activeHours: isActiveHour(i.now, null) }));
    }
  }

  // R-09: the pipe.
  out.push(i.pipe.alert);

  // R-10: drift.
  for (const d of i.drift) out.push(contractDrift({ kind: d.kind, code: d.code, release: d.release, count: Number(d.drift_count) }));

  // R-11: frustration per control today.
  for (const f of frustrationByControl(i.dayRows)) {
    if (f.control === 'unnumbered') continue;
    out.push(frustration({ control: f.control, page: f.page, release: i.release ?? '', usersToday: f.users }));
  }

  // R-12: iOS vitals.
  for (const v of vitalsByPage(i.dayRows)) out.push(vitalRegression({ page: v.page, release: i.release ?? '', platform: v.platform, inpP75: v.inp, lcpP75: v.lcp }));

  return sortAlerts(out.filter((a): a is BridgeAlert => a !== null));
}

/** The rules a screen headlines: high and critical. R-10 lives on B11 only. */
export function headlineAlerts(alerts: readonly BridgeAlert[]): BridgeAlert[] {
  return alerts.filter((a) => (a.severity === 'high' || a.severity === 'critical') && a.rule !== 'R-10');
}

/** The category a CH code or Bridge ID belongs to, from the graph. */
export function categoryLookup(graph: Pick<BridgeGraph, 'ids'>): (code: string) => number | null {
  const byCh = new Map<string, number>();
  for (const [id, g] of Object.entries(graph.ids)) {
    byCh.set(id, g.category);
    if (g.ch) byCh.set(g.ch, g.category);
  }
  return (code) => byCh.get(code) ?? null;
}

export function isFailureCategory(category: number | null): boolean {
  return category !== null && FAILURE_CATEGORIES.has(category);
}

/** Percent with one decimal, or a dash. */
export function pctText(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 1000) / 10}%`;
}

export function msText(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

/** A short pseudonymous handle for a user id (D7): never a name in a list or a report. */
export function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : 'signed out';
}

// ---------------------------------------------------------------------------
// B06: the Bridge fields of an admin_events row
// ---------------------------------------------------------------------------

export interface BridgeFields {
  code: string | null;
  bridgeId: number | null;
  page: string | null;
  action: string | null;
  control: string | null;
  release: string | null;
  platform: string | null;
  sessionId: string | null;
  serverCode: string | null;
  /** Where the server half came from: E5 (a failed read) or E9 (a server action). */
  origin: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

/**
 * The Bridge fields of one admin_events row: the columns once the migration is applied, else `metadata.bridge`, where
 * the route and the server emitters write them while it is held. Null when the row carries none.
 */
export function bridgeFieldsOf(row: Record<string, unknown> | null | undefined): BridgeFields | null {
  if (!row) return null;
  const meta = (row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}) as Record<string, unknown>;
  const nested = meta.metadata && typeof meta.metadata === 'object' ? (meta.metadata as Record<string, unknown>) : {};
  const b = (meta.bridge ?? nested.bridge ?? {}) as Record<string, unknown>;
  const f: BridgeFields = {
    code: str(row.ch_code) ?? str(b.code) ?? str(b.ch_code),
    bridgeId: num(row.bridge_id) ?? num(b.bridgeId) ?? num(b.bridge_id),
    page: str(row.page_id) ?? str(b.page) ?? str(b.page_id),
    action: str(row.action_id) ?? str(b.actionId) ?? str(b.action_id) ?? str(b.act),
    control: str(row.control_id) ?? str(b.control) ?? str(b.control_id),
    release: str(row.release) ?? str(b.release),
    platform: str(row.platform) ?? str(b.platform),
    sessionId: str(row.session_id) ?? str(b.sessionId) ?? str(b.session_id),
    serverCode: str(row.server_code) ?? str(b.serverCode) ?? str(b.server_code),
    origin: str(b.origin),
  };
  return Object.values(f).some((v) => v !== null) ? f : null;
}
