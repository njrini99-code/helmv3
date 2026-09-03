/**
 * RLS / authorization diagnosis — brief §41, runbook from §68.
 *
 * `classify.ts` already answers "how severe is this 42501" from the caller's
 * `expectedAuthorizationDenial` flag. This module answers the next question:
 * given that same flag plus the failure's safe dimensions, is this an
 * EXPECTED SECURITY DENIAL (the product asked whether someone may do X and
 * the answer was no — working as designed) or an UNEXPECTED PRODUCT FAILURE
 * (a path that should always have been authorized), and what does an operator
 * check next.
 *
 * WHY THE EXPECTATION IS AN INPUT AND NOT A GUESS
 * -----------------------------------------------
 * Nothing in a 42501 distinguishes the two cases. The same SQLSTATE, the same
 * relation, the same role. Only the CALL SITE knows whether a denial was a
 * possible correct outcome, which is exactly why `classify.ts` takes the flag
 * rather than inferring it, and why this module keeps a third state:
 * `unknown` when the caller never stated an expectation. Defaulting a silent
 * caller to "expected" hides real authorization defects; defaulting it to
 * "unexpected" pages someone for a routine permission check, which the
 * brief's own anti-pattern list names. Neither default is acceptable, so
 * there is no default.
 *
 * PRIVACY IS STRUCTURAL (§6, and the brief's explicit "never log policy
 * predicates with user values")
 * ---------------------------------------------------------------------
 * This module NEVER reads the failure's message, details or hint, and has no
 * field they could travel in. Every string it emits is assembled from the
 * enumerated dimensions — feature, action, operation, relation, rpc — plus
 * fixed runbook prose. A policy predicate therefore cannot reach the output,
 * not by convention but because no code path carries one. `authorization-diagnosis.test.ts`
 * pins that with a sentinel-bearing message.
 *
 * The runbook steps are QUESTIONS, never remediations that touch the
 * database. Nothing here proposes granting a privilege, relaxing a policy or
 * running SQL — the brief's 57014 runbook makes the same point in its own
 * "never fix by raising the statement timeout" line.
 */
import type { SupabaseErrorEnvelope } from './envelope';

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export const AUTHORIZATION_VERDICTS = [
  'EXPECTED_SECURITY_DENIAL',
  'UNEXPECTED_PRODUCT_FAILURE',
  'UNKNOWN',
  'NOT_AN_AUTHORIZATION_FAILURE',
] as const;
export type AuthorizationVerdict = (typeof AUTHORIZATION_VERDICTS)[number];

export const AUTHORIZATION_VERDICT_LABEL: Readonly<Record<AuthorizationVerdict, string>> = {
  EXPECTED_SECURITY_DENIAL: 'EXPECTED SECURITY DENIAL',
  UNEXPECTED_PRODUCT_FAILURE: 'UNEXPECTED PRODUCT FAILURE',
  UNKNOWN: 'UNKNOWN — CALLER STATED NO EXPECTATION',
  NOT_AN_AUTHORIZATION_FAILURE: 'NOT AN AUTHORIZATION FAILURE',
};

/** What the call site expected. `unknown` is a first-class answer, not a gap to fill. */
export type AuthorizationExpectation = 'denial-is-possible' | 'must-be-authorized' | 'unknown';

/** Which surface the denial happened on — it prunes the runbook. */
export type AuthorizationSurface = 'rpc' | 'table' | 'unknown';

export interface AuthorizationRunbookStep {
  id: string;
  /** The question an operator answers, in order. */
  question: string;
  /** Why this question is on the list — what a "no" would mean. */
  why: string;
}

export interface AuthorizationDiagnosis {
  verdict: AuthorizationVerdict;
  /** `false` for any failure that is not an authorization mechanism. */
  applies: boolean;
  surface: AuthorizationSurface;
  /** One short sentence built only from enumerated dimensions. */
  explanation: string;
  runbook: readonly AuthorizationRunbookStep[];
  /** True when this should reach a human. An expected denial should not. */
  actionable: boolean;
}

// ---------------------------------------------------------------------------
// The §68 runbook, in the order the brief lists it
// ---------------------------------------------------------------------------

const STEP_EXPECTED: AuthorizationRunbookStep = {
  id: 'is-it-expected',
  question: 'Is a denial on this path a correct outcome the product asks for, or should this caller always have been authorized?',
  why: 'Everything below only matters for the second case. A denial the product deliberately probes for is not a defect and must not page anyone.',
};

const STEP_SURFACE: AuthorizationRunbookStep = {
  id: 'rpc-or-table',
  question: 'Did the denial happen on an RPC call or on a direct table operation?',
  why: 'An RPC adds a whole privilege layer a table operation does not have — EXECUTE, the function’s rights model, and its search_path.',
};

const STEP_RIGHTS_MODEL: AuthorizationRunbookStep = {
  id: 'invoker-or-definer-rights',
  question: 'Does the function run with invoker rights or definer rights?',
  why: 'With invoker rights the caller’s own privileges and RLS policies apply inside the function; with definer rights the owner’s do, and RLS on the underlying tables is bypassed for the owner unless forced.',
};

const STEP_SEARCH_PATH: AuthorizationRunbookStep = {
  id: 'search-path',
  question: 'Is the function’s search_path pinned, and does it resolve the objects the body names?',
  why: 'An unpinned or wrong search_path makes the body resolve a different object — or none — and the failure surfaces as a privilege error rather than a missing one.',
};

const STEP_SCHEMA_USAGE: AuthorizationRunbookStep = {
  id: 'schema-usage',
  question: 'Does the calling role hold USAGE on the schema the object lives in?',
  why: 'Without schema USAGE, Postgres refuses before it evaluates any table privilege or policy — so the denial is not about the object at all.',
};

const STEP_EXECUTE_GRANT: AuthorizationRunbookStep = {
  id: 'execute-grant',
  question: 'Does the calling role hold EXECUTE on this function?',
  why: 'EXECUTE is revoked from public/anon/authenticated on every helm_debug facade by design; a role that lost it fails here before the body runs.',
};

const STEP_TABLE_PRIVILEGE: AuthorizationRunbookStep = {
  id: 'table-privilege',
  question: 'Does the calling role hold the column-level and table-level privilege the statement needs?',
  why: 'A column the role cannot write rejects the whole statement with 42501 before RLS is evaluated — HELD.md records exactly this happening to an UPDATE on updated_at.',
};

const STEP_RLS_POLICY: AuthorizationRunbookStep = {
  id: 'rls-policy',
  question: 'Is there a policy on this relation that admits this role for this command?',
  why: 'RLS denies by default once enabled. A relation with RLS on and no matching policy denies every row without saying so.',
};

const STEP_RECENT_CHANGE: AuthorizationRunbookStep = {
  id: 'recent-release-or-migration',
  question: 'Did a recent release or migration change this object, its grants, or its policies?',
  why: 'A grant or policy edit is the most common cause of a path that was authorized yesterday and is not today.',
};

const STEP_REPRODUCE: AuthorizationRunbookStep = {
  id: 'reproduce-as-the-role',
  question: 'Can the failure be reproduced by running the same statement as that role, in a local stack?',
  why: 'Reproduction is the only step that converts every answer above from a hypothesis into a proven cause — and it belongs in a local stack, never against production.',
};

function buildRunbook(surface: AuthorizationSurface): readonly AuthorizationRunbookStep[] {
  const steps: AuthorizationRunbookStep[] = [STEP_EXPECTED, STEP_SURFACE];

  if (surface === 'rpc' || surface === 'unknown') {
    steps.push(STEP_RIGHTS_MODEL, STEP_SEARCH_PATH);
  }
  steps.push(STEP_SCHEMA_USAGE);
  if (surface === 'rpc' || surface === 'unknown') {
    steps.push(STEP_EXECUTE_GRANT);
  }
  if (surface === 'table' || surface === 'unknown') {
    steps.push(STEP_TABLE_PRIVILEGE);
  }
  steps.push(STEP_RLS_POLICY, STEP_RECENT_CHANGE, STEP_REPRODUCE);
  return steps;
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

/** 42501 is the canonical one; the message-fallback code `classify.ts` emits
 *  when a proxy swallowed the SQLSTATE means the same mechanism. */
const AUTHORIZATION_CODES = new Set(['42501', 'unknown_authorization']);

export function isAuthorizationFailure(
  envelope: Pick<SupabaseErrorEnvelope, 'code' | 'sqlstate'>,
): boolean {
  return AUTHORIZATION_CODES.has((envelope.sqlstate ?? envelope.code ?? '').trim());
}

export function resolveAuthorizationSurface(
  envelope: Pick<SupabaseErrorEnvelope, 'operation' | 'relation' | 'rpc'>,
): AuthorizationSurface {
  if (envelope.rpc !== null && envelope.rpc.length > 0) return 'rpc';
  if (envelope.operation === 'rpc') return 'rpc';
  if (envelope.relation !== null && envelope.relation.length > 0) return 'table';
  return 'unknown';
}

export interface DiagnoseAuthorizationInput {
  envelope: Pick<
    SupabaseErrorEnvelope,
    'code' | 'sqlstate' | 'feature' | 'action' | 'operation' | 'relation' | 'rpc'
  >;
  /**
   * What the CALL SITE expected. There is deliberately no default — see the
   * header. `classify.ts`'s `expectedAuthorizationDenial` maps to
   * `'denial-is-possible'`; a call site that has never been classified maps
   * to `'unknown'`, not to either verdict.
   */
  expectation: AuthorizationExpectation;
}

export function diagnoseAuthorization(input: DiagnoseAuthorizationInput): AuthorizationDiagnosis {
  const { envelope, expectation } = input;

  if (!isAuthorizationFailure(envelope)) {
    return {
      verdict: 'NOT_AN_AUTHORIZATION_FAILURE',
      applies: false,
      surface: 'unknown',
      explanation: 'This failure is not an authorization mechanism, so the 42501 runbook does not apply to it.',
      runbook: [],
      actionable: false,
    };
  }

  const surface = resolveAuthorizationSurface(envelope);
  const objectPhrase =
    surface === 'rpc' && envelope.rpc
      ? `RPC ${envelope.rpc}`
      : surface === 'table' && envelope.relation
        ? `relation ${envelope.relation}`
        : 'an object the envelope does not name';
  const where = `${envelope.feature}/${envelope.action} (${envelope.operation}) on ${objectPhrase}`;

  if (expectation === 'denial-is-possible') {
    return {
      verdict: 'EXPECTED_SECURITY_DENIAL',
      applies: true,
      surface,
      explanation: `Authorization denied on ${where}. The call site states a denial is a possible correct outcome here, so this is the security boundary working, not a defect.`,
      // The first two steps still apply — they are how someone re-checks that
      // the "expected" label is still true after the feature changed.
      runbook: [STEP_EXPECTED, STEP_RECENT_CHANGE],
      actionable: false,
    };
  }

  if (expectation === 'must-be-authorized') {
    return {
      verdict: 'UNEXPECTED_PRODUCT_FAILURE',
      applies: true,
      surface,
      explanation: `Authorization denied on ${where}, which the call site states should always be authorized. Something in the privilege chain changed or was never granted.`,
      runbook: buildRunbook(surface),
      actionable: true,
    };
  }

  return {
    verdict: 'UNKNOWN',
    applies: true,
    surface,
    explanation: `Authorization denied on ${where}. The call site has not stated whether a denial is expected here, so this cannot be called either a security boundary or a defect.`,
    runbook: buildRunbook(surface),
    // Unknown is not healthy: an unclassified denial still needs a human to
    // decide which of the two it is. It is not, however, a proven defect.
    actionable: true,
  };
}
