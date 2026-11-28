/**
 * Page health on the Reliability feed (B19, the Pages view): one row per Clubhouse page from the hourly store
 * (clubhouse_signal_hourly), so a broken page and a page that never reported both show. A page with no rows in the
 * window is "not heard from": its zero errors are not a zero (R-08, R-09).
 *
 * Pure: the page passes the rows, the graph and `now`. People are counted from the rows' user ids and never printed.
 */
import type { BridgeGraph } from './graph';
import { isFailureRow, type HourlyRow } from './live-model';
import { bucketCounts, sparkFrame } from './issues';
import type { FeedWindow } from './feed';

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
}

function people(rows: readonly HourlyRow[]): number {
  const ids = new Set<string>();
  for (const r of rows) for (const u of r.user_ids ?? []) ids.add(u);
  return ids.size;
}

const total = (rows: readonly HourlyRow[]) => rows.reduce((a, r) => a + Number(r.signal_count || 0), 0);

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

export interface Coverage {
  /** Pages of the graph that sent any signal in the window. */
  heard: number;
  /** Pages in the graph. */
  total: number;
  /** The graph's pages that sent nothing, by name. */
  silent: string[];
}

/** How much of Clubhouse reported in the window: the context every "no errors" needs. */
export function coverageOf(health: readonly PageHealth[], graph: Pick<BridgeGraph, 'pages'>): Coverage {
  const inGraph = health.filter((p) => p.page in graph.pages);
  const silent = inGraph.filter((p) => p.lastAt === null);
  return { heard: inGraph.length - silent.length, total: inGraph.length, silent: silent.map((p) => p.name) };
}

/** "Heard from 2 of 17 pages": the coverage in words, for the truth line. */
export function coverageWords(c: Coverage): string {
  if (c.total === 0) return 'No pages in the Bridge map';
  if (c.heard === c.total) return `Heard from all ${c.total} pages`;
  return `Heard from ${c.heard} of ${c.total} pages`;
}

/** "12%" for a rate; null rates read as "no views", never 0%. */
export function rateWords(rate: number | null): string {
  if (rate === null) return 'no views';
  const pct = rate * 100;
  if (pct === 0) return '0%';
  if (pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/** The Pages view as Markdown for Copy report: names and counts only, never a person or an id. */
export function pagesReport(health: readonly PageHealth[], o: { windowLabel: string; pipeLabel: string }): string {
  const heard = health.filter((p) => p.lastAt !== null);
  const silent = health.filter((p) => p.lastAt === null);
  const lines = [`# Page health · ${o.windowLabel}`, '', `Heard from ${heard.length} of ${health.length} pages · ${o.pipeLabel}`, ''];
  for (const p of heard) {
    const fail =
      p.failures === 0
        ? 'no failures'
        : `${p.failures} ${p.failures === 1 ? 'failure' : 'failures'}, ${p.failPeople} ${p.failPeople === 1 ? 'person' : 'people'} hit${p.rate === null ? '' : ` (${rateWords(p.rate)} of views)`}`;
    lines.push(`- **${p.name}**: ${p.views} ${p.views === 1 ? 'view' : 'views'}, ${fail}${p.topCode ? `; most often ${p.topCode}` : ''}`);
  }
  if (silent.length > 0) {
    lines.push('', `Not heard from (${silent.length}): ${silent.map((p) => p.name).join(', ')}. Their zero errors are not a zero.`);
  }
  return lines.join('\n');
}
