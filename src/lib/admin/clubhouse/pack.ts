/**
 * The context pack (plan §9.1): everything Claude Duet needs about one page, control, action or code, in one paste.
 * Markdown with one JSON block (`bridge-pack/v1`), in seven parts: the ask, the contract, the evidence, the code, what
 * to read, how to reproduce, and what done means.
 *
 * The contract, code, reading and reproduction parts come from the graph and are exact today. The evidence is live
 * data, so it comes from `PackLiveSource`s: each answers "No signal yet" until its table exists. The live lenses'
 * readers (pack-server.ts: counters, envelopes, sessions, release, rules) plug in beside the admin_events one by id.
 *
 * A pack is about a page, control, action or code from the graph, or about something only live data knows: a release
 * (`rel:<sha>`, the regression pack), a person (`user:<uuid>`), a team (`team:<uuid>`), or an audit finding (F-0001).
 *
 * People are pseudonymous by default (D7): a source that returns people returns role, team and a pseudonymous id,
 * and names only when the caller passed `includeNames` (the B13 tick; the API never, unless its own switch allows).
 * A person or team pack's own subject is pseudonymous too: the server passes `pseudonymize`, and without it the id is
 * withheld, so a raw user id never reaches the paste.
 *
 * Pure and isomorphic. Plan: docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md
 */
import type { BridgeGraph, BridgeId, GraphAction, GraphControl, GraphId, PageId } from './graph';
import { FAILURE_CATEGORIES, actionsEndingIn, categoryCode, categoryName, clubhouseHref, controlLabel, controlsStarting, previewPath } from './screens';

export const PACK_SCHEMA = 'bridge-pack/v1' as const;

export type PackKind = 'page' | 'control' | 'action' | 'code' | 'release' | 'person' | 'team' | 'finding';

export interface PackTarget {
  kind: PackKind;
  /**
   * P007, CTL-P007-014, ACT-P007-SEND-MESSAGE, a Bridge ID as a string (70603), `rel:<sha>`, `user:<uuid>`,
   * `team:<uuid>` or F-0001. Feeding it back to resolvePackTarget gives the same target.
   */
  key: string;
  /** The page it belongs to; null for a release, a person or a team. */
  page: PageId | null;
  /** The bare SHA, user id, team id or finding id the live sources read by (release, person, team, finding only). */
  ref?: string;
}

const SHA_RE = /^[0-9a-f]{7,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The Duet desk targets for the live-only kinds: what PackLink passes. */
export const packTargetKey = {
  release: (sha: string) => `rel:${sha.toLowerCase()}`,
  person: (userId: string) => `user:${userId.toLowerCase()}`,
  team: (teamId: string) => `team:${teamId.toLowerCase()}`,
};

/** Most IDs a page pack lists: its failure states first. The whole page is one click away on B02. */
export const PAGE_PACK_ID_LIMIT = 40;

/**
 * Reads `P007`, `CTL-P007-014`, `ACT-P007-SEND-MESSAGE`, `70603`, `CH-7004`, `F-0001`, `rel:<7-40 hex>`,
 * `user:<uuid>` or `team:<uuid>` (any case). Null when it is none. A SHA and a UUID are prefixed because bare digits
 * already mean a Bridge ID.
 */
export function resolvePackTarget(graph: BridgeGraph, raw: string | null | undefined): PackTarget | null {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 80) return null;
  const live = /^(rel|user|team):(.+)$/i.exec(value);
  if (live) {
    const prefix = live[1]!.toLowerCase();
    const ref = live[2]!.toLowerCase();
    if (prefix === 'rel') return SHA_RE.test(ref) ? { kind: 'release', key: packTargetKey.release(ref), page: null, ref } : null;
    if (!UUID_RE.test(ref)) return null;
    return prefix === 'user' ? { kind: 'person', key: packTargetKey.person(ref), page: null, ref } : { kind: 'team', key: packTargetKey.team(ref), page: null, ref };
  }
  const upper = value.toUpperCase();
  if (/^F-\d{4}$/.test(upper)) {
    const f = graph.findings[upper];
    return f ? { kind: 'finding', key: upper, page: f.page, ref: upper } : null;
  }
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
  /** How a note names the target: its label, pseudonymous for a person or team unless names were asked for. */
  subject: string;
}

/** One live lens on a pack's target. pack-server.ts reads them through the live lenses' layer (live.ts). */
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

/** The evidence §9.1 lists, each "No signal yet" until its reader is wired (pack-server.ts replaces these by id). */
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

/** An audit finding's own words (B12), carried by a finding pack. */
export interface PackFinding {
  id: string;
  severity: string;
  status: string;
  title: string;
  screen: string;
  dimension: string;
  standard: string;
  fix: string;
  tier: string;
  audit: string;
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
  /** Present on a finding pack only. */
  finding?: PackFinding;
  evidence: PackLiveSection[];
  code: { files: string[]; tests: string[]; testCommand: string | null; services: string[]; tables: string[] };
  read: string[];
  reproduce: { routes: string[]; roles: string[]; preview: string | null; steps: string[]; browser: string };
  done: { codes: string[]; checks: string[]; tests: string[]; gates: string[]; drift: string[] };
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
  // A release, a person or a team has no contract of its own: its evidence names the codes. A finding cites files.
  if (target.kind === 'release' || target.kind === 'person' || target.kind === 'team' || target.kind === 'finding') {
    return { ids: [], actions: [], controls: [], truncated: 0 };
  }
  // A page: its failure states first, then the rest, capped; every action; no controls (B02 lists them).
  const mine = Object.entries(graph.ids)
    .filter(([, e]) => e.page === target.page && e.status !== 'deprecated')
    .map(([k, e]) => ({ id: Number(k), failure: FAILURE_CATEGORIES.has(e.category) }))
    .sort((a, b) => Number(b.failure) - Number(a.failure) || a.id - b.id);
  const actions = Object.entries(graph.actions).filter(([, a]) => a.page === target.page).map(([k]) => k).sort();
  return { ids: mine.slice(0, PAGE_PACK_ID_LIMIT).map((m) => m.id), actions, controls: [], truncated: Math.max(0, mine.length - PAGE_PACK_ID_LIMIT) };
}

/** What a person or team pack calls its subject: a pseudonym unless names were asked for (D7). */
export type PackPseudonymizer = (kind: 'person' | 'team', id: string) => string;

/** Without a server pseudonymizer the id is withheld, never printed. */
const WITHHELD: PackPseudonymizer = (kind) => (kind === 'person' ? 'u-withheld' : 't-withheld');

/** The target as a pack prints it: a person or team keyed by its pseudonym unless names were asked for. */
function shownTarget(target: PackTarget, includeNames: boolean, pseudonymize: PackPseudonymizer): PackTarget {
  if ((target.kind !== 'person' && target.kind !== 'team') || includeNames || !target.ref) return target;
  const alias = pseudonymize(target.kind, target.ref);
  return { ...target, key: alias, ref: alias };
}

function targetLabel(graph: BridgeGraph, target: PackTarget): string {
  if (target.kind === 'release') return `release ${(target.ref ?? '').slice(0, 7)}`;
  if (target.kind === 'person') return `person ${target.ref ?? ''}`.trim();
  if (target.kind === 'team') return `team ${target.ref ?? ''}`.trim();
  if (target.kind === 'finding') return `${target.key} (${graph.findings[target.key]?.title ?? ''})`;
  if (target.kind === 'page') return `${target.key} ${target.page ? (graph.pages[target.page]?.name ?? '') : ''}`.trim();
  if (target.kind === 'action') return `${target.key} (${graph.actions[target.key]?.label ?? ''})`;
  if (target.kind === 'control') return `${target.key} (${controlLabel(graph.controls[target.key]!)})`;
  const e = graph.ids[target.key];
  return e?.ch ? `${target.key} · ${e.ch}` : target.key;
}

const LIVE_BASE = '/admin/clubhouse';

/** Where "Open the dossier" goes. A pseudonymous person or team opens the sessions index, not their own page. */
function targetHref(target: PackTarget, pseudonymous: boolean): string {
  if (target.kind === 'release') return `${LIVE_BASE}/releases/${encodeURIComponent(target.ref ?? '')}`;
  if (target.kind === 'person' || target.kind === 'team') {
    if (pseudonymous || !target.ref) return `${LIVE_BASE}/sessions`;
    return `${LIVE_BASE}/${target.kind === 'person' ? 'people' : 'teams'}/${encodeURIComponent(target.ref)}`;
  }
  if (target.kind === 'finding') return `${clubhouseHref.readiness()}?view=findings`;
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
  if (target.kind === 'release') return `What did ${targetLabel(graph, target)} break or slow down for real people, and which change caused it?`;
  if (target.kind === 'person') return `Why is Clubhouse failing this person, and is it only them?`;
  if (target.kind === 'team') return `Why is Clubhouse failing this team, and is it only them?`;
  if (target.kind === 'finding') {
    const f = graph.findings[target.key];
    return `${f?.title ?? target.key}: fix it the way the audit says, and prove it.`;
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
  /** Pseudonyms for a person or team pack's subject (pack-server.ts `packPseudonym`). Without it the id is withheld. */
  pseudonymize?: PackPseudonymizer;
}

export async function buildPack(graph: BridgeGraph, rawTarget: PackTarget, options: BuildPackOptions = {}): Promise<ContextPack> {
  const includeNames = options.includeNames === true;
  const target = shownTarget(rawTarget, includeNames, options.pseudonymize ?? WITHHELD);
  const finding = rawTarget.kind === 'finding' ? graph.findings[rawTarget.key] : undefined;
  const inv = involved(graph, rawTarget);
  const ids = inv.ids.flatMap((id) => (graph.ids[String(id)] ? [packId(id, graph.ids[String(id)]!)] : []));
  const actions = inv.actions.flatMap((k) => (graph.actions[k] ? [packAction(k, graph.actions[k]!)] : []));
  const controls = inv.controls.flatMap((k) => (graph.controls[k] ? [packControl(k, graph.controls[k]!)] : []));
  const page = target.page ? graph.pages[target.page] : undefined;

  const files = uniq([
    ...inv.ids.flatMap((id) => (graph.ids[String(id)]?.where ?? []).map(fileOf)),
    ...inv.ids.flatMap((id) => {
      const ch = graph.ids[String(id)]?.ch;
      return ch && !(graph.ids[String(id)]?.where ?? []).length ? (graph.codeIndex[ch] ?? []) : [];
    }),
    ...actions.flatMap((a) => [graph.actions[a.id]?.component, a.service].filter((x): x is string => !!x).map(fileOf)),
    ...controls.flatMap((c) => (c.file ? [fileOf(c.file)] : [])),
    ...(finding?.files ?? []).map(fileOf),
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

  const checks: string[] = [];
  if (rawTarget.kind === 'release') checks.push(`The new and rising failure codes in ${targetLabel(graph, target)} fall back to the base release's level (B10)`);
  if (rawTarget.kind === 'person' || rawTarget.kind === 'team') checks.push(`The failure codes in the evidence stop firing for this ${rawTarget.kind}`);
  if (finding) checks.push(`${rawTarget.key} is re-checked by its audit (${finding.audit}) and marked fixed`);

  const subject = targetLabel(graph, target);
  const sources = options.sources ?? DEFAULT_LIVE_SOURCES;
  // Sources read by the real ids; they print `subject`, which is pseudonymous unless names were asked for.
  const evidence = await Promise.all(sources.map((s) => readSafely(s, rawTarget, graph, { includeNames, subject })));

  return {
    schema: PACK_SCHEMA,
    contract: graph.contentHash,
    release: options.release ?? 'main',
    people: includeNames ? 'names' : 'pseudonymous',
    target: { ...target, label: subject, href: targetHref(rawTarget, target !== rawTarget) },
    ask: { about: target.kind === 'release' || target.kind === 'person' || target.kind === 'team' ? subject : `${target.kind} ${subject}`, question: question(graph, target) },
    contractRows: {
      ids,
      actions,
      controls,
      categories: uniq(ids.map((i) => i.category)).sort(),
      truncated: inv.truncated,
    },
    ...(finding
      ? {
          finding: {
            id: rawTarget.key,
            severity: finding.severity,
            status: finding.status,
            title: finding.title,
            screen: finding.screen,
            dimension: finding.dimension,
            standard: finding.standard,
            fix: finding.fix,
            tier: finding.tier,
            audit: finding.audit,
          },
        }
      : {}),
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
      preview: target.page ? previewPath(target.page) : null,
      steps: finding ? (Array.isArray(finding.repro) ? [...finding.repro] : finding.repro ? [finding.repro] : []) : [],
      browser: 'W first: Playwright WebKit on a phone viewport, then real Safari (.claude/rules/browsers.md)',
    },
    done: {
      codes: failing.map((i) => `${i.id}${i.ch ? ` ${i.ch}` : ''} stops firing`),
      checks,
      tests,
      gates: ['npm run clubhouse:check'],
      drift,
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const esc = (v: PackCell | undefined) => String(v ?? '—').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
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
  if (pack.finding) {
    const f = pack.finding;
    out.push('', `Finding ${f.id} (${f.severity}, ${f.status}) on ${f.screen}: ${f.title}`, '', `- Standard: ${f.standard}`, `- Dimension: ${f.dimension} · tier ${f.tier} · audit ${f.audit}`, `- Fix: ${f.fix}`);
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
    `- Roles: ${pack.reproduce.roles.join(', ') || (pack.target.page ? 'signed out' : 'not one page: see the sessions in the evidence')}`,
    `- Preview: ${pack.reproduce.preview ?? 'none for this page'} (a local dev server; not served in production)`,
    ...pack.reproduce.steps.map((step, i) => `- Step ${i + 1}: ${step}`),
    `- Browser: ${pack.reproduce.browser}`,
    '',
    '## 7. Done means',
    '',
    list([...pack.done.codes, ...pack.done.checks, ...pack.done.tests.map((t) => `${t} passes`), ...pack.done.gates.map((g) => `${g} green`), ...pack.done.drift.map((d) => `drift list ${d} does not grow`)]),
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
