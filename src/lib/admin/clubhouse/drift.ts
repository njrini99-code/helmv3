/**
 * B11 Drift (plan §8, §4.3, §4.7): "Are the docs still the truth?" Nine lists, each a number to drive to zero, plus the
 * two §4.3/§4.7 lists the plan names without numbering (controls with neither an action nor a link; codes that fired on
 * the wrong page).
 *
 * The build half is pure and reads only the graph this deploy shipped with, so it renders before any signal reaches
 * the Bridge. The runtime half reads `clubhouse_drift` (held migration 20261124090000): until that table exists every
 * runtime list says "No signal yet" (BR-1193), never zero.
 *
 * Which lists `clubhouse:check` already holds at zero (plan §13): 1, 6 and the build half of 7 are registry
 * violations (scripts/clubhouse/registry.mjs checkRegistry), 8 is the registry's "a page with no catalog Bridge ID"
 * check, and 9 is `clickable-map.mjs --check`. The test in __tests__/drift.test.ts runs these lists on the real graph.
 *
 * Plan: docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md
 */
import type { BridgeGraph, GraphControl, PageId } from './graph';
import { clubhouseHref, controlLabel } from './screens';

export type DriftListKey =
  | 'uncatalogued'
  | 'unknown-fired'
  | 'deprecated-fired'
  | 'reserved-fired'
  | 'never-seen'
  | 'where'
  | 'outcomes'
  | 'pages'
  | 'controls'
  | 'unlinked'
  | 'wrong-page';

/** How a list is found: from the files at build time, from the signal at run time, or both. */
export type DriftSource = 'build' | 'runtime' | 'build+runtime';

export interface DriftListMeta {
  key: DriftListKey;
  /** The plan's number (1-9); the two unnumbered lists carry the section that names them. */
  n: string;
  title: string;
  source: DriftSource;
  /** The check that keeps it at zero, when one does. */
  heldBy: string | null;
  /** What "driven to zero" means here, in plain words. */
  fix: string;
}

/** The order is the tab order: the plan's nine first, then the two it names elsewhere. */
export const DRIFT_LISTS: readonly DriftListMeta[] = [
  {
    key: 'uncatalogued',
    n: '1',
    title: 'Codes in the source but not in the registry',
    source: 'build',
    heldBy: 'clubhouse:check (registry: "writes CH-…, which is in no catalog")',
    fix: 'Add the row to the page’s catalog, or write a code that is already in one.',
  },
  {
    key: 'unknown-fired',
    n: '2',
    title: 'Codes that fired but aren’t in the registry',
    source: 'runtime',
    heldBy: null,
    fix: 'Catalog the code, or stop the release that sends it.',
  },
  {
    key: 'deprecated-fired',
    n: '3',
    title: 'Deprecated or tombstoned codes still firing',
    source: 'runtime',
    heldBy: null,
    fix: 'Point the code at the outcome that replaced it.',
  },
  {
    key: 'reserved-fired',
    n: '4',
    title: 'Reserved codes that fired',
    source: 'runtime',
    heldBy: null,
    fix: 'Mark the code implemented in its catalog, with the test that forces it.',
  },
  {
    key: 'never-seen',
    n: '5',
    title: 'Implemented, never seen in 30 days',
    source: 'runtime',
    heldBy: null,
    fix: 'Classify each: rare by nature (offline, validation), or broken instrument.',
  },
  {
    key: 'where',
    n: '6',
    title: '`where` points at a missing file',
    source: 'build',
    heldBy: 'clubhouse:check (registry: "where names …, which does not exist")',
    fix: 'Write the full path from the repo root, to a file that exists.',
  },
  {
    key: 'outcomes',
    n: '7',
    title: 'Action outcomes that are deprecated, or that fired unlisted',
    source: 'build+runtime',
    heldBy: 'clubhouse:check (registry: "bridge.… is retired") for the build half',
    fix: 'Point the outcome at its replacement; list an outcome the action really ends in.',
  },
  {
    key: 'pages',
    n: '8',
    title: 'Pages without Bridge IDs',
    source: 'build',
    heldBy: 'clubhouse:check (registry: "has no Bridge ID of its own")',
    fix: 'Give the page a catalog block (D12 did this for P017 Practice).',
  },
  {
    key: 'controls',
    n: '9',
    title: 'Controls with no `data-ctl` or no label',
    source: 'build',
    heldBy: 'clubhouse:check (clickable-map.mjs --check)',
    fix: 'Run node scripts/clubhouse/clickable-map.mjs --assign and label what it numbered.',
  },
  {
    key: 'unlinked',
    n: '§4.7',
    title: 'Controls with neither an action nor a link',
    source: 'build',
    heldBy: null,
    fix: 'Link the control to its ACT- id in the action map, or confirm it only changes the screen it is on.',
  },
  {
    key: 'wrong-page',
    n: '§4.3',
    title: 'Codes that fired on the wrong page, and silent actions',
    source: 'runtime',
    heldBy: null,
    fix: 'Borrow the code in the page’s CONTRACT.md, or send it from the page that owns it.',
  },
] as const;

export const DRIFT_KEYS: readonly DriftListKey[] = DRIFT_LISTS.map((l) => l.key);

export function parseDriftList(raw: string | string[] | undefined): DriftListKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return DRIFT_KEYS.includes(v as DriftListKey) ? (v as DriftListKey) : 'uncatalogued';
}

export function driftMeta(key: DriftListKey): DriftListMeta {
  return DRIFT_LISTS.find((l) => l.key === key)!;
}

/** One line on a list: the thing, where it is, and the dossier that opens it (BR-1102). */
export interface DriftEntry {
  key: string;
  label: string;
  detail: string;
  page?: PageId | null;
  href?: string;
  /** A repo path the row names, opened on GitHub at the live SHA. */
  file?: string;
}

// ---------------------------------------------------------------------------
// The build half: pure, from the graph
// ---------------------------------------------------------------------------

/** The registry's rule (registry.mjs WHERE_ROOT): a `where` path is written in full from the repo root. */
const FULL_PATH = /^(?:(?:src|scripts|config|docs|supabase|e2e|tests|design|design-refresh)\/|[\w.-]+\.config\.m?[jt]s$)/;

/** A where entry (`src/a.tsx#Sym`, `src/a.tsx:12`) to its file. */
export function whereFile(where: string): string {
  return where.split('#')[0]!.replace(/:\d+(?::\d+)?$/, '').trim();
}

/** The Bridge's own rows (category 25, D4) are not the page's contract: a page with only those still has none. */
export const BRIDGE_ACTION_CATEGORY = 25;

/** A control the ledger describes as a link (`"Open settings" link: opens …`), or drawn as an anchor. */
export function controlIsLink(control: GraphControl): boolean {
  if (control.element === 'a' || control.element === 'Link' || /Link$/.test(control.element ?? '')) return true;
  return /\blink: opens\b/.test(control.description ?? '');
}

/** Rare by nature (plan §8 B11 list 5): validation and offline states, which a healthy week may never show. */
export const RARE_BY_NATURE_CATEGORIES: ReadonlySet<number> = new Set([5, 7]);

export interface NeverSeenSplit {
  rare: number;
  common: number;
}

/** The denominator for list 5: every implemented ID, split by whether silence is expected. */
export function neverSeenCandidates(graph: BridgeGraph): NeverSeenSplit {
  let rare = 0;
  let common = 0;
  for (const id of Object.values(graph.ids)) {
    if (id.status !== 'implemented') continue;
    if (RARE_BY_NATURE_CATEGORIES.has(id.category)) rare += 1;
    else common += 1;
  }
  return { rare, common };
}

export type BuildDrift = Record<'uncatalogued' | 'where' | 'outcomes' | 'pages' | 'controls' | 'unlinked', DriftEntry[]>;

export function buildTimeDrift(graph: BridgeGraph): BuildDrift {
  const known = new Set(Object.keys(graph.chIndex));

  const uncatalogued: DriftEntry[] = Object.entries(graph.codeIndex)
    .filter(([code]) => !known.has(code))
    .map(([code, files]) => ({
      key: code,
      label: code,
      detail: `written in ${files.length} file${files.length === 1 ? '' : 's'}, in no catalog`,
      file: files[0],
    }));

  const where: DriftEntry[] = [];
  for (const [key, id] of Object.entries(graph.ids)) {
    for (const w of id.where ?? []) {
      const file = whereFile(w);
      if (!file || FULL_PATH.test(file)) continue;
      where.push({ key: `${key}:${file}`, label: `${key}${id.ch ? ` · ${id.ch}` : ''}`, detail: `where names ${file}, not a path from the repo root`, page: id.page, href: clubhouseHref.code(key) });
    }
  }

  const outcomes: DriftEntry[] = [];
  for (const [actId, action] of Object.entries(graph.actions)) {
    for (const [outcome, bridgeId] of Object.entries(action.outcomes)) {
      const id = graph.ids[String(bridgeId)];
      const tomb = graph.tombstones[String(bridgeId)];
      const why = tomb ? 'tombstoned' : !id ? 'not in the registry' : id.status === 'deprecated' ? 'deprecated' : null;
      if (!why) continue;
      outcomes.push({ key: `${actId}:${outcome}`, label: `${actId} → ${outcome}`, detail: `lands on ${bridgeId}, which is ${why}`, page: action.page, href: clubhouseHref.action(actId) });
    }
  }

  const own = new Map<string, number>();
  for (const id of Object.values(graph.ids)) {
    if (id.category === BRIDGE_ACTION_CATEGORY) continue;
    own.set(id.page, (own.get(id.page) ?? 0) + 1);
  }
  const pages: DriftEntry[] = (Object.keys(graph.pages) as PageId[])
    .filter((p) => !own.get(p))
    .sort()
    .map((p) => ({ key: p, label: `${p} ${graph.pages[p]!.name}`, detail: 'no Bridge ID outside category 25', page: p, href: clubhouseHref.page(p) }));

  const controls: DriftEntry[] = [];
  const unlinked: DriftEntry[] = [];
  for (const [ctl, control] of Object.entries(graph.controls)) {
    const row = { key: ctl, label: `${ctl} ${controlLabel(control)}`, page: control.page, href: clubhouseHref.control(ctl), file: control.file };
    if (!control.label && !control.labelTemplate) controls.push({ ...row, detail: 'numbered, but has no label or label template' });
    if (control.actions.length === 0 && !controlIsLink(control)) unlinked.push({ ...row, detail: control.description ?? 'no action and no link' });
  }

  const byKey = (a: DriftEntry, b: DriftEntry) => a.key.localeCompare(b.key, 'en', { numeric: true });
  return {
    uncatalogued: uncatalogued.sort(byKey),
    where: where.sort(byKey),
    outcomes: outcomes.sort(byKey),
    pages,
    controls: controls.sort(byKey),
    unlinked: unlinked.sort(byKey),
  };
}

// ---------------------------------------------------------------------------
// The runtime half: rows from clubhouse_drift (plan §4.3)
// ---------------------------------------------------------------------------

/** The table's `kind` check constraint, verbatim. */
export type RuntimeDriftKind = 'unknown-code' | 'deprecated-fired' | 'reserved-fired' | 'wrong-page' | 'wrong-outcome' | 'silent-action';

export interface RuntimeDriftRow {
  kind: RuntimeDriftKind;
  code: string;
  release: string;
  drift_count: number;
  first_seen: string;
  last_seen: string;
}

/** What the reader got: rows, no table yet (held migration), or a failure to say out loud. */
export type RuntimeDrift =
  | { state: 'ok'; rows: RuntimeDriftRow[] }
  | { state: 'no-signal'; reason: string }
  | { state: 'failed'; message: string };

/** Which runtime kinds feed which list. */
export const RUNTIME_KINDS: Readonly<Partial<Record<DriftListKey, readonly RuntimeDriftKind[]>>> = {
  'unknown-fired': ['unknown-code'],
  'deprecated-fired': ['deprecated-fired'],
  'reserved-fired': ['reserved-fired'],
  outcomes: ['wrong-outcome'],
  'wrong-page': ['wrong-page', 'silent-action'],
};

export function runtimeEntries(graph: BridgeGraph, rows: readonly RuntimeDriftRow[], key: DriftListKey): DriftEntry[] {
  const kinds = RUNTIME_KINDS[key];
  if (!kinds) return [];
  return rows
    .filter((r) => kinds.includes(r.kind))
    .map((r) => {
      const bridgeId = /^\d+$/.test(r.code) ? Number(r.code) : graph.chIndex[r.code];
      const id = bridgeId !== undefined ? graph.ids[String(bridgeId)] : undefined;
      return {
        key: `${r.kind}:${r.code}:${r.release}`,
        label: id?.ch && String(bridgeId) !== r.code ? `${r.code} · ${bridgeId}` : r.code,
        detail: `${r.kind} · ${r.drift_count}× · release ${r.release.slice(0, 7)} · last ${r.last_seen.slice(0, 16).replace('T', ' ')}`,
        page: id?.page ?? null,
        href: bridgeId !== undefined && id ? clubhouseHref.code(bridgeId) : undefined,
      };
    });
}

export interface DriftCount {
  key: DriftListKey;
  /** null when the list can't be counted yet (runtime, no signal). */
  count: number | null;
}

/** The count per list for the tab rail: build lists always count; runtime lists count only with a signal. */
export function driftCounts(build: BuildDrift, runtime: RuntimeDrift, graph: BridgeGraph): DriftCount[] {
  return DRIFT_LISTS.map((meta) => {
    const buildPart = (build as Partial<Record<DriftListKey, DriftEntry[]>>)[meta.key]?.length ?? 0;
    if (meta.source === 'build') return { key: meta.key, count: buildPart };
    if (meta.key === 'never-seen') return { key: meta.key, count: null };
    if (runtime.state !== 'ok') return { key: meta.key, count: meta.source === 'build+runtime' ? buildPart : null };
    return { key: meta.key, count: buildPart + runtimeEntries(graph, runtime.rows, meta.key).length };
  });
}

/** The whole screen as JSON, for Duet (BR-1103): counts, the build entries and what is not counted yet. */
export function driftExport(graph: BridgeGraph, build: BuildDrift, runtime: RuntimeDrift) {
  const counts = driftCounts(build, runtime, graph);
  return {
    schema: 'bridge-drift/v1' as const,
    contract: graph.contentHash,
    runtime: runtime.state,
    lists: DRIFT_LISTS.map((meta, i) => ({
      n: meta.n,
      key: meta.key,
      title: meta.title,
      source: meta.source,
      heldBy: meta.heldBy,
      count: counts[i]!.count,
      entries: [
        ...((build as Partial<Record<DriftListKey, DriftEntry[]>>)[meta.key] ?? []),
        ...(runtime.state === 'ok' ? runtimeEntries(graph, runtime.rows, meta.key) : []),
      ].map(({ key, label, detail, page, file }) => ({ key, label, detail, page: page ?? null, file: file ?? null })),
    })),
    neverSeen: neverSeenCandidates(graph),
  };
}
