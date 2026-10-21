/**
 * The identity of one engine run for the support pass (Slice 1, flag
 * `coachhelm_support_v1`).
 *
 * Benjamini-Hochberg is computed over "every candidate this run tested", so
 * the pass needs exactly the insight ids this run's generators and composite
 * synthesis upserted. A time window cannot give that: two analyses of the same
 * player a few seconds apart (a post-round trigger and the sweep) overlap, and
 * the pass's own evidence write moves `updated_at`, which would pull its rows
 * into the next window.
 *
 * So the orchestrator opens a collector around the generators and the
 * composites, and `upsertInsightV3` records each id it wrote. A write the
 * philosophy gate held back is recorded with its in-memory evidence, and a
 * write `upsertInsight` refused is counted, so BH's m is the hypotheses the
 * run formed whichever gate the caller used (post-merge review, blocker 2). AsyncLocalStorage carries the collector through
 * the concurrent generator pool and nests freely inside `runWithGate`, which
 * uses its own store. Outside a collector, `recordRunInsightId` is a no-op, so
 * with the flag off nothing changes.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** A row the philosophy gate held back: enough to evaluate it, nothing to write. */
export interface GatedRunRow {
  signature: string;
  insight_type: string | null;
  evidence: unknown;
}

export interface RunInsightCollector {
  /** Run `fn` with this collector active; ids written inside are recorded. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Distinct ids recorded so far, in first-write order. */
  ids(): string[];
  /** Gated-out rows, one per signature (the last one recorded wins). */
  gated(): GatedRunRow[];
  /** Distinct signatures `upsertInsight` refused. */
  refused(): number;
}

interface CollectorStore {
  ids: Set<string>;
  gated: Map<string, GatedRunRow>;
  refused: Set<string>;
}

const collectorContext = new AsyncLocalStorage<CollectorStore>();

export function createRunInsightCollector(): RunInsightCollector {
  const store: CollectorStore = { ids: new Set(), gated: new Map(), refused: new Set() };
  return {
    run: (fn) => collectorContext.run(store, fn),
    ids: () => [...store.ids],
    gated: () => [...store.gated.values()],
    refused: () => store.refused.size,
  };
}

/** Called by `upsertInsightV3` after a row is written. No-op outside a collector. */
export function recordRunInsightId(id: string): void {
  collectorContext.getStore()?.ids.add(id);
}

/** Called by `upsertInsightV3` when the philosophy gate held a write back. No-op outside a collector. */
export function recordRunGatedOut(row: GatedRunRow): void {
  collectorContext.getStore()?.gated.set(row.signature, row);
}

/** Called by `upsertInsightV3` when `upsertInsight` refused a write. No-op outside a collector. */
export function recordRunRefused(signature: string): void {
  collectorContext.getStore()?.refused.add(signature);
}
