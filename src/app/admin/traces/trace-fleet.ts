import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';

/**
 * What the whole recorded fleet says, as opposed to what one trace says.
 *
 * The Flight Recorder rendered 50 rows and no aggregate, so the shape of the
 * data was invisible: measured against production on 2026-09-01, 47 of the 50
 * most recent traces recorded 2 of 8 declared steps, and 40 of those carry
 * `status = 'success'`. Row by row that reads as forty successes with a small
 * amber badge. In aggregate it is the single most important thing the tab
 * knows.
 *
 * THE FRAMING MATTERS AS MUCH AS THE COUNT. A short trace is NOT a failed
 * one. `TracesClient` already says why in operator-facing copy: only call
 * sites wired to the recorder produce observed steps, so a tree that is mostly
 * MISSING means those steps have no instrumentation yet, not that anything
 * broke. This module therefore counts INSTRUMENTATION COVERAGE and OUTCOME as
 * two independent axes and never adds them together — a "47 problems" headline
 * would be false, and the sort of false that makes an operator stop reading
 * the board.
 */
export interface TraceFleetSummary {
  total: number;
  /** Runs whose declared-required steps were all observed. */
  complete: number;
  /** Runs missing at least one declared-required step. */
  short: number;
  /** Runs that failed outright, regardless of coverage. */
  failed: number;
  /** Runs the store flagged `warning`, and that did not fail. */
  warning: number;
  /**
   * The modal number of missing required steps among short runs, with how
   * many runs share it. A single dominant value means one uninstrumented
   * region of the pipeline rather than scattered gaps — which is the
   * difference between "wire up one call site" and "audit everything".
   */
  dominantGap: { missing: number; runs: number } | null;
  /** Distinct workflows present, so a mixed fleet is never read as one. */
  workflows: string[];
}

export function summarizeTraceFleet(traces: readonly FlightTraceRun[]): TraceFleetSummary {
  const gapCounts = new Map<number, number>();
  const workflows = new Set<string>();
  let complete = 0;
  let short = 0;
  let failed = 0;
  let warning = 0;

  for (const run of traces) {
    if (run.workflow) workflows.add(run.workflow);

    // Coverage axis. `missing_required_step_count` is the store's own number;
    // this module does not re-derive it from observed/expected, which count
    // ALL steps (required and conditional) and would disagree.
    const missing = run.missing_required_step_count;
    if (typeof missing === 'number' && missing > 0) {
      short += 1;
      gapCounts.set(missing, (gapCounts.get(missing) ?? 0) + 1);
    } else {
      complete += 1;
    }

    // Outcome axis, independent of the above.
    if (run.status === 'failure' || run.failure_step) failed += 1;
    else if (run.status === 'warning') warning += 1;
  }

  let dominantGap: TraceFleetSummary['dominantGap'] = null;
  for (const [missing, runs] of gapCounts) {
    if (!dominantGap || runs > dominantGap.runs) dominantGap = { missing, runs };
  }

  return {
    total: traces.length,
    complete,
    short,
    failed,
    warning,
    dominantGap,
    workflows: [...workflows].sort(),
  };
}

/**
 * Observed vs declared steps for ONE run, as a coverage fraction.
 *
 * Returns null when either count is missing rather than substituting a zero —
 * an unknown denominator rendered as 0/0 or 100% is the exact
 * unknown-as-healthy move the Bridge forbids.
 */
export function stepCoverage(run: FlightTraceRun): { observed: number; expected: number; percent: number } | null {
  const observed = run.observed_step_count;
  const expected = run.expected_step_count;
  if (typeof observed !== 'number' || typeof expected !== 'number' || expected <= 0) return null;
  return { observed, expected, percent: Math.round((observed / expected) * 100) };
}
