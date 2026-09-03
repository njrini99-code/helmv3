/**
 * Query explainer — brief §69.
 *
 * Turns the AGGREGATE shape of one safe query class into ordered hypotheses
 * about why it is slow, and — only when an operator explicitly asks — the
 * one bounded, non-destructive command they should run next.
 *
 * THREE PROPERTIES, AND TWO OF THEM ARE STRUCTURAL
 * -------------------------------------------------
 * 1. ON DEMAND. This file has NO IMPORTS AT ALL — no database client, no
 *    fetch, no transport of any kind. It cannot run anything against
 *    production even by mistake, because it has nothing to run it with.
 *    That is a property of the import graph rather than a promise in a
 *    comment, and `query-explainer.test.ts` asserts it by reading this
 *    file's own source. It returns a command STRING for a human to run.
 *    Keep it that way: adding one import is what would turn this from a
 *    structural guarantee back into a convention.
 *
 * 2. NON-DESTRUCTIVE. `EXPLAIN` alone plans a statement without executing
 *    it. `EXPLAIN ANALYZE` EXECUTES it — which for an `insert`/`update`/
 *    `delete` class writes rows, and against production is unacceptable for
 *    a read too (it re-runs the expensive statement on the box that is
 *    already struggling). So ANALYZE is emitted only for a READ class
 *    against a LOCAL stack, and every emitted command carries a
 *    `SET LOCAL statement_timeout` so the diagnostic cannot outlive its
 *    usefulness.
 *
 * 3. BOUNDED, AND NOTHING IS PERSISTED. At most `MAX_HYPOTHESES` hypotheses
 *    come back, and `persistsPlan` is `false` and always will be — the
 *    brief's anti-pattern list names "persisting full plans for every
 *    request" explicitly. A plan is a diagnostic an operator reads once, not
 *    a row in a table.
 *
 * THE INPUT IS A SAFE QUERY CLASS, AND ANYTHING ELSE IS REFUSED
 * --------------------------------------------------------------
 * A "safe query class" is the closed, bounded identifier the collector
 * computes inside SQL: a keyword plus at most one object name, e.g.
 * `select golf_rounds`. It is not SQL, and it cannot contain a filter value,
 * an email, or a UUID (brief §6). Anything that does not match that shape is
 * refused outright — no command, no hypotheses — and the rejected value is
 * never echoed into the output, because echoing it back would reintroduce
 * exactly the leak the refusal exists to prevent.
 *
 * Pure: no I/O, no clock, no server-only import.
 */

/** A keyword, then optionally one dotted/underscored object name. Nothing
 *  else: no quotes, no `*`, no `=`, no `@`, no hyphen (so a UUID cannot pass). */
const SAFE_QUERY_CLASS_PATTERN = /^[a-z]+(?: [a-z0-9_]+(?:\.[a-z0-9_]+)?)?$/;

const READ_KEYWORDS = new Set(['select', 'with']);

/** Bounded output — the brief's "bounded" requirement made concrete. */
export const MAX_HYPOTHESES = 5;

/** The bound placed on any command this module suggests. Matches the
 *  measured production `service_role` statement timeout so a diagnostic
 *  never outlives an ordinary request's budget. */
export const EXPLAIN_STATEMENT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Aggregate shape for one class over one window — the same fields
 *  `query-regression.ts` already computes. No percentiles exist here; see
 *  `layered-performance.ts` for why. */
export interface QueryShape {
  callsDelta: number | null;
  meanExecMsWindow: number | null;
  meanExecMsBaseline: number | null;
  maxExecMsObserved: number | null;
  rowsPerCall: number | null;
  rowsPerCallBaseline: number | null;
  sharedBlksHitDelta: number | null;
  sharedBlksReadDelta: number | null;
  tempBlksWrittenDelta: number | null;
}

export type ExplainRequest =
  | { requested: false }
  | { requested: true; environment: 'local' | 'production' };

export interface ExplainQueryInput {
  safeQueryClass: string;
  shape: QueryShape;
  /** Flags from `detectQueryRegression`. */
  regressionFlags: readonly string[];
  /** Absent by default. A command is emitted only on an explicit request. */
  explainRequest: ExplainRequest;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface QueryHypothesis {
  /** Stable low-cardinality id. */
  id: string;
  statement: string;
  /** What to do next — a command, a query, or another runbook. */
  nextStep: string;
}

export interface QueryGuidance {
  safeQueryClass: string;
  hypotheses: readonly QueryHypothesis[];
  /** `null` unless an operator explicitly requested one. */
  explainCommand: string | null;
  /** Always `true`: nothing this module suggests mutates data. */
  nonDestructive: true;
  /** Always `false`: no plan is stored, for any request. */
  persistsPlan: false;
  warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------------------

const CACHE_HIT_FLOOR = 0.9;
const ROWS_PER_CALL_GROWTH = 3;

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  const total = numerator + denominator;
  if (!Number.isFinite(total) || total <= 0) return null;
  return numerator / total;
}

function buildHypotheses(shape: QueryShape, flags: readonly string[]): QueryHypothesis[] {
  const out: QueryHypothesis[] = [];

  // Ordered by how often each one is the actual answer, most first — the
  // list is truncated, so the order is part of the contract.
  if (flags.includes('max_reaches_timeout')) {
    out.push({
      id: 'timeout_reached',
      statement: 'At least one execution of this class reached the statement timeout.',
      nextStep:
        'Separate waiting from working BEFORE looking at the plan: follow the 57014 runbook in docs/observability/SUPABASE_RUNBOOKS.md, which checks lock waits and blockers first. A statement that spent its budget blocked has nothing wrong with its plan.',
    });
  }

  const cacheHit = ratio(shape.sharedBlksHitDelta, shape.sharedBlksReadDelta);
  if (cacheHit !== null && cacheHit < CACHE_HIT_FLOOR) {
    out.push({
      id: 'low_cache_hit',
      statement: `Only ${Math.round(cacheHit * 100)}% of block accesses came from the buffer cache this window, so this class is reading from disk.`,
      nextStep:
        'Check whether an index that used to serve this class is gone, invalid or bloated, and whether the relation grew past what the cache holds. Confirm the index exists in the migration that defines the object before assuming a plan change.',
    });
  }

  if (shape.tempBlksWrittenDelta !== null && shape.tempBlksWrittenDelta > 0) {
    out.push({
      id: 'temp_spill',
      statement: `This class wrote ${shape.tempBlksWrittenDelta} temp blocks, so a sort or hash spilled to disk.`,
      nextStep:
        'Look for a sort or aggregate over more rows than it used to see. A missing index that would have supplied ordered input is the usual cause; raising work_mem treats the symptom.',
    });
  }

  if (
    shape.rowsPerCall !== null &&
    shape.rowsPerCallBaseline !== null &&
    shape.rowsPerCallBaseline > 0 &&
    shape.rowsPerCall >= shape.rowsPerCallBaseline * ROWS_PER_CALL_GROWTH
  ) {
    out.push({
      id: 'rows_per_call_grew',
      statement: `Rows returned per call rose from about ${Math.round(shape.rowsPerCallBaseline)} to about ${Math.round(shape.rowsPerCall)}.`,
      nextStep:
        'The statement is returning more data, not running a worse plan for the same data. Check whether a filter was dropped, a limit removed, or the underlying data simply grew.',
    });
  }

  const meanFlat =
    shape.meanExecMsWindow !== null &&
    shape.meanExecMsBaseline !== null &&
    shape.meanExecMsBaseline > 0 &&
    shape.meanExecMsWindow < shape.meanExecMsBaseline * 2;
  if (meanFlat && flags.includes('total_time_5x_expected')) {
    out.push({
      id: 'call_volume',
      statement: 'Total database time rose while per-call time held — this class is being CALLED more, not running slower.',
      nextStep:
        'Look for an N+1 introduced by a caller: the repair is at the call site, not in the query. Check the release that shipped alongside this window.',
    });
  }

  if (
    shape.meanExecMsWindow !== null &&
    shape.meanExecMsBaseline !== null &&
    shape.meanExecMsBaseline > 0 &&
    shape.meanExecMsWindow >= shape.meanExecMsBaseline * 3 &&
    !flags.includes('max_reaches_timeout')
  ) {
    out.push({
      id: 'mean_regressed',
      statement: `Mean execution time rose from about ${Math.round(shape.meanExecMsBaseline)}ms to about ${Math.round(shape.meanExecMsWindow)}ms.`,
      nextStep:
        'With rows per call flat, this is a plan change or contention rather than more work. Request an explain against a LOCAL stack seeded to a comparable size before touching production.',
    });
  }

  return out.slice(0, MAX_HYPOTHESES);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

function buildExplainCommand(safeQueryClass: string, request: ExplainRequest): { command: string | null; warnings: string[] } {
  if (!request.requested) {
    return {
      command: null,
      warnings: ['No explain was requested, so no command is offered. This module never runs anything on its own.'],
    };
  }

  const keyword = safeQueryClass.split(' ')[0] ?? '';
  const isRead = READ_KEYWORDS.has(keyword);
  const warnings: string[] = [];

  let analyze = false;
  if (!isRead) {
    warnings.push(
      `'${keyword}' is a mutating class, so ANALYZE is withheld in every environment — EXPLAIN ANALYZE executes the statement and would write rows.`,
    );
  } else if (request.environment === 'production') {
    warnings.push(
      'ANALYZE is withheld against production because EXPLAIN ANALYZE executes the statement, re-running an expensive query on the instance that is already under load. Reproduce on a local stack if you need real timings.',
    );
  } else {
    analyze = true;
  }

  const options = analyze ? 'ANALYZE, BUFFERS, FORMAT TEXT' : 'FORMAT TEXT';
  const command = [
    'BEGIN;',
    `SET LOCAL statement_timeout = '${EXPLAIN_STATEMENT_TIMEOUT_MS}ms';`,
    `EXPLAIN (${options}) <the statement for query class '${safeQueryClass}'>;`,
    'ROLLBACK;',
  ].join('\n');

  warnings.push(
    'Substitute the real statement yourself. This module holds only the safe query class, never the SQL text, so it cannot fill that in — and that is deliberate.',
  );

  return { command, warnings };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Pure. Never throws, never mutates its input, never runs anything, and
 * never echoes a rejected input value back into its output.
 */
export function explainQueryClass(input: ExplainQueryInput): QueryGuidance {
  if (!SAFE_QUERY_CLASS_PATTERN.test(input.safeQueryClass)) {
    return {
      // Deliberately NOT the caller's value: a rejected input may be raw SQL
      // carrying a filter value, an email or a UUID, and putting it in the
      // output would defeat the refusal.
      safeQueryClass: '(rejected)',
      hypotheses: [],
      explainCommand: null,
      nonDestructive: true,
      persistsPlan: false,
      warnings: [
        'Refused: the input is not a safe query class (a keyword plus at most one object name). Raw SQL, filter values, emails and UUIDs are never accepted here, and the rejected value is not repeated back.',
      ],
    };
  }

  const { command, warnings } = buildExplainCommand(input.safeQueryClass, input.explainRequest);

  return {
    safeQueryClass: input.safeQueryClass,
    hypotheses: buildHypotheses(input.shape, input.regressionFlags),
    explainCommand: command,
    nonDestructive: true,
    persistsPlan: false,
    warnings,
  };
}
