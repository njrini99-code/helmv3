/**
 * Page health on the Reliability feed (B19, the Pages view): one row per Clubhouse page from the hourly store
 * (clubhouse_signal_hourly), so a broken page and a page that never reported both show. A page with no rows in the
 * window is "not heard from": its zero errors are not a zero (R-08, R-09).
 *
 * Pure: the page passes the rows, the graph and `now`. People are counted from the rows' user ids and never printed.
 */
import type { Audience, BridgeGraph, GraphScreen } from './graph';
import { isFailureRow, type HourlyRow } from './live-model';
import { bucketCounts, sparkFrame } from './issues';
import type { FeedScope, FeedWindow } from './feed';
import { routeKey } from './route-key';

/** The kinds of signal a page can send, in the order they read best, with their plural words. */
export const KIND_WORDS: ReadonlyArray<readonly [kind: string, words: string]> = [
  ['view', 'views'],
  ['tap', 'taps'],
  ['action', 'actions'],
  ['vital', 'vitals'],
  ['state', 'states'],
  ['toast', 'toasts'],
  ['frustration', 'rage taps'],
  ['crash', 'crashes'],
];

export interface PageHealth {
  page: string;
  name: string;
  /** Page views (kind view). */
  views: number;
  /** Distinct people with any signal on the page. */
  people: number;
  failures: number;
  /** Distinct people who hit a failure here. */
  failPeople: number;
  /** Failures per view; null with no views, never a made-up zero. */
  rate: number | null;
  /** The newest signal of any kind; null when the page sent nothing in the window. */
  lastAt: string | null;
  /** Which kinds arrived, in KIND_WORDS order. */
  kinds: string[];
  /** Failures per bucket, the same buckets as the issue sparklines. */
  spark: number[];
  /** The code that failed most here. */
  topCode: string | null;
  /** Which of the page's screens reported. */
  screens: ScreenCount;
}

/** One screen of a page: its route key and the short name the Bridge shows. */
export interface ScreenRef {
  key: string;
  name: string;
}

/** How many of one page's screens (route keys) sent a signal. */
export interface ScreenCount {
  /** The page's screens in the graph. */
  total: number;
  /** Screens heard from: a signal named it, or its role leaves this one screen of the page. */
  heard: ScreenRef[];
  /** Screens not heard from, in the manifest's order. */
  silent: ScreenRef[];
  /**
   * Signals that did not say which screen and could be from more than one (sent before the route column, or by an
   * older app). While this is above zero a screen in `silent` may still have been opened.
   */
  untold: number;
}

/** "Rounds (coach: team rounds; player: their library)" reads "Rounds": the gloss is for the manifest. */
export function screenName(s: Pick<GraphScreen, 'name' | 'route' | 'view'>): string {
  const name = s.name?.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return name || routeKey(s.route, s.view);
}

/** The screens each role can open: a shared screen serves both a coach and a player; a signed-out one, a visitor. */
const ROLE_SEES: Readonly<Record<string, readonly Audience[]>> = {
  coach: ['coach', 'shared'],
  player: ['player', 'shared'],
  'signed-out': ['signed-out'],
};

/**
 * Which of a page's screens its rows came from. A row's route names its screen when it is one of the page's keys.
 * A row with no route (the migration is held, or an older app) still names one when its role leaves only one screen
 * of the page; otherwise it counts as untold, never guessed onto a screen.
 */
export function screenCount(rows: readonly Pick<HourlyRow, 'route' | 'role' | 'signal_count'>[], screens: readonly GraphScreen[]): ScreenCount {
  const byKey = new Map<string, { name: string; audiences: Set<Audience> }>();
  for (const s of screens) {
    const key = routeKey(s.route, s.view);
    const known = byKey.get(key);
    if (known) known.audiences.add(s.audience);
    else byKey.set(key, { name: screenName(s), audiences: new Set([s.audience]) });
  }
  const heard = new Set<string>();
  let untold = 0;
  // A page with no screens mapped has nothing a row could fail to name.
  if (byKey.size === 0) return { total: 0, heard: [], silent: [], untold: 0 };
  for (const r of rows) {
    if (r.route && byKey.has(r.route)) {
      heard.add(r.route);
      continue;
    }
    const sees = ROLE_SEES[r.role] ?? [];
    const fits = [...byKey].filter(([, s]) => [...s.audiences].some((a) => sees.includes(a)));
    if (fits.length === 1) heard.add(fits[0]![0]);
    else untold += Number(r.signal_count || 0);
  }
  const refs = [...byKey].map(([key, s]) => ({ key, name: s.name }));
  return { total: refs.length, heard: refs.filter((s) => heard.has(s.key)), silent: refs.filter((s) => !heard.has(s.key)), untold };
}

function people(rows: readonly HourlyRow[]): number {
  const ids = new Set<string>();
  for (const r of rows) for (const u of r.user_ids ?? []) ids.add(u);
  return ids.size;
}

const total = (rows: readonly HourlyRow[]) => rows.reduce((a, r) => a + Number(r.signal_count || 0), 0);

/**
 * The hourly rows in the feed's role, device and page filter, so the Pages view lists what Issues and Every error list
 * (filterFeed). Role and device are the session's, as the feed's are; a page filter keeps that page's rows.
 */
export function hourlyInScope<T extends Pick<HourlyRow, 'role' | 'platform' | 'page_id'>>(rows: readonly T[], scope: Pick<FeedScope, 'role' | 'pf' | 'page'>): T[] {
  return rows.filter((r) => (scope.role === 'all' || r.role === scope.role) && (scope.pf === 'all' || r.platform === scope.pf) && (!scope.page || r.page_id === scope.page));
}

/** Each of the graph's pages, heard-from first (most people hit by a failure, then most failures, then most views). */
export function pageHealth(rows: readonly HourlyRow[], graph: Pick<BridgeGraph, 'pages'>, o: { w: FeedWindow; now: number }): PageHealth[] {
  const frame = sparkFrame(o.w, o.now);
  const byPage = new Map<string, HourlyRow[]>();
  for (const r of rows) {
    if (!r.page_id) continue;
    const list = byPage.get(r.page_id);
    if (list) list.push(r);
    else byPage.set(r.page_id, [r]);
  }
  const pages = new Set([...Object.keys(graph.pages), ...byPage.keys()]);
  const out: PageHealth[] = [...pages].map((page) => {
    const list = byPage.get(page) ?? [];
    const fails = list.filter(isFailureRow);
    const views = total(list.filter((r) => r.kind === 'view'));
    const seen = new Set(list.map((r) => r.kind));
    const codeCounts = new Map<string, number>();
    for (const r of fails) if (r.code) codeCounts.set(r.code, (codeCounts.get(r.code) ?? 0) + Number(r.signal_count || 0));
    const spark = bucketCounts(
      fails.map((r) => r.bucket_hour),
      frame,
      (k) => Number(fails[k]!.signal_count || 0),
    );
    return {
      page,
      name: graph.pages[page as keyof typeof graph.pages]?.name ?? page,
      views,
      people: people(list),
      failures: total(fails),
      failPeople: people(fails),
      rate: views > 0 ? total(fails) / views : null,
      lastAt: list.reduce<string | null>((a, r) => (a === null || r.last_at > a ? r.last_at : a), null),
      kinds: KIND_WORDS.map(([k]) => k).filter((k) => seen.has(k)),
      spark,
      topCode: [...codeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
      screens: screenCount(list, graph.pages[page as keyof typeof graph.pages]?.screens ?? []),
    };
  });
  return out.sort(
    (a, b) =>
      Number(b.lastAt !== null) - Number(a.lastAt !== null) ||
      b.failPeople - a.failPeople ||
      b.failures - a.failures ||
      b.views - a.views ||
      a.page.localeCompare(b.page),
  );
}

/** One page's screens that sent nothing, for the Not heard from list. */
export interface SilentGroup {
  page: string;
  name: string;
  /** The page sent no signal at all. */
  pageSilent: boolean;
  /** The page's screens. */
  total: number;
  /** Its screens not heard from, by name; a screen two pages share is listed once, under the first. */
  screens: string[];
}

export interface Coverage {
  /** Pages of the graph that sent any signal in the window. */
  heard: number;
  /** Pages in the graph. */
  total: number;
  /** The graph's pages that sent nothing, by name. */
  silent: string[];
  /** Screens (distinct route keys across the graph) heard from; a screen two pages share counts once. */
  screensHeard: number;
  /** Screens in the graph: every route key, the denominator the Bridge counts silence against. */
  screensTotal: number;
  /** Pages with a screen not heard from, in the graph's order. */
  silentScreens: SilentGroup[];
  /** Pages heard from with signals that did not say which screen, by name. */
  untold: string[];
}

/** How much of Clubhouse reported in the window: the context every "no errors" needs. */
export function coverageOf(health: readonly PageHealth[], graph: Pick<BridgeGraph, 'pages'>): Coverage {
  const inGraph = health.filter((p) => p.page in graph.pages);
  const silent = inGraph.filter((p) => p.lastAt === null);
  const byPage = new Map(inGraph.map((p) => [p.page, p]));
  const heardKeys = new Set(inGraph.flatMap((p) => p.screens.heard.map((s) => s.key)));
  const allKeys = new Set<string>();
  const listed = new Set<string>();
  const silentScreens: SilentGroup[] = [];
  for (const page of Object.keys(graph.pages)) {
    const p = byPage.get(page);
    if (!p) continue;
    for (const s of [...p.screens.heard, ...p.screens.silent]) allKeys.add(s.key);
    const left = p.screens.silent.filter((s) => !heardKeys.has(s.key) && !listed.has(s.key));
    for (const s of left) listed.add(s.key);
    if (left.length || p.lastAt === null) silentScreens.push({ page, name: p.name, pageSilent: p.lastAt === null, total: p.screens.total, screens: left.map((s) => s.name) });
  }
  return {
    heard: inGraph.length - silent.length,
    total: inGraph.length,
    silent: silent.map((p) => p.name),
    screensHeard: [...allKeys].filter((k) => heardKeys.has(k)).length,
    screensTotal: allKeys.size,
    silentScreens,
    untold: inGraph.filter((p) => p.screens.untold > 0).map((p) => p.name),
  };
}

/** "Heard from 2 of 17 pages and 2 of 66 screens": the coverage in words, for the truth line. */
export function coverageWords(c: Pick<Coverage, 'heard' | 'total'> & Partial<Pick<Coverage, 'screensHeard' | 'screensTotal'>>): string {
  if (c.total === 0) return 'No pages in the Bridge map';
  const pages = c.heard === c.total ? `all ${c.total} pages` : `${c.heard} of ${c.total} pages`;
  const st = c.screensTotal ?? 0;
  const sh = c.screensHeard ?? 0;
  if (st === 0) return `Heard from ${pages}`;
  const screens = sh === st ? `all ${st} screens` : `${sh} of ${st} screens`;
  return `Heard from ${pages} and ${screens}`;
}

/** "12%" for a rate; null rates read as "no views", never 0%. */
export function rateWords(rate: number | null): string {
  if (rate === null) return 'no views';
  const pct = rate * 100;
  if (pct === 0) return '0%';
  if (pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/**
 * "3 of 7 screens" for a page with more than one; a one-screen page needs no count. Signals that did not say which
 * screen make it "at least 3 of 7", or "screen not known yet" when none could be placed, never a made-up zero.
 */
export function screenWords(s: ScreenCount): string | null {
  if (s.total < 2) return null;
  const n = s.heard.length;
  if (n === s.total) return `all ${s.total} screens`;
  if (s.untold > 0) return n === 0 ? 'screen not known yet' : `at least ${n} of ${s.total} screens`;
  return `${n} of ${s.total} screens`;
}

/**
 * The Pages view as Markdown for Copy report: names and counts only, never a person or an id. With a filter, `health`
 * is the filtered list and `filter` says what it shows; what was not heard from stays the coverage's, every role and
 * device, so a page the filter leaves out is never called silent.
 */
export function pagesReport(health: readonly PageHealth[], o: { windowLabel: string; pipeLabel: string; coverage?: Coverage | null; filter?: string | null }): string {
  const heard = health.filter((p) => p.lastAt !== null);
  const silent = o.coverage ? o.coverage.silent : health.filter((p) => p.lastAt === null).map((p) => p.name);
  const c = o.coverage ?? { heard: heard.length, total: health.length };
  const lines = [`# Page health · ${o.windowLabel}`, '', `${coverageWords(c)} · ${o.pipeLabel}`, ''];
  if (o.filter) lines.push(`Showing ${o.filter}: ${heard.length} ${heard.length === 1 ? 'page' : 'pages'}.`, '');
  for (const p of heard) {
    const fail =
      p.failures === 0
        ? 'no failures'
        : `${p.failures} ${p.failures === 1 ? 'failure' : 'failures'}, ${p.failPeople} ${p.failPeople === 1 ? 'person' : 'people'} hit${p.rate === null ? '' : ` (${rateWords(p.rate)} of views)`}`;
    const screens = screenWords(p.screens);
    lines.push(`- **${p.name}**: ${p.views} ${p.views === 1 ? 'view' : 'views'}, ${fail}${p.topCode ? `; most often ${p.topCode}` : ''}${screens ? `; ${screens}` : ''}`);
  }
  if (silent.length > 0) {
    lines.push('', `Not heard from (${silent.length}): ${silent.join(', ')}. Their zero errors are not a zero.`);
  }
  const groups = (o.coverage?.silentScreens ?? []).filter((g) => g.screens.length > 0);
  if (o.coverage && groups.length > 0) {
    const n = o.coverage.screensTotal - o.coverage.screensHeard;
    lines.push('', `Screens not heard from (${n} of ${o.coverage.screensTotal}):`);
    for (const g of groups) lines.push(`- **${g.name}**: ${g.screens.join(', ')}`);
  }
  if (o.coverage && o.coverage.untold.length > 0) {
    lines.push('', `${o.coverage.untold.join(', ')} sent signals that do not say which screen, so a screen listed above may still have been opened.`);
  }
  return lines.join('\n');
}
