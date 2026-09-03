/**
 * pg_stat_statements delta computation + baseline update + regression
 * detection — brief §16–17. Pure functions, no I/O, tested against
 * fixtures (`query-regression.test.ts`) rather than pgTAP, for the same
 * reason `db-health-delta.ts` is pure — see that file's header.
 *
 * SCOPE AND JUDGMENT CALLS, STATED PLAINLY
 * --------------------------------------------
 * The brief lists six regression shapes (§17). Five are implemented here;
 * the sixth needs data this module does not have:
 *
 *   mean 3x baseline                    IMPLEMENTED (`mean_3x_baseline`)
 *   max reaching app timeout            IMPLEMENTED (`max_reaches_timeout`)
 *   same calls but 5x DB time           IMPLEMENTED (`total_time_5x_expected`)
 *   rows/call explodes after release    IMPLEMENTED (`rows_per_call_explosion`)
 *   new queryid enters top DB-time list IMPLEMENTED (`new_query`)
 *   same journey now 4x DB calls        NOT IMPLEMENTED — needs a per-journey
 *                                        DB-call-count baseline, a different
 *                                        data source than a single query's
 *                                        pg_stat_statements row; belongs with
 *                                        the Trace Explorer work (brief §56+).
 *
 * The brief does not name exact multipliers for "5x DB time" vs "rows/call
 * explodes" as separate numbers, or a minimum sample count before a
 * baseline is trustworthy. This file picks: 5x for both (brief already
 * uses 3x/5x as its own vocabulary elsewhere in §17, so 5x for the two
 * unspecified cases stays consistent rather than inventing a third
 * multiplier), and `BASELINE_MIN_SAMPLES = 5` non-empty windows before
 * `baselineStatus` flips from `'collecting'` to `'established'` — brief
 * §49-55's "baseline_status = collecting until meaningful" names the STATE
 * but not the threshold. Both are judgment calls, not measured facts;
 * `baselineStatus` is always stored alongside every regression flag so a
 * reader can see how much history backed the call.
 */

export const BASELINE_MIN_SAMPLES = 5;
/** Service role's measured statement_timeout in production, 2026-09-03 —
 *  see docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §2.
 *  Collectors run as service_role; product queries mostly run as
 *  anon/authenticated (8s) or through PostgREST — callers with a different
 *  timeout context should pass their own `statementTimeoutMs`. */
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

export type BaselineStatus = 'collecting' | 'established';

export interface StatCurrentRow {
  queryid: string;
  calls: number;
  totalExecMs: number;
  maxExecMs: number;
  rows: number;
  sharedBlksHit: number;
  sharedBlksRead: number;
  tempBlksRead: number;
  tempBlksWritten: number;
  walBytes: number;
  safeQueryClass: string;
  sourceClass: string;
}

export interface StatPriorRow {
  statsResetAt: string | null;
  calls: number;
  totalExecMs: number;
  rows: number;
  sharedBlksHit: number;
  sharedBlksRead: number;
  tempBlksRead: number;
  tempBlksWritten: number;
  walBytes: number;
  meanExecMsBaseline: number | null;
  maxExecMsBaseline: number | null;
  rowsPerCallBaseline: number | null;
  sampleCount: number;
  baselineStatus: BaselineStatus;
}

export interface StatDeltaComputation {
  isNewQuery: boolean;
  resetDetected: boolean;
  callsDelta: number | null;
  totalExecMsDelta: number | null;
  meanExecMsWindow: number | null;
  maxExecMsObserved: number;
  rowsDelta: number | null;
  walBytesDelta: number | null;
  sharedBlksHitDelta: number | null;
  sharedBlksReadDelta: number | null;
  tempBlksReadDelta: number | null;
  tempBlksWrittenDelta: number | null;
}

/**
 * `currentStatsResetAt` is passed separately (not read off `prior`) because
 * it comes from `pg_stat_statements_info` at COLLECTION time, the same
 * value every row in one window shares — the caller reads it once per
 * collector run, not once per row.
 */
export function computeStatDelta(
  current: StatCurrentRow,
  prior: StatPriorRow | null,
  currentStatsResetAt: string | null,
): StatDeltaComputation {
  const nullResult = (isNewQuery: boolean, resetDetected: boolean): StatDeltaComputation => ({
    isNewQuery,
    resetDetected,
    callsDelta: null,
    totalExecMsDelta: null,
    meanExecMsWindow: null,
    maxExecMsObserved: current.maxExecMs,
    rowsDelta: null,
    walBytesDelta: null,
    sharedBlksHitDelta: null,
    sharedBlksReadDelta: null,
    tempBlksReadDelta: null,
    tempBlksWrittenDelta: null,
  });

  if (!prior) return nullResult(true, false);

  const resetByTimestamp =
    prior.statsResetAt !== null && currentStatsResetAt !== null && prior.statsResetAt !== currentStatsResetAt;

  const callsDelta = current.calls - prior.calls;
  const totalExecMsDelta = current.totalExecMs - prior.totalExecMs;
  const rowsDelta = current.rows - prior.rows;
  const walBytesDelta = current.walBytes - prior.walBytes;
  const sharedBlksHitDelta = current.sharedBlksHit - prior.sharedBlksHit;
  const sharedBlksReadDelta = current.sharedBlksRead - prior.sharedBlksRead;
  const tempBlksReadDelta = current.tempBlksRead - prior.tempBlksRead;
  const tempBlksWrittenDelta = current.tempBlksWritten - prior.tempBlksWritten;

  const resetByNegativeCounter =
    callsDelta < 0 ||
    totalExecMsDelta < 0 ||
    rowsDelta < 0 ||
    walBytesDelta < 0 ||
    sharedBlksHitDelta < 0 ||
    sharedBlksReadDelta < 0 ||
    tempBlksReadDelta < 0 ||
    tempBlksWrittenDelta < 0;

  if (resetByTimestamp || resetByNegativeCounter) return nullResult(false, true);

  return {
    isNewQuery: false,
    resetDetected: false,
    callsDelta,
    totalExecMsDelta,
    meanExecMsWindow: callsDelta > 0 ? totalExecMsDelta / callsDelta : null,
    maxExecMsObserved: current.maxExecMs,
    rowsDelta,
    walBytesDelta,
    sharedBlksHitDelta,
    sharedBlksReadDelta,
    tempBlksReadDelta,
    tempBlksWrittenDelta,
  };
}

export interface BaselineUpdate {
  meanExecMsBaseline: number | null;
  maxExecMsBaseline: number | null;
  rowsPerCallBaseline: number | null;
  sampleCount: number;
  baselineStatus: BaselineStatus;
}

/**
 * A simple exponential moving average (0.7 prior / 0.3 new), not a full
 * distribution — pg_stat_statements itself only gives min/max/mean/stddev,
 * never real p95/p99 (brief §17); a baseline here is deliberately as simple
 * as the brief says a baseline can honestly be. Only updates on a window
 * with actual calls (`callsDelta > 0`) — a silent query teaches nothing
 * about its own typical behavior under load, so it neither shifts the mean
 * nor consumes a sample toward `BASELINE_MIN_SAMPLES`.
 */
export function updateStatBaseline(prior: StatPriorRow | null, delta: StatDeltaComputation): BaselineUpdate {
  const startFresh: BaselineUpdate = {
    meanExecMsBaseline: delta.meanExecMsWindow,
    maxExecMsBaseline: delta.maxExecMsObserved,
    rowsPerCallBaseline:
      delta.callsDelta && delta.callsDelta > 0 && delta.rowsDelta !== null ? delta.rowsDelta / delta.callsDelta : null,
    sampleCount: delta.callsDelta && delta.callsDelta > 0 ? 1 : 0,
    baselineStatus: 'collecting',
  };

  if (!prior || delta.isNewQuery || delta.resetDetected) return startFresh;

  if (delta.callsDelta === null || delta.callsDelta <= 0) {
    // No new calls this window — carry the existing baseline forward unchanged.
    return {
      meanExecMsBaseline: prior.meanExecMsBaseline,
      maxExecMsBaseline: prior.maxExecMsBaseline,
      rowsPerCallBaseline: prior.rowsPerCallBaseline,
      sampleCount: prior.sampleCount,
      baselineStatus: prior.sampleCount >= BASELINE_MIN_SAMPLES ? 'established' : 'collecting',
    };
  }

  const windowMean = delta.meanExecMsWindow ?? 0;
  const meanExecMsBaseline = prior.meanExecMsBaseline === null ? windowMean : prior.meanExecMsBaseline * 0.7 + windowMean * 0.3;

  const windowRowsPerCall = delta.rowsDelta !== null ? delta.rowsDelta / delta.callsDelta : null;
  const rowsPerCallBaseline =
    windowRowsPerCall === null
      ? prior.rowsPerCallBaseline
      : prior.rowsPerCallBaseline === null
        ? windowRowsPerCall
        : prior.rowsPerCallBaseline * 0.7 + windowRowsPerCall * 0.3;

  const sampleCount = prior.sampleCount + 1;

  return {
    meanExecMsBaseline,
    // Cumulative-since-reset max only grows within one reset epoch — take
    // the observed value directly rather than EMA-ing it.
    maxExecMsBaseline: delta.maxExecMsObserved,
    rowsPerCallBaseline,
    sampleCount,
    baselineStatus: sampleCount >= BASELINE_MIN_SAMPLES ? 'established' : 'collecting',
  };
}

export interface RegressionOptions {
  statementTimeoutMs?: number;
}

/**
 * Regression flags for one window. Returns `[]` whenever the baseline is
 * not yet `'established'` (brief: never alert on a baseline still
 * `collecting`) — the one exception is `new_query`, which is a fact about
 * this window regardless of baseline maturity, not a comparison against one.
 */
export function detectQueryRegression(
  delta: StatDeltaComputation,
  baseline: BaselineUpdate,
  options: RegressionOptions = {},
): string[] {
  const flags: string[] = [];
  if (delta.isNewQuery) flags.push('new_query');
  if (delta.resetDetected) return flags; // nothing comparable this window

  if (baseline.baselineStatus !== 'established') return flags;

  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;

  if (
    delta.meanExecMsWindow !== null &&
    baseline.meanExecMsBaseline !== null &&
    baseline.meanExecMsBaseline > 0 &&
    delta.meanExecMsWindow >= baseline.meanExecMsBaseline * 3
  ) {
    flags.push('mean_3x_baseline');
  }

  if (delta.maxExecMsObserved >= timeoutMs) {
    flags.push('max_reaches_timeout');
  }

  if (
    delta.callsDelta !== null &&
    delta.callsDelta > 0 &&
    delta.totalExecMsDelta !== null &&
    baseline.meanExecMsBaseline !== null &&
    baseline.meanExecMsBaseline > 0
  ) {
    const expected = baseline.meanExecMsBaseline * delta.callsDelta;
    if (expected > 0 && delta.totalExecMsDelta >= expected * 5) {
      flags.push('total_time_5x_expected');
    }
  }

  if (
    delta.callsDelta !== null &&
    delta.callsDelta > 0 &&
    delta.rowsDelta !== null &&
    baseline.rowsPerCallBaseline !== null &&
    baseline.rowsPerCallBaseline > 0
  ) {
    const rowsPerCall = delta.rowsDelta / delta.callsDelta;
    if (rowsPerCall >= baseline.rowsPerCallBaseline * 5) {
      flags.push('rows_per_call_explosion');
    }
  }

  return flags;
}
