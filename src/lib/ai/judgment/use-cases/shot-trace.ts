/**
 * Shot-tracking Trace Judge (use case `shot_trace`).
 *
 * Question: did the shot-tracking workflow preserve the player's intent from
 * action → server mutation → persisted ledger? Geometry, distances and SVG
 * placement stay in code; Jev sees the compiled step/verification facts and
 * answers bounded questions. Never runs in the shot-entry request path —
 * it is invoked from the admin tracer and the offline evaluation script over
 * traces that are already finalized.
 */

import 'server-only';
import { choice, noul } from '@typesafe-ai/sdk';
import { runJudgment, type RunJudgmentOptions } from '../evaluator';
import type { DeterministicFacts, JudgmentResult, NormalizedAnswers, PolicyOutcome } from '../types';
import { compileShotTraceEvidence, type LedgerShot, type ShotTraceEvidence, type TraceRunRow, type TraceStepRow } from '../evidence/shot-ledger';

// v2 (2026-09-17, first calibration run): `more_evidence_required` and
// `instrumentation_only` answered ~80% on CLEAN traces when phrased as
// "would an engineer want more?" — every clean case landed in
// collect_more_evidence. Both are now conditional on the trace showing a gap,
// and the policy passes a clean trace before consulting them.
export const SHOT_TRACE_EVALUATOR_VERSION = 'shot-trace:v2';
export const SHOT_TRACE_POLICY_VERSION = 'shot-trace-policy:v2';

export const SHOT_TRACE_FAILURE_DOMAINS = {
  none: 'Nothing went wrong; the workflow did what the player asked',
  input_capture: 'The player\'s tap/entry was never captured or was captured wrong before any save',
  local_reducer: 'Client-side state drifted from what the player entered before the save was sent',
  autosave_transport: 'The save request never reached the server or its response never came back (network, timeout, fetch failure)',
  server_validation: 'The server rejected the payload on validation/auth/player checks before writing',
  rpc_atomic_write: 'The atomic Postgres write (save_partial_round_atomic / submit_round_atomic) failed or partially applied',
  conflict_detection: 'A lock/busy/stale-version conflict was detected and the save was refused',
  conflict_recovery: 'A conflict or transport failure occurred and a retry/fallback path handled it — the question is whether it handled it correctly',
  persisted_ledger: 'The write succeeded but the persisted shot/hole ledger does not match what was acknowledged',
  reconstruction: 'Data is persisted correctly but the read-back/display step reconstructed it wrongly',
  observability_only: 'Only the instrumentation is incomplete (a step not recorded, a stale counter); the player-facing workflow completed',
  unknown: 'Cannot tell from the supplied trace',
} as const;

export const SHOT_TRACE_QUESTIONS = {
  player_intent_preserved: noul({
    question: 'Considering `steps`, `verification` and `ledger`, did the workflow end with the persisted state the player intended (the shots they entered, saved, edited or deleted)?',
    treat_as_yes: 'every required step succeeded, verification counts match, no ledger violations, and any warning is confined to verify.* or post.* steps; ALSO yes when a db.* step failed at the transport level but `recovery.fallback_used` is true and verification counts match — the documented rescue path landed the write',
    treat_as_no: 'a required db.* step failed or is missing with no successful fallback, a verification count mismatches, or the ledger has violations',
  }),
  workflow_semantically_complete: noul('Did the workflow in `workflow` reach the outcome its name promises (a shot added/edited/deleted, a round autosaved/submitted, a hole completed), as opposed to merely returning without an error?'),
  persisted_state_matches_acknowledged: noul('Do the `verification` read-backs (expected vs actual counts) show that what the server acknowledged is what was persisted? Answer yes when every matched flag is true or the counts are absent because the write itself failed before acknowledgement.'),
  silent_failure_likely: noul({
    question: 'Is this more likely a SILENT failure — the run reports `run_status` success or warning while `steps.required_missing`, `steps.required_failed`, `verification` or `ledger` indicate the player\'s change did not fully land?',
    not_silent: 'a run whose run_status is failure (that is a loud failure), or a success whose only gaps are verify.*/post.* steps or conditional steps for the other branch of the workflow',
  }),
  instrumentation_only: noul({
    question: 'If `steps.required_missing`, `steps.warned` or `status_downgraded_from` show a gap, is that gap explained by instrumentation alone — a step the recorder did not observe, a conditional step for the branch not taken, a stale counter — rather than by the workflow failing to do the work?',
    answer_no_when: 'there is no gap at all (every required step succeeded and verification matched), or the gap is a db.* required step that never ran',
  }),
  more_evidence_required: noul({
    question: 'Does this trace leave a specific inconsistency UNSETTLED — a required db.* step missing without verification, a verification mismatch, a conflict/retry path whose outcome is not shown — such that the persisted rows or a replay are needed before deciding whether the player lost data?',
    answer_no_when: 'every required step succeeded and verification counts matched (nothing is unsettled), or the run is a loud failure the player already saw',
  }),
  requires_replay: noul({
    question: 'Does this trace warrant replaying the workflow against the persisted round to confirm the ledger, because the trace shows a gap it alone cannot settle?',
    answer_no_when: 'every required step succeeded and verification counts matched',
  }),
  failure_domain: choice('Which bounded subsystem best explains what this trace shows?', SHOT_TRACE_FAILURE_DOMAINS),
} as const;

export const SHOT_TRACE_THRESHOLDS = {
  silentFailure: 0.7,
  intentLost: 0.35,
  moreEvidence: 0.6,
  instrumentationOnly: 0.7,
  /** Clean gate: intent ≥ this AND silent ≤ cleanSilent AND domain none ⇒ pass before the softer questions are consulted. */
  cleanIntent: 0.7,
  cleanSilent: 0.2,
  /** Intent lost but silent below this and persisted-matches above persistedOk ⇒ loud failure ⇒ observe. */
  loudSilent: 0.5,
  persistedOk: 0.6,
} as const;

/** Deterministic mapping from answers to a disposition. Versioned by SHOT_TRACE_POLICY_VERSION. */
export function applyShotTracePolicy(answers: NormalizedAnswers, facts: DeterministicFacts): PolicyOutcome {
  const p = (id: string): number => {
    const a = answers[id];
    return a?.kind === 'noul' ? a.p : 0;
  };
  const domain = answers.failure_domain?.kind === 'choice' ? answers.failure_domain : null;
  const codes: string[] = [];
  if (domain) codes.push(`domain:${domain.choice}`);

  if (facts.hardInvariantFailed) return { disposition: 'escalate', reasonCodes: codes };

  const silent = p('silent_failure_likely');
  const intent = p('player_intent_preserved');
  const instrumentation = p('instrumentation_only');
  const more = p('more_evidence_required');

  const persisted = p('persisted_state_matches_acknowledged');
  if (silent >= SHOT_TRACE_THRESHOLDS.silentFailure) {
    codes.push('silent_failure_likely');
    return { disposition: 'escalate', reasonCodes: codes };
  }
  if (intent <= SHOT_TRACE_THRESHOLDS.intentLost) {
    // Intent not preserved but nothing silent and the persisted state
    // matches what was acknowledged: a LOUD failure the player saw (busy,
    // rejected) or a rescued write. Observe, do not page.
    if (silent < SHOT_TRACE_THRESHOLDS.loudSilent && persisted >= SHOT_TRACE_THRESHOLDS.persistedOk) {
      codes.push('intent_not_preserved_loud');
      return { disposition: 'observe', reasonCodes: codes };
    }
    codes.push('intent_not_preserved');
    return { disposition: 'escalate', reasonCodes: codes };
  }
  const softFindings = facts.softFindings ?? [];
  const domainNone = domain != null && domain.choice === 'none' && domain.confidence >= 0.6;
  if (softFindings.length === 0 && intent >= SHOT_TRACE_THRESHOLDS.cleanIntent && silent <= SHOT_TRACE_THRESHOLDS.cleanSilent && domainNone) {
    codes.push('clean');
    return { disposition: 'pass', reasonCodes: codes };
  }
  // P1: a required step the recorder never saw is unsettled by definition —
  // the judgment may say how worried to be, never that it is fine.
  if (softFindings.includes('required_missing')) {
    codes.push('required_missing_unsettled');
    return { disposition: more >= SHOT_TRACE_THRESHOLDS.moreEvidence || p('requires_replay') >= SHOT_TRACE_THRESHOLDS.moreEvidence ? 'collect_more_evidence' : 'observe', reasonCodes: codes };
  }
  if (more >= SHOT_TRACE_THRESHOLDS.moreEvidence || p('requires_replay') >= SHOT_TRACE_THRESHOLDS.moreEvidence) {
    codes.push('more_evidence_required');
    return { disposition: 'collect_more_evidence', reasonCodes: codes };
  }
  if (instrumentation >= SHOT_TRACE_THRESHOLDS.instrumentationOnly) {
    codes.push('instrumentation_only');
    return { disposition: 'observe', reasonCodes: codes };
  }
  if (domain && domain.choice !== 'none' && domain.choice !== 'observability_only' && domain.confidence >= 0.6) {
    codes.push('domain_named');
    return { disposition: 'observe', reasonCodes: codes };
  }
  if (softFindings.length > 0) {
    codes.push('soft_findings_present');
    return { disposition: 'observe', reasonCodes: codes };
  }
  return { disposition: 'pass', reasonCodes: codes };
}

export interface JudgeShotTraceInput {
  traceId: string;
  run: TraceRunRow;
  steps: readonly TraceStepRow[];
  shots?: readonly LedgerShot[] | null;
  roundId?: string | null;
}

export interface ShotTraceJudgment {
  evidence: ShotTraceEvidence;
  result: JudgmentResult;
}

export async function judgeShotTrace(input: JudgeShotTraceInput, options?: RunJudgmentOptions): Promise<ShotTraceJudgment> {
  const evidence = compileShotTraceEvidence(input);
  const softFindings: string[] = [];
  if (evidence.steps.required_missing.length > 0) softFindings.push('required_missing');
  if (evidence.steps.warned.length > 0) softFindings.push('warned');
  if (evidence.status_downgraded_from) softFindings.push('downgraded');
  if (evidence.recovery.fallback_used || evidence.recovery.conflict_seen || evidence.recovery.retry_seen) softFindings.push('recovery_path');
  if (evidence.run_status === 'failure') softFindings.push('failure');
  const facts: DeterministicFacts = {
    hardInvariantFailed: evidence.hard_invariants.length > 0,
    reasonCodes: evidence.hard_invariants,
    softFindings,
  };
  const result = await runJudgment(
    {
      useCase: 'shot_trace',
      evaluatorVersion: SHOT_TRACE_EVALUATOR_VERSION,
      policyVersion: SHOT_TRACE_POLICY_VERSION,
      entityType: 'trace',
      entityKey: input.roundId ?? input.traceId,
      traceId: input.traceId,
      state: evidence,
      questions: SHOT_TRACE_QUESTIONS,
      facts,
      evidenceSummary: {
        workflow: evidence.workflow,
        run_status: evidence.run_status,
        steps_observed: evidence.steps.observed,
        required_missing: evidence.steps.required_missing.length,
        required_failed: evidence.steps.required_failed.length,
        verification_mismatches: evidence.verification.filter((v) => v.matched === false).length,
        ledger_violations: evidence.ledger?.violations.length ?? 0,
        recovery_path: evidence.recovery.fallback_used || evidence.recovery.conflict_seen || evidence.recovery.retry_seen,
      },
      applyPolicy: applyShotTracePolicy,
    },
    options,
  );
  return { evidence, result };
}
