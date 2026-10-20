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
 * composites, and `upsertInsightV3` records each id it wrote (a philosophy-
 * gated write records nothing). AsyncLocalStorage carries the collector through
 * the concurrent generator pool and nests freely inside `runWithGate`, which
 * uses its own store. Outside a collector, `recordRunInsightId` is a no-op, so
 * with the flag off nothing changes.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RunInsightCollector {
  /** Run `fn` with this collector active; ids written inside are recorded. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Distinct ids recorded so far, in first-write order. */
  ids(): string[];
}

const collectorContext = new AsyncLocalStorage<Set<string>>();

export function createRunInsightCollector(): RunInsightCollector {
  const ids = new Set<string>();
  return {
    run: (fn) => collectorContext.run(ids, fn),
    ids: () => [...ids],
  };
}

/** Called by `upsertInsightV3` after a row is written. No-op outside a collector. */
export function recordRunInsightId(id: string): void {
  collectorContext.getStore()?.add(id);
}
