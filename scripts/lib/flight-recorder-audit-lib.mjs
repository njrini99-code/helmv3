/**
 * ============================================================================
 * Flight Recorder audit — pure summarization (no I/O)
 * ----------------------------------------------------------------------------
 * Behind `npm run flight-recorder:audit` (scripts/flight-recorder-audit.mjs).
 * These functions take already-fetched run/step data — from the two
 * `helm_debug_list_traces` / `helm_debug_get_trace` RPCs, the only reachable
 * path for a service-role key (helm_debug is not in PostgREST's exposed
 * schema list, so an ordinary supabase-js `.from(...)` call cannot reach it
 * under any key) — and compute the figures an operator needs to know the two
 * in-flight Flight Recorder branches (real-timings, db-checkpoints) actually
 * shipped real data after deploy:
 *
 *   1. runs and steps in the last 24h
 *   2. distinct step keys observed
 *   3. steps carrying identity (function_name or table_name)
 *   4. runs with zero steps recorded
 *   5. runs whose claimed status was silently downgraded
 *
 * Kept dependency-free and I/O-free on purpose: the network calls belong in
 * the script, the arithmetic belongs here, and only the arithmetic is worth
 * testing without a live database.
 */

/**
 * Keep only runs whose `started_at` falls at or after `windowStartMs`. A run
 * with no `started_at` at all is dropped rather than crashing the sort — a
 * malformed row from a store this script does not control should not corrupt
 * everything downstream of it.
 */
export function filterRunsInWindow(runs, windowStartMs) {
  return runs.filter((run) => {
    if (!run?.started_at) return false;
    const ms = new Date(run.started_at).getTime();
    return Number.isFinite(ms) && ms >= windowStartMs;
  });
}

/** Count of distinct non-empty `step_key` values across every step row given. */
export function countDistinctStepKeys(steps) {
  const keys = new Set();
  for (const step of steps) {
    if (typeof step?.step_key === 'string' && step.step_key.length > 0) keys.add(step.step_key);
  }
  return keys.size;
}

/**
 * Steps that carry SOME identity — a `function_name` or `table_name` — the
 * fact production's trace store had ZERO of, across every recorded step, as
 * of the established facts this track started from. This is the number that
 * proves the db-checkpoints migration's writes are actually landing.
 */
export function countStepsWithIdentity(steps) {
  return steps.filter((step) => Boolean(step?.function_name) || Boolean(step?.table_name)).length;
}

/**
 * Trace ids for runs that recorded no steps at all — a run absent from
 * `stepCountByTraceId` counts as zero, not as "unknown", since the caller is
 * expected to have looked every windowed run up.
 */
export function findZeroStepRuns(runs, stepCountByTraceId) {
  return runs
    .filter((run) => (stepCountByTraceId.get(run.trace_id) ?? 0) === 0)
    .map((run) => run.trace_id);
}

/**
 * Trace ids whose run row carries `status_downgraded_from` in its metadata —
 * written by `helm_debug_finalize_trace` (see
 * supabase/migrations/20260901140000_trace_cannot_claim_success_while_blind.sql)
 * when it silently downgrades a caller-claimed 'success' to 'warning' because
 * the run was demonstrably blind. `rows` is `{ trace_id, metadata }[]`;
 * malformed or absent metadata is treated as "not downgraded", never thrown on.
 */
export function findDowngradedRuns(rows) {
  return rows
    .filter((row) => {
      const metadata = row?.metadata;
      return (
        metadata !== null &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        typeof metadata.status_downgraded_from === 'string'
      );
    })
    .map((row) => row.trace_id);
}

/**
 * True when the RPC's own hard cap (`helm_debug_list_traces` limits to 200
 * server-side, with no offset/cursor to page past it) may have truncated the
 * true 24h population: the RPC returned exactly `limit` rows (nothing left
 * unfetched by choice) AND the OLDEST of those rows — the last one in the
 * desc-by-started_at order the RPC returns — is still inside the window. If
 * the 200th-newest row is still within the last 24h, there is no way to know
 * whether a 201st row, older still but also within the window, exists.
 *
 * False (not "unknown", not silently true) whenever the cap was not actually
 * hit, or the oldest fetched row already falls outside the window — both mean
 * every run in the window was actually returned.
 */
export function coverageNotGuaranteed(runsFromRpc, limit, windowStartMs) {
  if (runsFromRpc.length < limit) return false;
  const oldest = runsFromRpc[runsFromRpc.length - 1];
  if (!oldest?.started_at) return false;
  const ms = new Date(oldest.started_at).getTime();
  return Number.isFinite(ms) && ms >= windowStartMs;
}

/**
 * Assemble the five required audit figures.
 *
 * @param {object} input
 * @param {Array<{trace_id: string, started_at: string | null}>} input.runsFromRpc
 *   The raw rows `helm_debug_list_traces` returned, ordered desc by started_at,
 *   BEFORE windowing — needed as-is (not pre-filtered) for `coverageNotGuaranteed`.
 * @param {number} input.limit — the `p_limit` the RPC was called with.
 * @param {number} input.windowHours — audit window size, e.g. 24.
 * @param {number} input.nowMs — caller-supplied "now", so this stays pure and testable.
 * @param {Map<string, {run: {metadata?: unknown}, steps: Array<Record<string, unknown>>}>} input.detailsByTraceId
 *   One `helm_debug_get_trace` result per run actually inside the window.
 */
export function summarizeFlightRecorderAudit({ runsFromRpc, limit, windowHours, nowMs, detailsByTraceId }) {
  const windowStartMs = nowMs - windowHours * 3600_000;
  const runsInWindow = filterRunsInWindow(runsFromRpc, windowStartMs);

  const allSteps = [];
  const stepCountByTraceId = new Map();
  const metadataRows = [];

  for (const run of runsInWindow) {
    const detail = detailsByTraceId.get(run.trace_id);
    const steps = Array.isArray(detail?.steps) ? detail.steps : [];
    stepCountByTraceId.set(run.trace_id, steps.length);
    allSteps.push(...steps);
    metadataRows.push({ trace_id: run.trace_id, metadata: detail?.run?.metadata });
  }

  return {
    runsInWindowCount: runsInWindow.length,
    stepsInWindowCount: allSteps.length,
    distinctStepKeyCount: countDistinctStepKeys(allSteps),
    stepsWithIdentityCount: countStepsWithIdentity(allSteps),
    zeroStepRunTraceIds: findZeroStepRuns(runsInWindow, stepCountByTraceId),
    downgradedRunTraceIds: findDowngradedRuns(metadataRows),
    coverageNotGuaranteed: coverageNotGuaranteed(runsFromRpc, limit, windowStartMs),
  };
}
