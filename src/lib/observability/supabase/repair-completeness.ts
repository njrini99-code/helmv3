/**
 * Repair completeness — brief §76.
 *
 * "The error stopped appearing" is not a repair. The brief lists eight
 * separate things that must each be true before a database defect is
 * actually closed, and this module evaluates them one at a time.
 *
 * WHY THERE IS NO SCORE
 * ----------------------
 * The natural-looking output is "7 of 8" or 87%. Both are the same mistake:
 * they average an UNKNOWN into a number that reads like knowledge. "We did
 * not check whether the neighbouring tables are healthy" and "we checked and
 * they are" must not be able to produce the same digit. So the roll-up is
 * three-valued and every item's status is returned individually:
 *
 *   COMPLETE       every criterion PASSED
 *   INCOMPLETE     at least one criterion FAILED
 *   INDETERMINATE  nothing failed, but something is unknown
 *
 * FAIL outranks UNKNOWN because a proven failure is decisive — the repair is
 * not complete either way, and calling it INDETERMINATE would be weaker than
 * the evidence supports. The unknown items are still listed alongside, so
 * the failure never swallows them.
 *
 * A MISSING CRITERION IS UNKNOWN, NOT PASS
 * -----------------------------------------
 * The input is a partial record. Anything a caller did not supply reads
 * UNKNOWN, so forgetting to check something can never look like checking it
 * and finding nothing wrong. `PASS` with an empty evidence string is also
 * UNKNOWN: an assertion is not evidence, and the whole point of this
 * checklist is that a claim carries its proof.
 *
 * Pure: no I/O, no clock, no server-only import.
 */

export const REPAIR_CHECK_IDS = [
  'root_cause_proven',
  'regression_test_exists',
  'rls_unchanged_or_deliberate',
  'performance_not_degraded',
  'invariant_restored',
  'no_telemetry_hidden',
  'neighbours_healthy',
  'post_deploy_signal_healthy',
] as const;

export type RepairCheckId = (typeof REPAIR_CHECK_IDS)[number];

export type RepairCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface RepairCheckEvidence {
  status: RepairCheckStatus;
  /** What was actually observed. A PASS with no evidence is downgraded to
   *  UNKNOWN — see the header. */
  evidence: string;
}

/** Partial on purpose: an unsupplied criterion is UNKNOWN. */
export type RepairCompletenessInput = Partial<Record<RepairCheckId, RepairCheckEvidence>>;

export interface RepairCheckResult {
  id: RepairCheckId;
  /** The question this criterion asks, for a surface to render verbatim. */
  question: string;
  status: RepairCheckStatus;
  evidence: string;
}

export type RepairCompletenessVerdict = 'COMPLETE' | 'INCOMPLETE' | 'INDETERMINATE';

export interface RepairCompletenessResult {
  items: readonly RepairCheckResult[];
  overall: RepairCompletenessVerdict;
  failedIds: readonly RepairCheckId[];
  unknownIds: readonly RepairCheckId[];
}

const QUESTIONS: Record<RepairCheckId, string> = {
  root_cause_proven:
    'Is the root cause PROVEN — reproduced, or demonstrated from evidence — rather than inferred from the error stopping?',
  regression_test_exists: 'Does a regression test or replay fixture fail on the old behaviour and pass on the new one?',
  rls_unchanged_or_deliberate:
    'Is the row-level-security posture unchanged, or changed deliberately with the change reviewed on its own merits?',
  performance_not_degraded: 'Did the repair leave request latency and database execution time no worse than before?',
  invariant_restored: 'Is the invariant the defect violated now provably holding over the affected data?',
  no_telemetry_hidden:
    'Did the repair avoid silencing the signal instead of fixing the fault — no widened catch, no downgraded severity, no removed capture?',
  neighbours_healthy: 'Are the neighbouring relations, RPCs and features that share this code path still healthy?',
  post_deploy_signal_healthy: 'Since the deploy, is the signal for this mechanism healthy — and still arriving at all?',
};

function resolveStatus(supplied: RepairCheckEvidence | undefined): RepairCheckResult['status'] {
  if (!supplied) return 'UNKNOWN';
  if (supplied.status === 'PASS' && supplied.evidence.trim().length === 0) return 'UNKNOWN';
  return supplied.status;
}

function resolveEvidence(supplied: RepairCheckEvidence | undefined, status: RepairCheckStatus): string {
  if (!supplied) return 'No evidence was supplied for this criterion, so it is unknown rather than satisfied.';
  if (status === 'UNKNOWN' && supplied.status === 'PASS') {
    return 'Marked as passing but no evidence was given; an assertion without evidence is not a pass.';
  }
  return supplied.evidence.trim().length > 0 ? supplied.evidence : 'No detail supplied.';
}

/**
 * Pure. Never throws, never mutates its input, and never returns an
 * aggregate that could hide an UNKNOWN.
 */
export function evaluateRepairCompleteness(input: RepairCompletenessInput): RepairCompletenessResult {
  const items: RepairCheckResult[] = REPAIR_CHECK_IDS.map((id) => {
    const supplied = input[id];
    const status = resolveStatus(supplied);
    return { id, question: QUESTIONS[id], status, evidence: resolveEvidence(supplied, status) };
  });

  const failedIds = items.filter((i) => i.status === 'FAIL').map((i) => i.id);
  const unknownIds = items.filter((i) => i.status === 'UNKNOWN').map((i) => i.id);

  const overall: RepairCompletenessVerdict =
    failedIds.length > 0 ? 'INCOMPLETE' : unknownIds.length > 0 ? 'INDETERMINATE' : 'COMPLETE';

  return { items, overall, failedIds, unknownIds };
}
