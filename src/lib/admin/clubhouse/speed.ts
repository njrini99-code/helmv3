/**
 * The Reliability space's Speed board (B21; plan docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md):
 * how fast Helm feels for a coach and for a player, per page and per button, and which database errors came back.
 * Pure: hourly rows and feed items in, numbers out. Field data from real phones, not the lab tiers.
 *
 * Every quantile merges the histograms first and reads the merged one (live-model.ts mergeBuckets + bucketQuantile, the
 * same way `clubhouse_bucket_quantile` does). "Everyone" is every row merged, never the slower of two p75s. A histogram
 * with no samples reads null, which the screen shows as "not measured yet", never 0.
 */
import type { BridgeGraph, PageId } from './graph';
import { actionStats, bucketQuantile, mergeBuckets, type HourlyRow } from './live-model';
import { actionIdFor } from './pulse';
import { SLOW_SAVE_LINE_MS } from './rules';
import { serverCodeWords, type FeedItem } from './feed';
import type { StatDeltaRow } from '@/lib/admin/database/performance';

export const SPEED_ROLES = ['all', 'coach', 'player'] as const;
export type SpeedRole = (typeof SPEED_ROLES)[number];
export const SPEED_DEVICES = ['all', 'ios-app', 'ios-safari', 'desktop'] as const;
export type SpeedDevice = (typeof SPEED_DEVICES)[number];
export const SPEED_WINDOWS = ['24h', '7d', '30d'] as const;
export type SpeedWindow = (typeof SPEED_WINDOWS)[number];

export const SPEED_ROLE_LABEL: Readonly<Record<SpeedRole, string>> = { all: 'Everyone', coach: 'Coaches', player: 'Players' };
export const SPEED_DEVICE_LABEL: Readonly<Record<SpeedDevice, string>> = { all: 'Every device', 'ios-app': 'iOS app', 'ios-safari': 'iPhone Safari', desktop: 'Desktop' };
export const SPEED_WINDOW_LABEL: Readonly<Record<SpeedWindow, string>> = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

const HOUR_MS = 3_600_000;
export const SPEED_WINDOW_MS: Readonly<Record<SpeedWindow, number>> = { '24h': 24 * HOUR_MS, '7d': 7 * 24 * HOUR_MS, '30d': 30 * 24 * HOUR_MS };

export interface SpeedScope {
  role: SpeedRole;
  device: SpeedDevice;
  w: SpeedWindow;
}

export const DEFAULT_SPEED: SpeedScope = { role: 'all', device: 'all', w: '7d' };

type Params = Record<string, string | string[] | undefined>;
const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);
const pick = <T extends string>(list: readonly T[], raw: string | undefined, fallback: T): T => ((list as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback);

export function parseSpeedScope(sp: Params | undefined): SpeedScope {
  return {
    role: pick(SPEED_ROLES, first(sp?.role), DEFAULT_SPEED.role),
    device: pick(SPEED_DEVICES, first(sp?.device), DEFAULT_SPEED.device),
    w: pick(SPEED_WINDOWS, first(sp?.w), DEFAULT_SPEED.w),
  };
}

export const SPEED_PATH = '/admin/spaces/reliability/speed';

export function speedHref(scope: SpeedScope, patch: Partial<SpeedScope> = {}): string {
  const s = { ...scope, ...patch };
  const q = new URLSearchParams();
  if (s.role !== DEFAULT_SPEED.role) q.set('role', s.role);
  if (s.device !== DEFAULT_SPEED.device) q.set('device', s.device);
  if (s.w !== DEFAULT_SPEED.w) q.set('w', s.w);
  const qs = q.toString();
  return `${SPEED_PATH}${qs ? `?${qs}` : ''}`;
}

/** Rows for one role and one device. "Everyone" keeps signed-out rows too. */
export function speedRows<T extends { role: string; platform: string }>(rows: readonly T[], scope: Pick<SpeedScope, 'role' | 'device'>): T[] {
  return rows.filter((r) => (scope.role === 'all' || r.role === scope.role) && (scope.device === 'all' || r.platform === scope.device));
}

const sum = (rows: ReadonlyArray<{ signal_count: number }>) => rows.reduce((a, r) => a + Number(r.signal_count || 0), 0);
const samples = (buckets: readonly number[]) => buckets.reduce((a, b) => a + b, 0);

export interface PageSpeed {
  page: string;
  name: string;
  /** LCP p75 (ms): opening the page cold. */
  lcp: number | null;
  /** INP p75 (ms): the slowest response to a tap. */
  inp: number | null;
  views: number;
  /** p75 (ms) of the switch to first paint (view durations); null until a view carries one. */
  switchP75: number | null;
  /** Views that carried a switch time (the first view of a session has none). */
  switchSamples: number;
  lcpSamples: number;
  inpSamples: number;
}

/** One row per page with a view or a vital in the rows, busiest first. */
export function pageSpeed(rows: readonly HourlyRow[], graph: Pick<BridgeGraph, 'pages'>): PageSpeed[] {
  const byPage = new Map<string, HourlyRow[]>();
  for (const r of rows) {
    if ((r.kind !== 'view' && r.kind !== 'vital') || !r.page_id) continue;
    const list = byPage.get(r.page_id);
    if (list) list.push(r);
    else byPage.set(r.page_id, [r]);
  }
  return [...byPage.entries()]
    .map(([page, list]) => {
      const views = list.filter((r) => r.kind === 'view');
      const lcp = mergeBuckets(list.filter((r) => r.kind === 'vital' && r.act === 'LCP'));
      const inp = mergeBuckets(list.filter((r) => r.kind === 'vital' && r.act === 'INP'));
      const sw = mergeBuckets(views);
      return {
        page,
        name: graph.pages[page as PageId]?.name ?? page,
        lcp: bucketQuantile(lcp, 0.75),
        inp: bucketQuantile(inp, 0.75),
        views: sum(views),
        switchP75: bucketQuantile(sw, 0.75),
        switchSamples: samples(sw),
        lcpSamples: samples(lcp),
        inpSamples: samples(inp),
      };
    })
    .sort((a, b) => b.views - a.views || a.page.localeCompare(b.page));
}

/** The page with the highest value of a metric, or null when no page has it. */
export function slowestPage(pages: readonly PageSpeed[], metric: 'lcp' | 'inp' | 'switchP75'): PageSpeed | null {
  return pages.filter((p) => p[metric] !== null).sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0) || a.page.localeCompare(b.page))[0] ?? null;
}

/** Whether any view in the rows carried a switch time yet. */
export function switchMeasured(pages: readonly PageSpeed[]): boolean {
  return pages.some((p) => p.switchSamples > 0);
}

export interface ButtonSpeed {
  act: string;
  /** The ACT- ID in the Bridge map, when the name resolves. */
  actionId: string | null;
  label: string;
  page: string;
  tries: number;
  p50: number | null;
  p95: number | null;
  pastLine: boolean;
}

/** Save time per button, from press to done (outcomes only, never starts), slowest p95 first. */
export function buttonSpeed(rows: readonly HourlyRow[], graph: Pick<BridgeGraph, 'actions'>): ButtonSpeed[] {
  return actionStats(rows)
    .filter((a) => a.p50 !== null || a.p95 !== null)
    .map((a) => {
      const id = actionIdFor(graph, a.act);
      const action = graph.actions[id];
      return { act: a.act, actionId: action ? id : null, label: action?.label ?? a.act, page: a.page, tries: a.tries, p50: a.p50, p95: a.p95, pastLine: a.p95 !== null && a.p95 > SLOW_SAVE_LINE_MS };
    })
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0) || a.label.localeCompare(b.label));
}

export interface DbErrorRow {
  code: string;
  words: string;
  known: boolean;
  total: number;
  coach: number;
  player: number;
  signedOut: number;
  /** Tables the failing actions touch, from the Bridge map (not stored with the error). */
  tables: string[];
  /** The failing actions' labels. */
  actions: string[];
  /** The pages it came back on. */
  pages: string[];
}

/** Failures that carried a server code, grouped by code, busiest first. */
export function dbErrors(items: readonly FeedItem[], graph: Pick<BridgeGraph, 'actions'>): DbErrorRow[] {
  const byCode = new Map<string, FeedItem[]>();
  for (const i of items) {
    if (!i.serverCode) continue;
    const list = byCode.get(i.serverCode);
    if (list) list.push(i);
    else byCode.set(i.serverCode, [i]);
  }
  return [...byCode.entries()]
    .map(([code, list]) => {
      const actions = [...new Set(list.map((i) => i.action).filter((a): a is string => Boolean(a)))];
      const { words, known } = serverCodeWords(code);
      return {
        code,
        words,
        known,
        total: list.length,
        coach: list.filter((i) => i.role === 'coach').length,
        player: list.filter((i) => i.role === 'player').length,
        signedOut: list.filter((i) => i.role === 'signed-out').length,
        tables: [...new Set(actions.flatMap((a) => graph.actions[a]?.tables ?? []))].sort(),
        actions: actions.map((a) => graph.actions[a]?.label ?? a).sort(),
        pages: [...new Set(list.map((i) => i.pageName))].sort(),
      };
    })
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

/** Failure items in one role and one device (the feed's items carry the session's role and platform). */
export function speedItems(items: readonly FeedItem[], scope: Pick<SpeedScope, 'role' | 'device'>): FeedItem[] {
  return items.filter((i) => (scope.role === 'all' || i.role === scope.role) && (scope.device === 'all' || i.platform === scope.device));
}

/** A value as a share of a scale, for a meter: values past the scale fill it. */
export function meterMax(line: number): number {
  return line * 2;
}

export interface SlowQuery {
  /** Postgres's own id for the statement (pg_stat_statements queryid): unique per query, and the row key. */
  queryid: string;
  /** A short, readable form of the id ("q·1a2b3c4d"): the collector never keeps query text, so this is the name. */
  label: string;
  /** The collector's workload label ("postgrest_query" for every app request): a kind, not a name. */
  queryClass: string;
  meanMs: number;
  maxMs: number | null;
  calls: number | null;
  regressed: boolean;
}

/**
 * The app's slowest database queries in the latest 15-minute window, by mean time per call. Only Helm's own requests
 * (`helm_product`, PostgREST and RPC calls) count: Supabase's realtime, pg_net, cron and the Bridge's own collectors are
 * not something a coach or player waits on.
 */
export function slowQueries(rows: readonly StatDeltaRow[], limit = 8): SlowQuery[] {
  return rows
    .filter((r) => r.sourceClass === 'helm_product' && r.meanExecMsWindow !== null)
    .sort((a, b) => (b.meanExecMsWindow ?? 0) - (a.meanExecMsWindow ?? 0))
    .slice(0, limit)
    .map((r) => ({
      queryid: r.queryid,
      label: queryLabel(r.queryid),
      queryClass: r.safeQueryClass,
      meanMs: r.meanExecMsWindow ?? 0,
      maxMs: r.maxExecMsObserved,
      calls: r.callsDelta,
      regressed: r.regressionFlags.length > 0,
    }));
}

/** "q·" plus the last 8 characters of a pg_stat_statements queryid, enough to find it on the Database tab. */
export function queryLabel(queryid: string): string {
  const id = queryid.replace(/^-/, '');
  return `q·${id.slice(-8)}`;
}
