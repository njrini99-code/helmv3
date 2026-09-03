/**
 * Layered performance — brief §73.
 *
 * Two layers measure two different things, and the whole value of putting
 * them side by side is being able to say WHICH ONE moved:
 *
 *   request layer   Sentry span percentiles. Real, sampled, per-request
 *                   latency as the user experienced it.
 *   database layer  pg_stat_statements deltas. Per-statement AGGREGATES
 *                   accumulated inside Postgres.
 *
 * "request p95 regressed AND the database regressed" and "the request is
 * slow while the database is stable" lead to completely different repairs.
 * Collapsing them into one "performance" number loses the only information
 * that tells an operator where to look.
 *
 * PG_STAT_STATEMENTS CANNOT PRODUCE A PERCENTILE, AND THIS MODULE SAYS SO
 * -----------------------------------------------------------------------
 * The view exposes `calls`, `total_exec_time`, `min_exec_time`,
 * `max_exec_time`, `mean_exec_time` and `stddev_exec_time`. There is no
 * distribution — only four moments of one. The tempting move is
 * `mean + 1.645 * stddev` and calling it a p95; that formula is only valid
 * for a normal distribution, and query latency is not remotely normal (it is
 * long-tailed, usually multi-modal: cache hit, cache miss, lock wait). A
 * "p95" derived that way is a fabricated number carrying a real number's
 * authority, which is worse than no number.
 *
 * So: the database half of this module's output has NO percentile-shaped
 * field at all, carries `percentilesAvailable: false` and a note saying why,
 * and the measured request p95 is labelled `measured_sentry_spans` on the
 * request half so nobody has to guess which of the two is real.
 * `layered-performance.test.ts` asserts the absence structurally rather than
 * trusting the comment.
 *
 * A MISSING LAYER IS ITS OWN VERDICT
 * -----------------------------------
 * If Sentry percentiles are unavailable, the answer is not "the database is
 * stable" — it is `request_unknown`, and the operator is told which half of
 * the picture they are missing. Same in the other direction. Unknown is
 * never zero and never healthy (brief §86).
 *
 * Pure: no I/O, no clock, no server-only import. It CONSUMES the regression
 * flags `query-regression.ts` already produces rather than recomputing
 * them, so there is one regression rule set, not two.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type PerfAxis = 'regressed' | 'stable' | 'improved' | 'unknown';

export type LayeredConclusion =
  | 'both_regressed'
  | 'request_regressed_db_stable'
  | 'db_regressed_request_stable'
  | 'both_stable'
  | 'request_unknown'
  | 'database_unknown'
  | 'both_unknown';

/** Exactly what pg_stat_statements offers per statement. Named so a reader
 *  can see at a glance that no quantile is in the list. */
export const DB_LAYER_STATISTICS_AVAILABLE = ['calls', 'total_exec_time', 'min', 'max', 'mean', 'stddev'] as const;

const DB_PERCENTILE_NOTE =
  'pg_stat_statements exposes only calls, total/min/max/mean/stddev exec time. It cannot produce a true p95, and deriving one from mean and stddev would assume a normal distribution that query latency does not have.';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Request-layer latency, SUPPLIED by the caller from Sentry span
 * percentiles. This module never computes it — it has no Sentry import and
 * no distribution to compute from.
 */
export interface RequestLatencyObservation {
  /** Measured p95 in ms for the window, or `null` when unavailable. */
  p95Ms: number | null;
  /** The comparison p95 (previous window, or the pre-release window). */
  baselineP95Ms: number | null;
  /** How many spans the percentile was computed over. A p95 over a handful
   *  of spans is noise wearing a statistic's name. */
  sampleCount: number | null;
  /** `false` when the percentile source could not be read at all. */
  readable: boolean;
}

/** One statement's window, as `query-regression.ts` already models it. */
export interface DbStatementObservation {
  /** The closed, bounded "safe query class" (a keyword plus at most one
   *  identifier) — never raw SQL, per brief §6. */
  safeQueryClass: string;
  /** `product` vs internal/collector workload, so a caller can split them. */
  sourceClass: string;
  meanExecMsWindow: number | null;
  meanExecMsBaseline: number | null;
  maxExecMsObserved: number | null;
  callsDelta: number | null;
  baselineStatus: 'collecting' | 'established';
  /** Flags from `detectQueryRegression`. */
  regressionFlags: readonly string[];
}

export interface DbLayerObservation {
  /** `false` when the statement delta store could not be read. */
  readable: boolean;
  statements: readonly DbStatementObservation[];
}

export interface LayeredPerformanceInput {
  request: RequestLatencyObservation;
  database: DbLayerObservation;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface RequestLayerVerdict {
  axis: PerfAxis;
  p95Ms: number | null;
  baselineP95Ms: number | null;
  /** Always `measured_sentry_spans` — this module refuses to synthesise a
   *  percentile, so the only percentile it can ever carry is a measured one. */
  p95Source: 'measured_sentry_spans';
  sampleCount: number | null;
  reason: string;
}

export interface DbLayerVerdict {
  axis: PerfAxis;
  /** Always `false`. Present as a field, not just a comment, so a consumer
   *  can render the limitation instead of inventing around it. */
  percentilesAvailable: false;
  percentileNote: string;
  statisticsAvailable: typeof DB_LAYER_STATISTICS_AVAILABLE;
  /** Safe query classes that carry a baseline-comparing regression flag. */
  regressedQueryClasses: readonly string[];
  /** Call-weighted mean exec ms this window / the same over baseline —
   *  a SHAPE comparison, explicitly not a percentile. */
  callWeightedMeanMs: number | null;
  callWeightedBaselineMeanMs: number | null;
  reason: string;
}

export interface LayeredPerformanceVerdict {
  request: RequestLayerVerdict;
  database: DbLayerVerdict;
  conclusion: LayeredConclusion;
  /** One sentence a surface can print verbatim. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Thresholds — judgement calls, named so they can be argued with
// ---------------------------------------------------------------------------

/** Below this many spans a p95 is noise; the axis reads `unknown`. */
export const MIN_REQUEST_SAMPLES = 200;
/** A p95 must be at least this multiple of baseline AND this many ms worse
 *  before it counts — a 30% jump on a 4ms endpoint is not an incident. */
export const REQUEST_REGRESSION_MULTIPLIER = 1.3;
export const REQUEST_REGRESSION_FLOOR_MS = 50;
export const REQUEST_IMPROVEMENT_MULTIPLIER = 0.7;
/** Call-weighted DB mean below this fraction of baseline reads `improved`. */
export const DB_IMPROVEMENT_MULTIPLIER = 0.7;

/**
 * Flags that are a COMPARISON against a baseline. `new_query` is excluded
 * deliberately: it is a fact about this window (a query id appeared), not a
 * statement that anything got slower, and treating it as a regression would
 * flag every deploy that adds a query.
 */
const BASELINE_COMPARING_FLAGS = new Set(['mean_3x_baseline', 'total_time_5x_expected', 'max_reaches_timeout']);

// ---------------------------------------------------------------------------
// Request layer
// ---------------------------------------------------------------------------

function evaluateRequestLayer(input: RequestLatencyObservation): RequestLayerVerdict {
  const base = {
    p95Ms: input.p95Ms,
    baselineP95Ms: input.baselineP95Ms,
    p95Source: 'measured_sentry_spans' as const,
    sampleCount: input.sampleCount,
  };

  if (!input.readable) {
    return { ...base, axis: 'unknown', reason: 'The request-latency percentile source could not be read.' };
  }
  if (input.p95Ms === null || !Number.isFinite(input.p95Ms)) {
    return { ...base, axis: 'unknown', reason: 'No measured request p95 was supplied for this window.' };
  }
  if (input.sampleCount === null || input.sampleCount < MIN_REQUEST_SAMPLES) {
    return {
      ...base,
      axis: 'unknown',
      reason: `Fewer than ${MIN_REQUEST_SAMPLES} spans in the window — a p95 over this few samples is not a usable statistic.`,
    };
  }
  if (input.baselineP95Ms === null || !Number.isFinite(input.baselineP95Ms) || input.baselineP95Ms <= 0) {
    return { ...base, axis: 'unknown', reason: 'No baseline p95 to compare against, so no direction can be stated.' };
  }

  if (
    input.p95Ms >= input.baselineP95Ms * REQUEST_REGRESSION_MULTIPLIER &&
    input.p95Ms - input.baselineP95Ms >= REQUEST_REGRESSION_FLOOR_MS
  ) {
    return {
      ...base,
      axis: 'regressed',
      reason: `Measured request p95 rose from ${Math.round(input.baselineP95Ms)}ms to ${Math.round(input.p95Ms)}ms.`,
    };
  }
  if (input.p95Ms <= input.baselineP95Ms * REQUEST_IMPROVEMENT_MULTIPLIER) {
    return {
      ...base,
      axis: 'improved',
      reason: `Measured request p95 fell from ${Math.round(input.baselineP95Ms)}ms to ${Math.round(input.p95Ms)}ms.`,
    };
  }
  return { ...base, axis: 'stable', reason: 'Measured request p95 is within the normal band around its baseline.' };
}

// ---------------------------------------------------------------------------
// Database layer
// ---------------------------------------------------------------------------

function callWeightedMean(
  statements: readonly DbStatementObservation[],
  pick: (s: DbStatementObservation) => number | null,
): number | null {
  let weighted = 0;
  let calls = 0;
  for (const s of statements) {
    const value = pick(s);
    const c = s.callsDelta;
    if (value === null || c === null || !Number.isFinite(value) || !Number.isFinite(c) || c <= 0) continue;
    weighted += value * c;
    calls += c;
  }
  return calls > 0 ? weighted / calls : null;
}

function evaluateDbLayer(input: DbLayerObservation): DbLayerVerdict {
  const shell = {
    percentilesAvailable: false as const,
    percentileNote: DB_PERCENTILE_NOTE,
    statisticsAvailable: DB_LAYER_STATISTICS_AVAILABLE,
  };

  if (!input.readable) {
    return {
      ...shell,
      axis: 'unknown',
      regressedQueryClasses: [],
      callWeightedMeanMs: null,
      callWeightedBaselineMeanMs: null,
      reason: 'The statement delta store could not be read this refresh.',
    };
  }
  if (input.statements.length === 0) {
    return {
      ...shell,
      axis: 'unknown',
      regressedQueryClasses: [],
      callWeightedMeanMs: null,
      callWeightedBaselineMeanMs: null,
      reason: 'No statement deltas were available for this window, so the database shape is unknown rather than stable.',
    };
  }

  const callWeightedMeanMs = callWeightedMean(input.statements, (s) => s.meanExecMsWindow);
  const callWeightedBaselineMeanMs = callWeightedMean(input.statements, (s) => s.meanExecMsBaseline);

  const regressedQueryClasses = input.statements
    .filter((s) => s.baselineStatus === 'established' && s.regressionFlags.some((f) => BASELINE_COMPARING_FLAGS.has(f)))
    .map((s) => s.safeQueryClass);

  if (regressedQueryClasses.length > 0) {
    return {
      ...shell,
      axis: 'regressed',
      regressedQueryClasses,
      callWeightedMeanMs,
      callWeightedBaselineMeanMs,
      reason: `${regressedQueryClasses.length} statement class(es) regressed against an established baseline.`,
    };
  }

  const anyEstablished = input.statements.some((s) => s.baselineStatus === 'established');
  if (!anyEstablished) {
    return {
      ...shell,
      axis: 'unknown',
      regressedQueryClasses: [],
      callWeightedMeanMs,
      callWeightedBaselineMeanMs,
      reason: 'Every statement baseline is still collecting, so "stable" cannot yet be claimed.',
    };
  }

  if (
    callWeightedMeanMs !== null &&
    callWeightedBaselineMeanMs !== null &&
    callWeightedBaselineMeanMs > 0 &&
    callWeightedMeanMs <= callWeightedBaselineMeanMs * DB_IMPROVEMENT_MULTIPLIER
  ) {
    return {
      ...shell,
      axis: 'improved',
      regressedQueryClasses: [],
      callWeightedMeanMs,
      callWeightedBaselineMeanMs,
      reason: 'Call-weighted mean execution time fell well below its baseline.',
    };
  }

  return {
    ...shell,
    axis: 'stable',
    regressedQueryClasses: [],
    callWeightedMeanMs,
    callWeightedBaselineMeanMs,
    reason: 'No statement class regressed against an established baseline this window.',
  };
}

// ---------------------------------------------------------------------------
// Fold
// ---------------------------------------------------------------------------

function concludeAxes(request: PerfAxis, database: PerfAxis): LayeredConclusion {
  if (request === 'unknown' && database === 'unknown') return 'both_unknown';
  if (request === 'unknown') return 'request_unknown';
  if (database === 'unknown') return 'database_unknown';

  const requestBad = request === 'regressed';
  const dbBad = database === 'regressed';
  if (requestBad && dbBad) return 'both_regressed';
  if (requestBad) return 'request_regressed_db_stable';
  if (dbBad) return 'db_regressed_request_stable';
  return 'both_stable';
}

const CONCLUSION_SUMMARY: Record<LayeredConclusion, string> = {
  both_regressed: 'Request latency and database execution both regressed — the database is at least part of the cause.',
  request_regressed_db_stable:
    'Request latency regressed while the database is stable — look above the database (serialization, network, cold starts, application work).',
  db_regressed_request_stable:
    'Database execution regressed while request latency held — the slowdown has not surfaced to users yet.',
  both_stable: 'Neither the request layer nor the database layer regressed this window.',
  request_unknown: 'The database layer is readable but the request layer is not — half the picture is missing.',
  database_unknown: 'The request layer is readable but the database layer is not — half the picture is missing.',
  both_unknown: 'Neither layer could be read this window. Nothing is known about performance.',
};

/**
 * Pure. Never throws, never mutates its input, and never returns a
 * percentile it did not receive.
 */
export function evaluateLayeredPerformance(input: LayeredPerformanceInput): LayeredPerformanceVerdict {
  const request = evaluateRequestLayer(input.request);
  const database = evaluateDbLayer(input.database);
  const conclusion = concludeAxes(request.axis, database.axis);
  return { request, database, conclusion, summary: CONCLUSION_SUMMARY[conclusion] };
}
