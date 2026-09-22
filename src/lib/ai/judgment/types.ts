/**
 * Helm Judgment Layer — the contract every use case shares.
 *
 * Jev (TypeSafe System One) answers bounded typed questions over a compact
 * JSON state. Helm owns the contract: what evidence is compiled, which
 * questions are asked, and what a set of answers means. The provider is a
 * detail behind `jev-provider.ts`; nothing outside that file sees a
 * provider-native answer shape.
 *
 * Precedence, everywhere: P0 hard invariant / security rule → P1
 * deterministic business rule → P2 Jev judgment → P3 reasoning model → P4
 * owner. A judgment never overrides a fact code already proved, and a
 * provider failure is `unassessed`, never `pass`.
 */

export type JudgmentUseCase =
  | 'semantic_regression'
  | 'coachhelm_insight_quality'
  | 'self_heal_router'
  | 'release_canary'
  | 'state_integrity'
  | 'bug_triage'
  | 'shot_trace'
  /** Prose claim-honesty over CoachHelm generators (scripts/typesafe/honesty-sweep.ts). */
  | 'claim_honesty';

export const JUDGMENT_USE_CASES: readonly JudgmentUseCase[] = [
  'semantic_regression',
  'coachhelm_insight_quality',
  'self_heal_router',
  'release_canary',
  'state_integrity',
  'bug_triage',
  'shot_trace',
  'claim_honesty',
];

/** `off`: zero provider calls. `shadow`: judge, record, change nothing. `enforce`: policy may act. */
export type JudgmentMode = 'off' | 'shadow' | 'enforce';

export type JudgmentDisposition =
  | 'pass'
  | 'observe'
  | 'collect_more_evidence'
  | 'escalate'
  | 'block'
  | 'unassessed';

export const JUDGMENT_DISPOSITIONS: readonly JudgmentDisposition[] = [
  'pass',
  'observe',
  'collect_more_evidence',
  'escalate',
  'block',
  'unassessed',
];

/** Provider-neutral answer. One of these per question id. */
export type NormalizedAnswer =
  | { kind: 'noul'; p: number }
  | { kind: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { kind: 'score'; score: number; confidence: number; probabilities: Record<string, number> };

export type NormalizedAnswers = Record<string, NormalizedAnswer>;

/**
 * Facts code already established before asking. `hardInvariantFailed` is
 * P0: when true the disposition is `escalate` from the deterministic layer
 * and the judgment (if still run, for calibration) cannot soften it.
 */
export interface DeterministicFacts {
  hardInvariantFailed: boolean;
  /** Reason codes from the deterministic layer, carried into the result. */
  reasonCodes?: readonly string[];
  /**
   * P1 — gaps code can see but cannot settle (a required step missing, a
   * warning, a recovery path). A policy may not `pass` while any is present;
   * the judgment decides between observe / collect / escalate.
   */
  softFindings?: readonly string[];
}

export interface JudgmentRequest<State = unknown> {
  useCase: JudgmentUseCase;
  /** e.g. `shot-trace:v1` — bump when the question set changes. */
  evaluatorVersion: string;
  /** e.g. `shot-trace-policy:v1` — bump when thresholds/mapping change. */
  policyVersion: string;
  entityType: string;
  /** Raw entity key; only its hash is persisted. */
  entityKey?: string;
  traceId?: string;
  /** Compact, already-redacted-by-construction state. `redact()` runs anyway. */
  state: State;
  /** SDK questions (noul/choice/score). Built by the use case's `buildQuestions()`. */
  questions: Record<string, unknown>;
  facts: DeterministicFacts;
  /** Small allowlisted summary persisted beside the answers (never the state). */
  evidenceSummary?: Record<string, string | number | boolean | null>;
  /** Maps normalized answers (+facts) to a disposition. Deterministic. */
  applyPolicy: (answers: NormalizedAnswers, facts: DeterministicFacts) => PolicyOutcome;
  timeoutMs?: number;
}

export interface PolicyOutcome {
  disposition: JudgmentDisposition;
  reasonCodes: string[];
}

export interface JudgmentResult {
  useCase: JudgmentUseCase;
  evaluatorVersion: string;
  policyVersion: string;
  mode: JudgmentMode;
  provider: 'typesafe-ai';
  modelId: string;
  /** Empty when `unassessed`. */
  answers: NormalizedAnswers;
  disposition: JudgmentDisposition;
  reasonCodes: string[];
  /** True unless mode is `enforce`; callers must not act on a shadow result. */
  shadow: boolean;
  stateHash: string;
  durationMs: number;
  providerErrorCode: string | null;
  /** Set when persistence succeeded; used to attach labels later. */
  evaluationId: string | null;
}
