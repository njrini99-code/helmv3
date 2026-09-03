/**
 * Pure display-shaping helpers for the trace tree view.
 *
 * Kept out of `TraceTree.tsx` (a `'use client'` component) so they're testable
 * without React Testing Library. Also kept out of `trace-tree.ts` — but not
 * because that module is frozen: `trace-tree.ts` owns the containment MODEL
 * (folding flat rows into a tree, deciding what's missing/undeclared/observed)
 * and deliberately gained fields for this same track (`observedStepCount`,
 * `isUndeclared`, `isPointInTime`). What stays here is presentation math and
 * reconciliation over data the model already produced or the RPC already
 * returned — a distinct layer, not a frozen one.
 */

export const EM_DASH = '—';

/** Never a blank field — an absent value reads as the em dash, not a missing row. */
export function displayValue(value: unknown): string | number {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return value as string | number;
}

/**
 * Percentage width (0–100, rounded to one decimal) for a step's proportional
 * duration bar. Zero — an empty track, never a fabricated sliver — whenever
 * either input can't support a real ratio: no recorded duration for this
 * step, an invalid duration, or no positive total to measure it against.
 */
export function durationBarPercent(durationMs: number | null, totalMs: number): number {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 0;
  return Math.min(100, Math.round((durationMs / totalMs) * 1000) / 10);
}

/**
 * The reference scale for every step's duration bar, and for the KPI strip's
 * own "total duration" figure: the trace's own authoritative run duration
 * when it's known, else the sum of root-level (top-of-trace) step durations.
 * Root steps run sequentially (validation → auth → player → the RPC), so
 * their sum approximates the same wall-clock span without inventing a number
 * the trace never recorded.
 */
export function deriveTraceTotalMs(
  runDurationMs: number | null,
  rootDurationsMs: readonly (number | null)[],
): number {
  if (runDurationMs !== null && Number.isFinite(runDurationMs)) return runDurationMs;
  return rootDurationsMs.reduce((sum: number, ms) => sum + (ms ?? 0), 0);
}

/**
 * Overwrite a run's `observed_step_count` with the length of the steps array
 * actually fetched alongside it, leaving every other field untouched.
 *
 * WHY THIS EXISTS: the fleet-list RPC (`helm_debug_list_traces`) and the
 * detail RPC (`helm_debug_get_trace`) each carry their own idea of how many
 * steps a trace has — the list's is the DB's own stored counter (kept
 * accurate at write time by `helm_debug_record_trace_step` and, since
 * 2026-09-01, re-derived at finalize by `helm_debug_finalize_trace`), while
 * the tree view (`trace-tree.ts`'s `TraceTree.observedStepCount`) counts the
 * steps array it was actually handed. Those two can disagree for a trace
 * finalized before the 2026-09-01 migration, or one still in progress. Once a
 * trace is OPENED, its own steps array is the ground truth — it is the exact
 * rows the tree renders — so `bridgeGetFlightTrace` calls this to make the
 * opened trace's own number agree with what's on screen. This does not fix
 * the fleet list's un-opened rows, which still show the DB's stored counter;
 * that is a real, documented scope boundary (fixing it needs the list RPC to
 * expose the same reconciliation, which is a migration change).
 */
export function reconcileObservedStepCount<T extends { observed_step_count?: number | null } | null | undefined>(
  run: T,
  observedStepsLength: number,
): T {
  if (run === null || run === undefined) return run;
  return { ...run, observed_step_count: observedStepsLength };
}

/**
 * The trace's total duration, straight from the run row's own `duration_ms`.
 *
 * MUST NEVER be replaced by a sum of step durations: postgres-layer children
 * nest INSIDE their parent RPC's own recorded span (see trace-tree.ts's
 * containment model), so summing every step would double-count the time
 * spent inside `db.submit_round_atomic` once for the RPC and again for each
 * of its checkpoint children.
 */
export function resolveTotalDurationMs(
  run: { duration_ms?: number | null } | null | undefined,
): number | null {
  const ms = run?.duration_ms;
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

/**
 * `status_downgraded_from` / `status_downgraded_reason` — written into
 * `trace_runs.metadata` by `helm_debug_finalize_trace` (see
 * supabase/migrations/20260901140000_trace_cannot_claim_success_while_blind.sql,
 * lines 111-117) whenever it silently downgrades a caller-claimed 'success'
 * to 'warning' because the run was demonstrably blind. Read defensively: the
 * column is a jsonb blob with no schema, and most rows (anything finalized
 * before that migration, or never downgraded) will not carry it.
 */
export function extractStatusDowngrade(
  metadata: unknown,
): { from: string; reason: string } | null {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const from = record.status_downgraded_from;
  const reason = record.status_downgraded_reason;
  if (typeof from !== 'string' || typeof reason !== 'string') return null;
  return { from, reason };
}
