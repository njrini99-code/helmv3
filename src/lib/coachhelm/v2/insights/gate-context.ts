/**
 * Request-scoped philosophy gate for Tier-1 insight generators.
 *
 * Tier-1 generators (pressure-gap, putt-analytics, course-management,
 * tee-strategy, scrambling-analytics, approach-analytics, scoring-context)
 * call `upsertInsight` directly. They don't know — and shouldn't need to
 * know — which coach's philosophy they're running under. Prior to this,
 * `triggerPlayerInsightsAfterRound` had to walk the rows AFTER the
 * generators wrote them and archive the ones that didn't pass the coach's
 * alert sensitivity / type toggles. That's an extra DB roundtrip per
 * round, leaves churn in the audit trail, and was easy to forget for any
 * NEW Tier-1 caller added in the future.
 *
 * This module flips the model: the caller (e.g. `triggerPlayerInsightsAfterRound`)
 * wraps the generator invocation in `gateContext.run(gate, fn)`, and
 * `upsertInsight` reads the active gate on each call to decide whether to
 * write at all. No generator-signature changes required.
 *
 * Uses `node:async_hooks` AsyncLocalStorage, which is supported on Vercel
 * Functions (Node runtime). When no gate is active (every existing caller
 * that hasn't opted in), `getActiveGate()` returns `undefined` and the
 * behavior is unchanged from before this file existed.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface PhilosophyGate {
  /** Insights with computed confidence below this are skipped. */
  confidenceThreshold: number;
  /**
   * Coach's per-type alert toggle. Receives `insight_type ?? category`
   * exactly as upsertInsight resolves it.
   */
  isInsightTypeEnabled: (insightType: string) => boolean;
}

const gateContext = new AsyncLocalStorage<PhilosophyGate>();

/**
 * Run `fn` with `gate` active for the duration. Async work spawned inside
 * `fn` (Promise.all, awaited DB calls, etc.) inherits the gate. Calls to
 * `getActiveGate()` from anywhere inside the async tree see this gate.
 */
export function runWithGate<T>(gate: PhilosophyGate, fn: () => Promise<T>): Promise<T> {
  return gateContext.run(gate, fn);
}

/** Returns the active gate, or `undefined` if not inside a `runWithGate` scope. */
export function getActiveGate(): PhilosophyGate | undefined {
  return gateContext.getStore();
}
