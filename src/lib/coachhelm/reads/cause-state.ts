import type { InsightCauseState, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

/**
 * The cause state a row's evidence carries (CoachHelm supercharge Slice 2,
 * `v3/engine/root-cause.ts`, behind `coachhelm_root_cause_diagnosis`), or null
 * for a row written without it. Readers map it onto their existing levels:
 *
 *   observed_sequence    (counted)            → diagnosis level "observed"
 *   inferred_hypothesis  (likely from totals) → diagnosis level "hypothesis"
 *   not_traced                                → not a cause: never drawn as
 *                                               "Likely"; the sentence is a
 *                                               count-down or a data gap
 *
 * Pure: evidence in, state out.
 */
export function causeStateOf(evidence: Pick<InsightEvidence, 'cause'> | null | undefined): InsightCauseState | null {
  const state = evidence?.cause?.state;
  return state === 'observed_sequence' || state === 'inferred_hypothesis' || state === 'not_traced' ? state : null;
}

/** True when the row says its cause is not traced (so its sentence is not a cause). */
export function isNotTracedCause(evidence: Pick<InsightEvidence, 'cause'> | null | undefined): boolean {
  return causeStateOf(evidence) === 'not_traced';
}
