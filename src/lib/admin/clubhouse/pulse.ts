/**
 * B01 Pulse's view model (plan §8 B01): "Is Clubhouse OK right now, and if not, where?" Pure: the page passes the
 * live snapshot's rows and alerts in, and the tests pass the seeded fixture in. The digest's Clubhouse section (§10)
 * reads the same model, so the email and the screen say the same thing.
 */
import type { BridgeGraph } from './graph';
import {
  actionStats,
  codeTotals,
  isFailureRow,
  headlineAlerts,
  pageWall,
  previousRelease,
  releaseDiff,
  releaseList,
  type ActionStat,
  type HourlyRow,
  type PageTile,
  type PipeStatus,
  type ReleaseDiff,
} from './live-model';
import { EMPTY_NOTES, watchedCodes, type NotesIndex, type WatchedCode } from './notes';
import type { BridgeAlert } from './rules';
import { clubhouseHref } from './screens';
import { liveHref } from './live-model';

export interface PulseTile extends PageTile {
  /** R-08 fired for this page: it went quiet, so its own instrument may be broken. */
  quiet: boolean;
  /** A headline rule names this page. */
  alerting: boolean;
}

export interface PulseModel {
  pipe: PipeStatus;
  /** R-09 holds, the pipe is off or not there yet, or an evidence read failed: no "all clear" on this screen can be trusted. */
  untrusted: boolean;
  /** How many evidence reads failed (hourly, sessions, events, drift). The rules ran on what was read, so an empty list proves nothing. */
  readFailures: number;
  /** Nothing high or critical fired, the pipe is live and every evidence read succeeded. */
  allClear: boolean;
  headline: BridgeAlert[];
  counts: Record<BridgeAlert['severity'], number>;
  tiles: PulseTile[];
  rising: BridgeAlert[];
  slipping: Array<{ alert: BridgeAlert | null; stat: ActionStat }>;
  release: { release: string; base: string | null; diff: ReleaseDiff } | null;
  /** Codes watched from their dossier (BR-0507), with what they did in the window. */
  watched: WatchedCode[];
}

/** Actions shown under "slipping": the ones a rule named, then the lowest success rates with real traffic. */
const SLIPPING_MAX = 6;

export function pulseModel(i: {
  graph: Pick<BridgeGraph, 'pages'>;
  rows: readonly HourlyRow[];
  dayRows: readonly HourlyRow[];
  alerts: readonly BridgeAlert[];
  pipe: PipeStatus;
  release: string | null;
  /** The evidence reads that failed. A live pipe with a failed hourly or session read still cannot give an all-clear. */
  readErrors?: readonly string[];
  /** The owner's open notes; watched codes are pinned to Pulse. */
  notes?: NotesIndex;
}): PulseModel {
  const headline = headlineAlerts(i.alerts);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<BridgeAlert['severity'], number>;
  for (const a of i.alerts) counts[a.severity] += 1;
  const quietPages = new Set(i.alerts.filter((a) => a.rule === 'R-08').map((a) => a.page));
  const alertingPages = new Set(headline.map((a) => a.page).filter(Boolean));
  const tiles = pageWall(i.rows, i.graph).map((t) => ({ ...t, quiet: quietPages.has(t.page), alerting: alertingPages.has(t.page) }));

  const actionAlerts = new Map<string, BridgeAlert>();
  for (const a of i.alerts) if (a.action && ['R-03', 'R-04', 'R-05'].includes(a.rule) && !actionAlerts.has(a.action)) actionAlerts.set(a.action, a);
  const stats = actionStats(i.rows).filter((s) => s.tries > 0);
  const named = stats.filter((s) => actionAlerts.has(s.act)).map((stat) => ({ alert: actionAlerts.get(stat.act) ?? null, stat }));
  const rest = stats.filter((s) => !actionAlerts.has(s.act) && s.rate !== null && s.rate < 1).map((stat) => ({ alert: null, stat }));
  const slipping = [...named, ...rest].slice(0, SLIPPING_MAX);

  const list = releaseList(i.dayRows);
  const live = i.release && list.some((r) => r.release === i.release) ? i.release : (list[0]?.release ?? null);
  const base = live ? previousRelease(list, live) : null;

  const readFailures = i.readErrors?.length ?? 0;
  const untrusted = i.pipe.untrusted || readFailures > 0;
  return {
    pipe: i.pipe,
    untrusted,
    readFailures,
    allClear: headline.length === 0 && !untrusted,
    headline,
    counts,
    tiles,
    rising: i.alerts.filter((a) => a.rule === 'R-01' || a.rule === 'R-02'),
    slipping,
    release: live ? { release: live, base, diff: releaseDiff(i.dayRows, live, base) } : null,
    watched: watchedCodes(i.notes ?? EMPTY_NOTES, i.rows),
  };
}

/** The ACT- ID a useAction name resolves to, else the name itself. */
export function actionIdFor(graph: Pick<BridgeGraph, 'actions'>, act: string): string {
  if (graph.actions[act]) return act;
  return Object.entries(graph.actions).find(([, a]) => a.useActionName === act)?.[0] ?? act;
}

/** Where an alert opens: its code's dossier, else its action, control, session, page or release. */
export function alertHref(a: BridgeAlert, graph: Pick<BridgeGraph, 'actions' | 'chIndex'>): string | null {
  if (a.code && a.code !== 'unknown') return clubhouseHref.code(graph.chIndex[a.code] ?? a.code);
  if (a.action) return clubhouseHref.action(actionIdFor(graph, a.action));
  if (a.control) return clubhouseHref.control(a.control);
  if (typeof a.evidence.sessionId === 'string') return liveHref.session(a.evidence.sessionId);
  if (a.page) return clubhouseHref.page(a.page);
  if (a.release) return liveHref.release(a.release);
  return null;
}

/** The page wall in words, for the digest and Copy: the pages that need a look, then how many are fine. */
export function wallInWords(tiles: readonly PulseTile[]): string[] {
  const out: string[] = [];
  for (const t of tiles) {
    if (t.quiet) out.push(`${t.page} ${t.name}: went quiet (no views in 2 hours)`);
    else if (t.failures > 0) out.push(`${t.page} ${t.name}: ${t.failures} failure${t.failures === 1 ? '' : 's'}${t.worstCode ? `, worst ${t.worstCode}` : ''}`);
  }
  const fine = tiles.filter((t) => !t.quiet && t.failures === 0 && t.views > 0).length;
  if (fine) out.push(`${fine} page${fine === 1 ? '' : 's'} with traffic and no failures`);
  return out;
}

/** The digest's Clubhouse section (plan §10): what the email says, built from the same model Pulse renders. */
export interface ClubhouseDigest {
  state: 'ok' | 'no-signal' | 'off' | 'error';
  pipe: string;
  untrusted: boolean;
  /** R-01 to R-07 hits in the last day, plus R-09 when it holds. */
  alerts: Array<{ rule: string; severity: string; title: string }>;
  wall: string[];
  topCodes: Array<{ code: string; count: number; users: number }>;
  release: { release: string; base: string | null; newCodes: number; rising: number; gone: number } | null;
  driftCount: number;
  /** Codes watched from their dossier (BR-0507): what each did in the last day, a quiet one at zero. */
  watched: Array<{ code: string; failures: number; users: number }>;
}

const DIGEST_RULES = new Set(['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-09']);

export function clubhouseDigest(i: {
  state: 'ok' | 'no-signal' | 'error';
  graph: Pick<BridgeGraph, 'pages'>;
  dayRows: readonly HourlyRow[];
  alerts: readonly BridgeAlert[];
  pipe: PipeStatus;
  release: string | null;
  driftCount: number;
  notes?: NotesIndex;
}): ClubhouseDigest {
  const m = pulseModel({ graph: i.graph, rows: i.dayRows, dayRows: i.dayRows, alerts: i.alerts, pipe: i.pipe, release: i.release, notes: i.notes });
  const d = m.release?.diff;
  return {
    state: i.pipe.tone === 'off' ? 'off' : i.state,
    pipe: i.pipe.label,
    untrusted: m.untrusted,
    alerts: i.alerts.filter((a) => DIGEST_RULES.has(a.rule)).map((a) => ({ rule: a.rule, severity: a.severity, title: a.title })),
    wall: wallInWords(m.tiles),
    topCodes: codeTotals(i.dayRows.filter(isFailureRow)).slice(0, 5).map((c) => ({ code: c.code, count: c.count, users: c.users })),
    release: m.release && d ? { release: m.release.release, base: m.release.base, newCodes: d.codes.filter((c) => c.kind === 'new').length, rising: d.codes.filter((c) => c.kind === 'rising').length, gone: d.codes.filter((c) => c.kind === 'gone').length } : null,
    driftCount: i.driftCount,
    watched: m.watched.map((w) => ({ code: w.code, failures: w.failures, users: w.users })),
  };
}

/** Plain-text lines for the digest. Unknown is said as unknown, never as zero. */
export function clubhouseDigestLines(c: ClubhouseDigest | undefined): string[] {
  if (!c) return ['  Could not check.'];
  if (c.state === 'off') return ['  The signal pipe is switched off; nothing was counted.'];
  if (c.state === 'no-signal') return ['  No signal yet (the signal tables are held or empty); nothing was counted.'];
  if (c.state === 'error') return ['  The signals could not be read.'];
  const out = [`  ${c.pipe}${c.untrusted ? ' (no all-clear can be trusted)' : ''}`];
  if (c.alerts.length) for (const a of c.alerts) out.push(`  - ${a.rule} ${a.severity}: ${a.title}`);
  else out.push(c.untrusted ? '  No rule fired, but the pipe cannot vouch for it.' : '  No rule fired.');
  for (const w of c.wall) out.push(`  ${w}`);
  if (c.topCodes.length) out.push(`  Top codes: ${c.topCodes.map((t) => `${t.code} ×${t.count} (${t.users} people)`).join(', ')}`);
  if (c.release) out.push(`  Release ${c.release.release.slice(0, 7)}${c.release.base ? ` vs ${c.release.base.slice(0, 7)}` : ''}: ${c.release.newCodes} new, ${c.release.rising} rising, ${c.release.gone} gone`);
  out.push(`  Drift: ${c.driftCount} kind${c.driftCount === 1 ? '' : 's'} in the last day`);
  if (c.watched.length) out.push(`  Watched: ${c.watched.map((w) => `${w.code} ×${w.failures} (${w.users} people)`).join(', ')}`);
  return out;
}

/** Pulse as Markdown (BR-0108). Pseudonymous: codes, pages and counts, never a person. */
export function pulseReport(m: PulseModel): string {
  const lines = [
    '# Clubhouse Pulse',
    '',
    `Pipe: ${m.pipe.label}${m.untrusted ? ' (no all-clear can be trusted)' : ''}`,
    ...(m.readFailures ? [`Evidence: ${m.readFailures} read${m.readFailures === 1 ? '' : 's'} failed, so the counts below are incomplete`] : []),
    `Rules: ${m.counts.critical} critical, ${m.counts.high} high, ${m.counts.medium} medium, ${m.counts.low} low`,
    '',
    '## Needs a look',
    ...(m.headline.length ? m.headline.map((a) => `- ${a.rule} ${a.severity}: ${a.title}`) : [m.allClear ? '- Nothing high or critical.' : m.readFailures ? '- Nothing fired, but some evidence could not be read.' : '- Nothing fired, but the pipe cannot vouch for it.']),
    ...(m.watched.length ? ['', '## Watched', ...m.watched.map((w) => `- ${w.code}: ${w.failures} failure${w.failures === 1 ? '' : 's'}, ${w.users} ${w.users === 1 ? 'person' : 'people'} in the window`)] : []),
    '',
    '## Page wall',
    ...wallInWords(m.tiles).map((l) => `- ${l}`),
  ];
  if (m.release) {
    const d = m.release.diff;
    lines.push('', `## Release ${m.release.release.slice(0, 7)}${m.release.base ? ` against ${m.release.base.slice(0, 7)}` : ''}`);
    lines.push(`- ${d.codes.filter((c) => c.kind === 'new').length} codes new, ${d.codes.filter((c) => c.kind === 'rising').length} rising, ${d.codes.filter((c) => c.kind === 'gone').length} gone`);
  }
  return lines.join('\n');
}
