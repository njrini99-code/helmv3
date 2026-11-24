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

export function resolveSignal(s: ChSignal, graph: BridgeGraph, actions: Map<string, string> = actionIndex(graph)): ResolvedSignal {
  const drift: DriftKind[] = [];
  let bridgeId: BridgeId | null = null;

  if (/^\d+$/.test(s.code)) {
    const id = Number(s.code);
    if (graph.ids[id]) bridgeId = id;
    else if (graph.tombstones[id]) {
      drift.push('deprecated-fired');
      return { bridgeId: id, idPage: null, category: null, actionId: actions.get(s.act ?? '') ?? null, drift };
    }
  } else {
    bridgeId = graph.chIndex[s.code] ?? null;
  }

  const actionId = s.act ? (actions.get(s.act) ?? null) : null;
  if (bridgeId === null) return { bridgeId: null, idPage: null, category: null, actionId, drift: ['unknown-code'] };

  const rec = graph.ids[bridgeId];
  // A chIndex entry with no ID behind it is a broken graph; read it as an unknown code rather than throw on ingest.
  if (!rec) return { bridgeId: null, idPage: null, category: null, actionId, drift: ['unknown-code'] };
  if (rec.status === 'deprecated') drift.push('deprecated-fired');
  if (rec.status === 'reserved') drift.push('reserved-fired');
  if (!graph.pages[s.page as PageId] || !mayFireOn(graph, s.page, bridgeId, rec.page)) drift.push('wrong-page');

  // An action that ended (any outcome but its start) must end on one of the outcomes its action-map row lists. The
  // shell's own outcomes (offline, slow save, stopped waiting) come from useAction itself, so every action has them.
  const action = actionId ? graph.actions[actionId] : undefined;
  if (s.kind === 'action' && s.outcome && s.outcome !== 'start' && action) {
    if (!Object.values(action.outcomes).includes(bridgeId) && rec.page !== SHELL_PAGE) drift.push('wrong-outcome');
  }

  return { bridgeId, idPage: rec.page, category: rec.category, actionId, drift };
}

/** How long an action may run before a start with no outcome counts as silent (plan §4.3). */
export const SILENT_AFTER_MS = 30_000;

/**
 * The starts in one session that never got an outcome: no outcome within 30 s and the page not hidden in that time.
 * Starts and outcomes pair up per action (its `act`, else its control, else its code), oldest first.
 */
export function silentActions(session: ChSignal[], opts: { now: number; pagehideAt?: number }): ChSignal[] {
  const key = (s: ChSignal) => s.act ?? s.control ?? s.code;
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
      const k = `${kind}|${signal.code}|${signal.release}`;
      const row = rows.get(k);
      if (row) {
        row.count += 1;
        row.firstSeen = Math.min(row.firstSeen, signal.at);
        row.lastSeen = Math.max(row.lastSeen, signal.at);
      } else rows.set(k, { kind, code: signal.code, release: signal.release, count: 1, firstSeen: signal.at, lastSeen: signal.at });
    }
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code));
}
