/**
 * Rollout mode per use case, and the precedence rule every use case obeys.
 *
 * Flags are booleans (config/feature-flags.yml); the shadow/enforce split
 * lives here, versioned in code, so promoting a use case is a reviewed
 * change with calibration evidence beside it — never a runtime toggle.
 */

import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { DeterministicFacts, JudgmentDisposition, JudgmentMode, JudgmentUseCase, PolicyOutcome } from './types';

export const MASTER_FLAG = 'jev_judgment_layer';

export const USE_CASE_FLAG: Record<JudgmentUseCase, string> = {
  semantic_regression: 'jev_semantic_regression',
  coachhelm_insight_quality: 'jev_coachhelm_insight_quality',
  self_heal_router: 'jev_self_heal_router',
  release_canary: 'jev_release_canary',
  state_integrity: 'jev_state_integrity',
  bug_triage: 'jev_bug_triage',
  shot_trace: 'jev_shot_trace',
  claim_honesty: 'typesafe_judgments',
};

/**
 * Every use case is `shadow` until its calibration report
 * (scripts/judgment/run-calibration.ts) justifies `enforce`. Promotion order
 * and the evidence bar are in memory/features/helm-judgment-layer.md.
 */
const PROMOTED_MODE: Partial<Record<JudgmentUseCase, JudgmentMode>> = {};

export function resolveMode(useCase: JudgmentUseCase): JudgmentMode {
  if (!isFlagEnabled(MASTER_FLAG)) return 'off';
  if (!isFlagEnabled(USE_CASE_FLAG[useCase])) return 'off';
  return PROMOTED_MODE[useCase] ?? 'shadow';
}

/**
 * P0/P1 outrank P2. A deterministic hard failure escalates on its own and
 * the judgment can only add reason codes; a judgment can never move a
 * hard failure below `escalate`.
 */
export function resolveDisposition(facts: DeterministicFacts, judged: PolicyOutcome | null): PolicyOutcome {
  const deterministic = [...(facts.reasonCodes ?? [])];
  if (facts.hardInvariantFailed) {
    return {
      disposition: 'escalate',
      reasonCodes: ['hard_invariant_failed', ...deterministic, ...(judged?.reasonCodes ?? [])],
    };
  }
  if (!judged) return { disposition: 'unassessed', reasonCodes: ['judgment_unavailable', ...deterministic] };
  return { disposition: judged.disposition, reasonCodes: [...deterministic, ...judged.reasonCodes] };
}

const RANK: Record<JudgmentDisposition, number> = {
  pass: 0,
  observe: 1,
  collect_more_evidence: 2,
  escalate: 3,
  block: 4,
  unassessed: -1,
};

/** The more severe of two dispositions; `unassessed` never wins over a real one. */
export function worseDisposition(a: JudgmentDisposition, b: JudgmentDisposition): JudgmentDisposition {
  return RANK[a] >= RANK[b] ? a : b;
}
