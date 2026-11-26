/**
 * The context pack (plan §9.1): everything Claude Duet needs about one page, control, action or code, in one paste.
 * Markdown with one JSON block (`bridge-pack/v1`), in seven parts: the ask, the contract, the evidence, the code, what
 * to read, how to reproduce, and what done means.
 *
 * The contract, code, reading and reproduction parts come from the graph and are exact today. The evidence is live
 * data, so it comes from `PackLiveSource`s: each answers "No signal yet" until its table exists, and PR 3's live
 * layer (sessions, counters, releases) plugs in beside the admin_events one without touching this file.
 *
 * People are pseudonymous by default (D7): a source that returns people returns role, team and a pseudonymous id,
 * and names only when the caller passed `includeNames` (the B13 tick; the API never, unless its own switch allows).
 *
 * Pure and isomorphic. Plan: docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md
 */
import type { BridgeGraph, BridgeId, GraphAction, GraphControl, GraphId, PageId } from './graph';
import { FAILURE_CATEGORIES, actionsEndingIn, categoryCode, categoryName, clubhouseHref, controlLabel, controlsStarting, previewPath } from './screens';

export const PACK_SCHEMA = 'bridge-pack/v1' as const;

export type PackKind = 'page' | 'control' | 'action' | 'code';

export interface PackTarget {
  kind: PackKind;
  /** P007, CTL-P007-014, ACT-P007-SEND-MESSAGE, or a Bridge ID as a string (70603). */
  key: string;
  page: PageId;
}

/** Most IDs a page pack lists: its failure states first. The whole page is one click away on B02. */
export const PAGE_PACK_ID_LIMIT = 40;

/** Reads `P007`, `CTL-P007-014`, `ACT-P007-SEND-MESSAGE`, `70603` or `CH-7004` (any case). Null when it is none. */
export function resolvePackTarget(graph: BridgeGraph, raw: string | null | undefined): PackTarget | null {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 80) return null;
  const upper = value.toUpperCase();
  if (/^P\d{3}$/.test(upper) && graph.pages[upper as PageId]) return { kind: 'page', key: upper, page: upper as PageId };
  if (upper.startsWith('CTL-')) {
    const c = graph.controls[upper];
    return c ? { kind: 'control', key: upper, page: c.page } : null;
  }
  if (upper.startsWith('ACT-')) {
    const a = graph.actions[upper];
    return a ? { kind: 'action', key: upper, page: a.page } : null;
  }
  const id = /^CH-\d+$/.test(upper) ? graph.chIndex[upper] : /^\d+$/.test(upper) ? Number(upper) : undefined;
  if (id === undefined) return null;
  const entry = graph.ids[String(id)];
  return entry ? { kind: 'code', key: String(id), page: entry.page } : null;
}

// ---------------------------------------------------------------------------
// Live sections (evidence): pluggable
// ---------------------------------------------------------------------------

export type PackCell = string | number | boolean | null;

export interface PackLiveSection {
  /** The source's id, stable: `admin-events`, `counters`, `sessions`, `release`. */
  source: string;
  title: string;
  state: 'ok' | 'no-signal' | 'failed';
  /** One line: what was read, or why there is nothing. */
  note: string;
  rows?: Array<Record<string, PackCell>>;
}

export interface PackLiveContext {
  includeNames: boolean;
}

/** One live lens on a pack's target. PR 3's data layer (src/lib/admin/clubhouse/live.ts) supplies more of these. */
export interface PackLiveSource {
  id: string;
  title: string;
  read(target: PackTarget, graph: BridgeGraph, ctx: PackLiveContext): Promise<PackLiveSection>;
}

/** A source that has nothing to read yet, and says so instead of claiming zero. */
export function noSignalSource(id: string, title: string, what: string): PackLiveSource {
  return {
    id,
    title,
    read: async () => ({ source: id, title, state: 'no-signal', note: `No signal yet: ${what} once Clubhouse signals reach the Bridge.` }),
  };
}

/** The evidence §9.1 lists, each "No signal yet" until its reader is wired (PR 3 replaces these by id). */
export const DEFAULT_LIVE_SOURCES: readonly PackLiveSource[] = [
  noSignalSource('counters', 'Counts and their split', 'counts by role, platform and release, first and last seen'),
  noSignalSource('envelopes', 'Representative envelopes', 'three envelopes with their trails, grouped stacks and server codes'),
  noSignalSource('sessions', 'Sessions', 'the sessions that hit it, as pseudonymous ids'),
  noSignalSource('release', 'The release it started in', 'the first release that sent it'),
];

/** Sources by id, later ones replacing earlier ones: `withSources(DEFAULT_LIVE_SOURCES, [liveCounters])`. */
export function withSources(base: readonly PackLiveSource[], extra: readonly PackLiveSource[]): PackLiveSource[] {
  const byId = new Map(base.map((s) => [s.id, s]));
  for (const s of extra) byId.set(s.id, s);
  return [...byId.values()];
}

async function readSafely(source: PackLiveSource, target: PackTarget, graph: BridgeGraph, ctx: PackLiveContext): Promise<PackLiveSection> {
  try {
    return await source.read(target, graph, ctx);
  } catch (err) {
    return { source: source.id, title: source.title, state: 'failed', note: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

export interface PackId {
  id: BridgeId;
  ch: string | null;
  page: PageId;
  category: string;
  name: string;
  meaning: string;
  status: GraphId['status'];
  when: string | null;
  theySee: string | null;
  how: string | null;
  test: string | null;
}

export interface PackAction {
  id: string;
  label: string;
  handler: string | null;
  service: string | null;
  tables: string[];
  outcomes: Record<string, BridgeId>;
}

export interface PackControl {
  id: string;
  label: string;
  file: string | null;
  role: string | null;
  actions: string[];
  verdict: string | null;
}

export interface ContextPack {
  schema: typeof PACK_SCHEMA;
  /** The contract's content hash: the pack is read against this graph. */
  contract: string;
  /** The live SHA, or `main` when unstamped. */
  release: string;
  people: 'pseudonymous' | 'names';
  target: PackTarget & { label: string; href: string };
  ask: { about: string; question: string };
  contractRows: { ids: PackId[]; actions: PackAction[]; controls: PackControl[]; categories: string[]; truncated: number };
  evidence: PackLiveSection[];
  code: { files: string[]; tests: string[]; testCommand: string | null; services: string[]; tables: string[] };
  read: string[];
  reproduce: { routes: string[]; roles: string[]; preview: string | null; browser: string };
  done: { codes: string[]; tests: string[]; gates: string[]; drift: string[] };
}

function packId(id: BridgeId, entry: GraphId): PackId {
  return {
    id,
    ch: entry.ch ?? null,
    page: entry.page,
    category: `${categoryCode(entry.category)} ${categoryName(entry.category)}`,
    name: entry.name,
    meaning: entry.meaning,
    status: entry.status,
    when: entry.meaning ?? null,
    theySee: entry.catalogRow?.theySee ?? null,
    how: entry.catalogRow?.how ?? null,
    test: entry.catalogRow?.test ?? null,
  };
}

function packAction(id: string, a: GraphAction): PackAction {
  return { id, label: a.label, handler: a.handler, service: a.service, tables: [...a.tables], outcomes: { ...a.outcomes } };
}

function packControl(id: string, c: GraphControl): PackControl {
  return { id, label: controlLabel(c), file: c.file ?? null, role: c.role ?? null, actions: [...c.actions], verdict: c.verdict ?? null };
}

const fileOf = (loc: string) => loc.split('#')[0]!.replace(/:\d+(?:-\d+)?$/, '').trim();
const uniq = <T,>(xs: Iterable<T>) => [...new Set(xs)];

/** Which IDs, actions and controls a target involves. */
function involved(graph: BridgeGraph, target: PackTarget): { ids: BridgeId[]; actions: string[]; controls: string[]; truncated: number } {
  if (target.kind === 'code') {
    const id = Number(target.key);
    const ch = graph.ids[target.key]?.ch;
    const actions = actionsEndingIn(graph, id);
    const controls = uniq([
      ...controlsStarting(graph, actions),
      ...Object.entries(graph.controls).filter(([, c]) => ch && c.code === ch).map(([k]) => k),
    ]).sort();
    return { ids: [id], actions, controls, truncated: 0 };
  }
  if (target.kind === 'action') {
    const a = graph.actions[target.key]!;
    return { ids: uniq(Object.values(a.outcomes)).sort((x, y) => x - y), actions: [target.key], controls: controlsStarting(graph, [target.key]), truncated: 0 };
  }
  if (target.kind === 'control') {
    const c = graph.controls[target.key]!;
    const fromActions = c.actions.flatMap((act) => Object.values(graph.actions[act]?.outcomes ?? {}));
    const own = c.code ? graph.chIndex[c.code] : undefined;
    return { ids: uniq([...(own !== undefined ? [own] : []), ...fromActions]).sort((x, y) => x - y), actions: [...c.actions], controls: [target.key], truncated: 0 };
  }
  // A page: its failure states first, then the rest, capped; every action; no controls (B02 lists them).
  const mine = Object.entries(graph.ids)
    .filter(([, e]) => e.page === target.page && e.status !== 'deprecated')
    .map(([k, e]) => ({ id: Number(k), failure: FAILURE_CATEGORIES.has(e.category) }))
    .sort((a, b) => Number(b.failure) - Number(a.failure) || a.id - b.id);
  const actions = Object.entries(graph.actions).filter(([, a]) => a.page === target.page).map(([k]) => k).sort();
  return { ids: mine.slice(0, PAGE_PACK_ID_LIMIT).map((m) => m.id), actions, controls: [], truncated: Math.max(0, mine.length - PAGE_PACK_ID_LIMIT) };
}

function targetLabel(graph: BridgeGraph, target: PackTarget): string {
  if (target.kind === 'page') return `${target.key} ${graph.pages[target.page]?.name ?? ''}`.trim();
  if (target.kind === 'action') return `${target.key} (${graph.actions[target.key]?.label ?? ''})`;
  if (target.kind === 'control') return `${target.key} (${controlLabel(graph.controls[target.key]!)})`;
  const e = graph.ids[target.key];
  return e?.ch ? `${target.key} · ${e.ch}` : target.key;
}

function targetHref(target: PackTarget): string {
  if (target.kind === 'page') return clubhouseHref.page(target.key);
  if (target.kind === 'action') return clubhouseHref.action(target.key);
  if (target.kind === 'control') return clubhouseHref.control(target.key);
  return clubhouseHref.code(target.key);
}

function question(graph: BridgeGraph, target: PackTarget): string {
  if (target.kind === 'code') {
    const e = graph.ids[target.key]!;
    if (e.status === 'deprecated') return `Why does the retired state ${targetLabel(graph, target)} still fire, and what replaced it?`;
    if (e.status === 'reserved') return `${targetLabel(graph, target)} is reserved: build it, or confirm it should never fire.`;
    if (FAILURE_CATEGORIES.has(e.category)) return `Why does "${e.meaning}" happen, and how do we stop it?`;
    return `Is "${e.meaning}" doing what its contract says?`;
  }
  if (target.kind === 'action') return `Does "${graph.actions[target.key]!.label}" end only in the outcomes it lists, and fast enough?`;
  if (target.kind === 'control') return `Does this control do what its label says, and report the action it starts?`;
  return `Is ${targetLabel(graph, target)} doing what its contract says?`;
}

export interface BuildPackOptions {
  includeNames?: boolean;
  sources?: readonly PackLiveSource[];
  /** The live SHA (liveRef()), or `main`. */
  release?: string;
}

export async function buildPack(graph: BridgeGraph, target: PackTarget, options: BuildPackOptions = {}): Promise<ContextPack> {
  const includeNames = options.includeNames === true;
  const inv = involved(graph, target);
  const ids = inv.ids.flatMap((id) => (graph.ids[String(id)] ? [packId(id, graph.ids[String(id)]!)] : []));
  const actions = inv.actions.flatMap((k) => (graph.actions[k] ? [packAction(k, graph.actions[k]!)] : []));
  const controls = inv.controls.flatMap((k) => (graph.controls[k] ? [packControl(k, graph.controls[k]!)] : []));
  const page = graph.pages[target.page];

  const files = uniq([
    ...inv.ids.flatMap((id) => (graph.ids[String(id)]?.where ?? []).map(fileOf)),
    ...inv.ids.flatMap((id) => {
      const ch = graph.ids[String(id)]?.ch;
      return ch && !(graph.ids[String(id)]?.where ?? []).length ? (graph.codeIndex[ch] ?? []) : [];
    }),
    ...actions.flatMap((a) => [graph.actions[a.id]?.component, a.service].filter((x): x is string => !!x).map(fileOf)),
    ...controls.flatMap((c) => (c.file ? [fileOf(c.file)] : [])),
  ]).sort();
  const tests = uniq([
    ...inv.ids.flatMap((id) => graph.ids[String(id)]?.tests ?? []),
    ...inv.actions.flatMap((a) => graph.actions[a]?.tests ?? []),
  ]).sort();

  const read = uniq([
    ...Object.values(page?.docs ?? {}).filter((d): d is string => !!d),
    ...(page?.catalog ? [page.catalog] : []),
    ...(page?.held ?? []).filter((h) => h.status !== 'superseded').map((h) => h.plan),
    'memory/incidents/ (notes that name these codes)',
    '.claude/rules/clubhouse.md',
  ]);

  const failing = ids.filter((i) => FAILURE_CATEGORIES.has(Number(i.category.slice(0, 2))) || i.status === 'deprecated');
  const drift: string[] = [];
  if (ids.some((i) => i.status === 'deprecated')) drift.push('3 Deprecated or tombstoned codes still firing');
  if (ids.some((i) => i.status === 'reserved')) drift.push('4 Reserved codes that fired');
  if (inv.actions.length) drift.push('7 Action outcomes that are deprecated, or that fired unlisted');
  if (controls.some((c) => !c.actions.length)) drift.push('§4.7 Controls with neither an action nor a link');

  const sources = options.sources ?? DEFAULT_LIVE_SOURCES;
  const evidence = await Promise.all(sources.map((s) => readSafely(s, target, graph, { includeNames })));

  return {
    schema: PACK_SCHEMA,
    contract: graph.contentHash,
    release: options.release ?? 'main',
    people: includeNames ? 'names' : 'pseudonymous',
    target: { ...target, label: targetLabel(graph, target), href: targetHref(target) },
    ask: { about: `${target.kind} ${targetLabel(graph, target)}`, question: question(graph, target) },
    contractRows: {
      ids,
      actions,
      controls,
      categories: uniq(ids.map((i) => i.category)).sort(),
      truncated: inv.truncated,
    },
    evidence,
    code: {
      files,
      tests,
      testCommand: tests.length ? `npm run test:file -- ${tests.join(' ')}` : null,
      services: uniq(actions.map((a) => a.service).filter((s): s is string => !!s)),
      tables: uniq(actions.flatMap((a) => a.tables)).sort(),
    },
    read,
    reproduce: {
      routes: page ? [...page.routes, ...page.plannedRoutes] : [],
      roles: page ? [...page.roles] : [],
      preview: previewPath(target.page),
      browser: 'W first: Playwright WebKit on a phone viewport, then real Safari (.claude/rules/browsers.md)',
    },
    done: {
      codes: failing.map((i) => `${i.id}${i.ch ? ` ${i.ch}` : ''} stops firing`),
      tests,
      gates: ['npm run clubhouse:check'],
      drift,
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const esc = (v: PackCell | undefined) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const list = (xs: readonly string[], none = 'none') => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : `- ${none}`);

/** The pack as one paste: seven sections, then the same pack as a `bridge-pack/v1` JSON block. */
export function renderPackMarkdown(pack: ContextPack): string {
  const c = pack.contractRows;
  const out: string[] = [
    `# Context pack: ${pack.target.label}`,
    '',
    `Schema ${pack.schema} · contract ${pack.contract} · release ${pack.release === 'main' ? 'unstamped' : pack.release.slice(0, 7)} · people ${pack.people}`,
    '',
    '## 1. The ask',
    '',
    `About: ${pack.ask.about}.`,
    '',
    pack.ask.question,
    '',
    '## 2. The contract',
    '',
  ];
  if (c.ids.length) {
    out.push('| Bridge ID | Code | Category | Status | When | They see | How | Test |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const i of c.ids) out.push(`| ${i.id} | ${esc(i.ch)} | ${esc(i.category)} | ${i.status} | ${esc(i.when)} | ${esc(i.theySee)} | ${esc(i.how)} | ${esc(i.test)} |`);
    if (c.truncated) out.push('', `${c.truncated} more of this page's IDs are on its dossier (failure states are listed first).`);
  } else out.push('No Bridge ID.');
  if (c.actions.length) {
    out.push('', '| Action | Label | Handler | Service | Tables | Outcomes |', '| --- | --- | --- | --- | --- | --- |');
    for (const a of c.actions) {
      const outcomes = Object.entries(a.outcomes).map(([k, v]) => `${k} → ${v}`).join(', ');
      out.push(`| ${a.id} | ${esc(a.label)} | ${esc(a.handler)} | ${esc(a.service)} | ${esc(a.tables.join(', ') || null)} | ${esc(outcomes || null)} |`);
    }
  }
  if (c.controls.length) {
    out.push('', '| Control | Label | Role | Runs | Board | File |', '| --- | --- | --- | --- | --- | --- |');
    for (const k of c.controls) out.push(`| ${k.id} | ${esc(k.label)} | ${esc(k.role)} | ${esc(k.actions.join(', ') || null)} | ${esc(k.verdict)} | ${esc(k.file)} |`);
  }
  out.push('', `Categories: ${c.categories.join('; ') || 'none'}.`, '', '## 3. The evidence', '');
  for (const s of pack.evidence) {
    out.push(`### ${s.title}`, '', s.note);
    if (s.rows?.length) {
      const cols = Object.keys(s.rows[0]!);
      out.push('', `| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...s.rows.map((r) => `| ${cols.map((k) => esc(r[k])).join(' | ')} |`));
    }
    out.push('');
  }
  out.push(
    '## 4. The code',
    '',
    list(pack.code.files, 'no file located; search the code index'),
    '',
    `Tests to run: ${pack.code.testCommand ?? 'none named'}`,
    '',
    `Server actions: ${pack.code.services.join(', ') || 'none'} · tables: ${pack.code.tables.join(', ') || 'none'}`,
    '',
    '## 5. What to read',
    '',
    list(pack.read),
    '',
    '## 6. How to reproduce',
    '',
    `- Routes: ${pack.reproduce.routes.join(', ') || 'none'}`,
    `- Roles: ${pack.reproduce.roles.join(', ') || 'signed out'}`,
    `- Preview: ${pack.reproduce.preview ?? 'none for this page'} (a local dev server; not served in production)`,
    `- Browser: ${pack.reproduce.browser}`,
    '',
    '## 7. Done means',
    '',
    list([...pack.done.codes, ...pack.done.tests.map((t) => `${t} passes`), ...pack.done.gates.map((g) => `${g} green`), ...pack.done.drift.map((d) => `drift list ${d} does not grow`)]),
    '',
    '```json',
    JSON.stringify(pack, null, 2),
    '```',
    '',
  );
  return out.join('\n');
}

/** A file name for the download (BR-1303): `bridge-pack-70603.md`. */
export function packFileName(pack: ContextPack): string {
  return `bridge-pack-${pack.target.key.replace(/[^A-Za-z0-9-]/g, '-')}.md`;
}
