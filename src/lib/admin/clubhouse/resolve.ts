/**
 * Reading a signal against the graph of the release that sent it (plan §4.3).
 *
 * Every envelope resolves to its Bridge ID, and any way it disagrees with the contract becomes a drift kind. Drift is
 * recorded (`clubhouse_drift`, shown on B11), never raised as an error: it means the code and the contract have come
 * apart, and the contract is the thing to fix or the code is.
 */
import type { BridgeGraph, BridgeId, PageId } from './graph';
import { SHELL_PAGE } from './graph';
import type { ChSignal } from './signal';

export type DriftKind = 'unknown-code' | 'deprecated-fired' | 'reserved-fired' | 'wrong-page' | 'wrong-outcome' | 'silent-action';

export interface ResolvedSignal {
  bridgeId: BridgeId | null;
  /** The page that owns the ID (not always the page it fired on: the shell's IDs fire everywhere). */
  idPage: PageId | null;
  category: number | null;
  actionId: string | null;
  drift: DriftKind[];
}

/** An action may be named by its ACT- ID or, once E2 sends it, by its `useAction` name. */
export function actionIndex(graph: BridgeGraph): Map<string, string> {
  const index = new Map<string, string>();
  for (const [id, a] of Object.entries(graph.actions)) {
    index.set(id, id);
    if (a.useActionName) index.set(a.useActionName, id);
  }
  return index;
}

const borrowCache = new WeakMap<BridgeGraph, Map<string, Set<BridgeId>>>();
function mayFireOn(graph: BridgeGraph, page: string, id: BridgeId, idPage: PageId): boolean {
  if (idPage === page || idPage === SHELL_PAGE) return true;
  let byPage = borrowCache.get(graph);
  if (!byPage) {
    byPage = new Map(Object.entries(graph.pages).map(([p, g]) => [p, new Set(g.borrows)]));
    borrowCache.set(graph, byPage);
  }
  return byPage.get(page)?.has(id) ?? false;
}

const readyCache = new WeakMap<BridgeGraph, Map<string, BridgeId | null>>();

/**
 * The Bridge ID a view of this page counts under: the page's own "ready" row (category 1, named …_READY, as P003's
 * ROSTER_READY), the role's own where the page has one each (P002's COACH_HOME_READY and PLAYER_HOME_READY), else
 * its first category-1 row. Null for a page with no such row yet (P015, P017). A view carries no code of its own, so
 * the browser never needs the graph. A page with one ready row per screen (P009, P011) counts every view under its
 * first one until the views send their screen.
 */
export function viewIdFor(graph: BridgeGraph, page: string, role?: string): BridgeId | null {
  let byPage = readyCache.get(graph);
  if (!byPage) {
    byPage = new Map();
    readyCache.set(graph, byPage);
  }
  const key = `${page}|${role ?? ''}`;
  if (byPage.has(key)) return byPage.get(key) ?? null;
  const rows = Object.entries(graph.ids)
    .filter(([, r]) => r.page === page && r.category === 1 && r.status !== 'deprecated')
    .map(([id, r]) => ({ id: Number(id), name: r.name }))
    .sort((a, b) => a.id - b.id);
  const ready = rows.filter((r) => /_READY$/.test(r.name));
  const own = role ? ready.find((r) => r.name.startsWith(`${role.toUpperCase()}_`)) : undefined;
  const id = (own ?? ready[0] ?? rows[0])?.id ?? null;
  byPage.set(key, id);
  return id;
}

/** The shell's generic outcome codes, which name the action's own outcome row once the action is known. */
const GENERIC_OUTCOME: Record<string, { outcome: 'success' | 'failure' }> = {
  'CH-1702': { outcome: 'success' },
  'CH-1703': { outcome: 'failure' },
};

export function resolveSignal(s: ChSignal, graph: BridgeGraph, actions: Map<string, string> = actionIndex(graph)): ResolvedSignal {
  const drift: DriftKind[] = [];
  let bridgeId: BridgeId | null = null;
  const actionId = s.act ? (actions.get(s.act) ?? null) : null;

  // An envelope that leaves its code to the server: a view counts under its page's ready row; an action's start and a
  // tap have no Bridge ID of their own (the start pairs with its outcome; a tap is its control).
  if (s.code === undefined) {
    if (s.kind === 'view') {
      if (!graph.pages[s.page as PageId]) return { bridgeId: null, idPage: null, category: null, actionId, drift: ['wrong-page'] };
      const id = viewIdFor(graph, s.page, s.role);
      const rec = id === null ? undefined : graph.ids[id];
      if (id === null || !rec) return { bridgeId: null, idPage: null, category: null, actionId, drift };
      return { bridgeId: id, idPage: rec.page, category: rec.category, actionId, drift };
    }
    return { bridgeId: null, idPage: null, category: null, actionId, drift };
  }

  if (/^\d+$/.test(s.code)) {
    const id = Number(s.code);
    if (graph.ids[id]) bridgeId = id;
    else if (graph.tombstones[id]) {
      drift.push('deprecated-fired');
      return { bridgeId: id, idPage: null, category: null, actionId, drift };
    }
  } else {
    bridgeId = graph.chIndex[s.code] ?? null;
  }

  if (bridgeId === null) return { bridgeId: null, idPage: null, category: null, actionId, drift: ['unknown-code'] };

  // A save's generic outcome (CH-1702 landed, CH-1703 failed) names the action's own row when its map lists one, so
  // the Bridge counts "Remove from roster failed", not "a save failed".
  const action = actionId ? graph.actions[actionId] : undefined;
  const generic = GENERIC_OUTCOME[s.code];
  if (s.kind === 'action' && action && generic && s.outcome === generic.outcome) {
    const own = action.outcomes[generic.outcome];
    if (own !== undefined && graph.ids[own]) bridgeId = own;
  }

  const rec = graph.ids[bridgeId];
  // A chIndex entry with no ID behind it is a broken graph; read it as an unknown code rather than throw on ingest.
  if (!rec) return { bridgeId: null, idPage: null, category: null, actionId, drift: ['unknown-code'] };
  if (rec.status === 'deprecated') drift.push('deprecated-fired');
  if (rec.status === 'reserved') drift.push('reserved-fired');
  if (!graph.pages[s.page as PageId] || !mayFireOn(graph, s.page, bridgeId, rec.page)) drift.push('wrong-page');

  // An action that ended (any outcome but its start) must end on one of the outcomes its action-map row lists. The
  // shell's own outcomes (offline, slow save, stopped waiting) come from useAction itself, so every action has them.
  if (s.kind === 'action' && s.outcome && s.outcome !== 'start' && action) {
    if (!Object.values(action.outcomes).includes(bridgeId) && rec.page !== SHELL_PAGE) drift.push('wrong-outcome');
  }

  return { bridgeId, idPage: rec.page, category: rec.category, actionId, drift };
}

/** How long an action may run before a start with no outcome counts as silent (plan §4.3). */
export const SILENT_AFTER_MS = 30_000;

/**
 * The outcomes that end a started action. useAction sends `offline` and `busy` instead of a start (the tap never
 * started anything), and `stopped-waiting` while the action is still running (its success or failure follows), so
 * none of those three closes a start.
 */
export const ENDS_A_START: ReadonlySet<string> = new Set(['success', 'failure', 'cancelled']);

/**
 * The starts in one session that never got an outcome: no outcome within 30 s and the page not hidden in that time.
 * Starts and outcomes pair up per action (its `act`, else its control, else its code), oldest first.
 */
export function silentActions(session: ChSignal[], opts: { now: number; pagehideAt?: number }): ChSignal[] {
  const key = (s: ChSignal) => s.act ?? s.control ?? s.code ?? '';
  const open = new Map<string, ChSignal[]>();
  const silent: ChSignal[] = [];
  const closeLate = (start: ChSignal, at: number) => {
    if (at - start.at >= SILENT_AFTER_MS) silent.push(start);
  };
  for (const s of [...session].filter((x) => x.kind === 'action').sort((a, b) => a.seq - b.seq)) {
    const k = key(s);
    if (s.outcome === 'start') {
      open.set(k, [...(open.get(k) ?? []), s]);
      continue;
    }
    if (!s.outcome || !ENDS_A_START.has(s.outcome)) continue;
    const queue = open.get(k);
    const start = queue?.shift();
    if (start) closeLate(start, s.at);
  }
  for (const queue of open.values()) {
    for (const start of queue) {
      const hidden = opts.pagehideAt !== undefined && opts.pagehideAt >= start.at && opts.pagehideAt - start.at < SILENT_AFTER_MS;
      if (!hidden && opts.now - start.at >= SILENT_AFTER_MS) silent.push(start);
    }
  }
  return silent.sort((a, b) => a.seq - b.seq);
}

export interface DriftCount {
  kind: DriftKind;
  code: string;
  release: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/** Drift rows as `clubhouse_drift` keeps them: one per kind × code × release. */
export function countDrift(items: { signal: ChSignal; drift: DriftKind[] }[]): DriftCount[] {
  const rows = new Map<string, DriftCount>();
  for (const { signal, drift } of items) {
    for (const kind of drift) {
      const code = signal.code ?? '';
      const k = `${kind}|${code}|${signal.release}`;
      const row = rows.get(k);
      if (row) {
        row.count += 1;
        row.firstSeen = Math.min(row.firstSeen, signal.at);
        row.lastSeen = Math.max(row.lastSeen, signal.at);
      } else rows.set(k, { kind, code, release: signal.release, count: 1, firstSeen: signal.at, lastSeen: signal.at });
    }
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code));
}
