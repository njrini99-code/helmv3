/**
 * analysis-outcome — the typed result contract for a post-round CoachHelm
 * analysis run (repair plan §5.3 / R3, 2026-09-12).
 *
 * Before this module every non-success from the engine was one of two
 * things to the trigger: a `success: false` envelope whose free-text
 * `error` was regex-matched into a persisted reason, or a thrown exception
 * mapped wholesale to "session expired". Expected states — a player still
 * under the coach's round floor, a player with no roster, a coach who
 * switched CoachHelm off — were stamped `coachhelm_failed_at` exactly like
 * a crash, so production carried 65 "engine_no_recent_rounds" and 9
 * "engine_membership_missing" FAILED rounds that had never failed at all.
 *
 * Seven outcome kinds, each with an operational meaning and a retry policy:
 *
 * | kind                | meaning                                        | retry                                   |
 * |---------------------|------------------------------------------------|-----------------------------------------|
 * | succeeded           | applicable evaluation completed (0 findings ok)| on new evidence / configuration         |
 * | partial             | some generators succeeded, named ones failed   | bounded retry of the failed work        |
 * | waiting_for_data    | eligible player lacks the evidence floor/window| wake on a new completed round           |
 * | not_applicable      | no applicable active team context              | wake on a membership change             |
 * | disabled            | coach / team intentionally disabled analysis   | wake on a setting change                |
 * | retryable_failure   | transient infrastructure / dependency fault    | backoff, deadline, then visible exhaust |
 * | permanent_failure   | invalid input or contract violation            | explicit repair                         |
 *
 * Persistence stays on the three service-only columns the
 * `record_round_coachhelm_terminal_state` RPC may write. The kinds map to
 * them like this (`terminalStateFor`):
 *
 *   succeeded / partial      analyzed_at = now, failed_at = null
 *   waiting / n.a. / disabled  BOTH timestamps null, reason = code  ("parked")
 *   retryable / permanent    failed_at = now, reason = code
 *
 * A PARKED round is neither analyzed nor failed. It is excluded from the
 * safety net's "never processed" sweep by its non-null reason, and woken
 * only by the event its policy names — never re-run every 30 minutes.
 *
 * `coachhelm_failure_reason` is readable by the player (they SELECT their
 * own golf_rounds row), so only the stable code goes there. Messages,
 * details and the original exception go to the logs.
 */

export type AnalysisOutcomeKind =
  | 'succeeded'
  | 'partial'
  | 'waiting_for_data'
  | 'not_applicable'
  | 'disabled'
  | 'retryable_failure'
  | 'permanent_failure';

/**
 * Stable codes. The ones that already existed as persisted markers or
 * observability codes keep their spelling so historical rows stay legible:
 * `engine_partial_failure`, `engine_no_recent_rounds`,
 * `engine_no_team_membership`, `engine_session_expired`, `engine_timeout`,
 * `engine_disabled`, `engine_error`.
 */
export type AnalysisOutcomeCode =
  | 'engine_succeeded'
  | 'engine_partial_failure'
  | 'engine_below_round_floor'
  | 'engine_no_recent_rounds'
  | 'engine_no_team_membership'
  | 'engine_no_coach'
  | 'engine_disabled'
  | 'engine_timeout'
  | 'engine_transient'
  | 'engine_session_expired'
  | 'engine_generator_failure'
  | 'engine_error'
  /** A parked or legacy-failed round whose player was analyzed by a later
   *  run — player-level analysis covers the earlier rounds' evidence. */
  | 'engine_covered_by_later_run';

/** The original exception, preserved verbatim for the logs. */
export interface PreservedCause {
  name: string;
  message: string;
  stack?: string;
  /** Postgres / PostgREST error code when the throw carried one. */
  code?: string;
}

export interface AnalysisOutcome {
  kind: AnalysisOutcomeKind;
  code: AnalysisOutcomeCode;
  /** Operator-facing detail. Never persisted to golf_rounds. */
  message: string;
  /** Structured context (e.g. `{ completedRounds, floor }`, failed generators). */
  details?: Record<string, unknown>;
  cause?: PreservedCause;
}

/** What the engine hands back over the bridge; a superset of the legacy envelope. */
export interface TriggerResultLike {
  success: boolean;
  insights_created?: number;
  error?: string;
  partial?: boolean;
  code?: string;
  details?: Record<string, unknown>;
  cause?: PreservedCause;
}

export type RetryMode =
  | 'on_new_evidence'
  | 'bounded_retry'
  | 'wake_on_round'
  | 'wake_on_membership'
  | 'wake_on_settings'
  | 'backoff_with_deadline'
  | 'manual_repair';

export interface RetryPolicy {
  mode: RetryMode;
  /** Minimum gap between attempts (backoff_with_deadline / bounded_retry). */
  minBackoffMs?: number;
  /** Attempts (first run included) before the row is left failed and
   *  reported as exhausted — the operator-visible deadline. */
  maxAttempts?: number;
}

/** One safety-net tick apart, at least. */
export const RETRY_MIN_BACKOFF_MS = 30 * 60 * 1000;
/** Total attempts (the first run plus retries) before a transient fault is
 *  left failed and reported as exhausted. */
export const RETRY_MAX_ATTEMPTS = 3;

export function retryPolicyFor(kind: AnalysisOutcomeKind): RetryPolicy {
  switch (kind) {
    case 'succeeded':
      return { mode: 'on_new_evidence' };
    case 'partial':
      return { mode: 'bounded_retry', minBackoffMs: RETRY_MIN_BACKOFF_MS, maxAttempts: RETRY_MAX_ATTEMPTS };
    case 'waiting_for_data':
      return { mode: 'wake_on_round' };
    case 'not_applicable':
      return { mode: 'wake_on_membership' };
    case 'disabled':
      return { mode: 'wake_on_settings' };
    case 'retryable_failure':
      return { mode: 'backoff_with_deadline', minBackoffMs: RETRY_MIN_BACKOFF_MS, maxAttempts: RETRY_MAX_ATTEMPTS };
    case 'permanent_failure':
      return { mode: 'manual_repair' };
  }
}

const KIND_BY_CODE: Record<AnalysisOutcomeCode, AnalysisOutcomeKind> = {
  engine_succeeded: 'succeeded',
  engine_partial_failure: 'partial',
  engine_below_round_floor: 'waiting_for_data',
  engine_no_recent_rounds: 'waiting_for_data',
  engine_no_team_membership: 'not_applicable',
  engine_no_coach: 'not_applicable',
  engine_disabled: 'disabled',
  engine_timeout: 'retryable_failure',
  engine_transient: 'retryable_failure',
  // A background worker with no auth context is a wiring defect, not a
  // fault that a retry in the same context can clear.
  engine_session_expired: 'permanent_failure',
  engine_generator_failure: 'retryable_failure',
  engine_error: 'permanent_failure',
  engine_covered_by_later_run: 'succeeded',
};

const KNOWN_CODES = new Set<string>(Object.keys(KIND_BY_CODE));

export function isAnalysisOutcomeCode(code: unknown): code is AnalysisOutcomeCode {
  return typeof code === 'string' && KNOWN_CODES.has(code);
}

export function kindForCode(code: AnalysisOutcomeCode): AnalysisOutcomeKind {
  return KIND_BY_CODE[code];
}

/**
 * Codes whose rows are PARKED (both terminal timestamps null, reason set):
 * not analyzed, not failed, waiting for the event their policy names.
 */
export const PARKED_OUTCOME_CODES: ReadonlySet<string> = new Set(
  (Object.keys(KIND_BY_CODE) as AnalysisOutcomeCode[]).filter((code) => {
    const kind = KIND_BY_CODE[code];
    return kind === 'waiting_for_data' || kind === 'not_applicable' || kind === 'disabled';
  }),
);

/** The three columns `record_round_coachhelm_terminal_state` may write. */
export interface RoundTerminalState {
  coachhelm_analyzed_at: string | null;
  coachhelm_failed_at: string | null;
  coachhelm_failure_reason: string | null;
}

export interface TerminalStateOptions {
  /** Which attempt this run was (first run = 1). A retryable failure on the
   *  last permitted attempt is stamped `<code>:exhausted`. */
  attempt?: number;
}

export function terminalStateFor(
  outcome: AnalysisOutcome,
  nowIso: string,
  options: TerminalStateOptions = {},
): RoundTerminalState {
  switch (outcome.kind) {
    case 'succeeded':
      return {
        coachhelm_analyzed_at: nowIso,
        coachhelm_failed_at: null,
        // A plain success clears the reason; a covered round keeps the
        // marker so it is never mistaken for a run of its own.
        coachhelm_failure_reason: outcome.code === 'engine_succeeded' ? null : outcome.code,
      };
    case 'partial':
      return { coachhelm_analyzed_at: nowIso, coachhelm_failed_at: null, coachhelm_failure_reason: outcome.code };
    case 'waiting_for_data':
    case 'not_applicable':
    case 'disabled':
      return { coachhelm_analyzed_at: null, coachhelm_failed_at: null, coachhelm_failure_reason: outcome.code };
    case 'retryable_failure': {
      const attempt = Math.max(1, options.attempt ?? 1);
      return {
        coachhelm_analyzed_at: null,
        coachhelm_failed_at: nowIso,
        coachhelm_failure_reason: formatFailureReason(outcome.code, attempt, attempt >= RETRY_MAX_ATTEMPTS),
      };
    }
    case 'permanent_failure':
      return { coachhelm_analyzed_at: null, coachhelm_failed_at: nowIso, coachhelm_failure_reason: outcome.code };
  }
}

export function isParkedTerminalState(state: RoundTerminalState): boolean {
  return (
    state.coachhelm_analyzed_at === null &&
    state.coachhelm_failed_at === null &&
    typeof state.coachhelm_failure_reason === 'string' &&
    PARKED_OUTCOME_CODES.has(state.coachhelm_failure_reason)
  );
}

/**
 * Typed outcome for the engine's result envelope. A `success: false` that
 * carries no code — a legacy path, or a real defect — is a permanent
 * failure with its message intact; nothing is inferred from the text.
 */
export function outcomeFromTriggerResult(result: TriggerResultLike): AnalysisOutcome {
  if (result.success) {
    return result.partial === true
      ? {
          kind: 'partial',
          code: 'engine_partial_failure',
          message: 'one or more generators failed but the round was analyzed',
          details: result.details,
        }
      : { kind: 'succeeded', code: 'engine_succeeded', message: 'analysis completed', details: result.details };
  }
  const message = result.error?.trim() || 'engine reported failure';
  // An uncoded envelope names no expected state — it is a failure. The only
  // thing read off its text is whether the fault looks transient (a timeout
  // or a dropped connection), which decides retry vs. repair, never whether
  // it was expected.
  const code: AnalysisOutcomeCode = isAnalysisOutcomeCode(result.code)
    ? result.code
    : transientCodeForText(message) ?? 'engine_error';
  return {
    kind: KIND_BY_CODE[code],
    code,
    message,
    ...(result.details ? { details: result.details } : {}),
    ...(result.cause ? { cause: result.cause } : {}),
  };
}

export function describeCause(err: unknown): PreservedCause {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  if (err && typeof err === 'object') {
    const record = err as { name?: unknown; message?: unknown; code?: unknown };
    return {
      name: typeof record.name === 'string' ? record.name : 'Error',
      message: typeof record.message === 'string' ? record.message : String(err),
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
    };
  }
  return { name: 'Error', message: String(err) };
}

// Postgres class 57 (operator intervention: admin shutdown, crash shutdown,
// cannot connect now), class 08 (connection exception), 53300 (too many
// connections), 40001 / 40P01 (serialization / deadlock — safe to retry),
// and PostgREST's upstream-unavailable codes.
const TRANSIENT_PG_CODES = /^(57P0[123]|08\d{3}|53300|40001|40P01|PGRST00[0-9])$/;
const TIMEOUT_PATTERN = /\btime(d)? ?out\b|statement timeout|57014/i;
const TRANSIENT_PATTERN =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|fetch failed|network error|Service Unavailable|Bad Gateway|Gateway Timeout|too many connections|connection terminated|terminating connection/i;
// Only a genuine auth-context failure is named as one. Everything else keeps
// its own identity — the old catch mapped every throw here.
const AUTH_MISSING_PATTERN = /auth session missing|session (has )?expired|not authenticated|jwt expired|invalid jwt/i;

function transientCodeForText(text: string, pgCode?: string): 'engine_timeout' | 'engine_transient' | null {
  if (pgCode === '57014' || TIMEOUT_PATTERN.test(text)) return 'engine_timeout';
  if ((pgCode && TRANSIENT_PG_CODES.test(pgCode)) || TRANSIENT_PATTERN.test(text)) return 'engine_transient';
  return null;
}

/**
 * Classify a thrown exception without losing it. Transient infrastructure
 * faults are retryable; a missing auth context is named; everything else is
 * a permanent failure that stays inspectable through `cause`.
 */
export function classifyThrown(err: unknown): AnalysisOutcome {
  const cause = describeCause(err);
  const transient = transientCodeForText(`${cause.code ?? ''} ${cause.message}`, cause.code);
  if (transient) {
    return { kind: 'retryable_failure', code: transient, message: cause.message, cause };
  }
  if (AUTH_MISSING_PATTERN.test(cause.message)) {
    return { kind: 'permanent_failure', code: 'engine_session_expired', message: cause.message, cause };
  }
  return { kind: 'permanent_failure', code: 'engine_error', message: cause.message, cause };
}

/**
 * Log severity per kind. Kept in ONE place so the three consumers of a
 * result (the trigger, the safety net, the queue consumer) cannot disagree
 * — the exact defect `classifySoftFailure` was introduced to stop.
 */
export function logSeverityFor(kind: AnalysisOutcomeKind): { severity: 'info' | 'warning' | 'error'; skipSentry: boolean } {
  switch (kind) {
    case 'succeeded':
    case 'waiting_for_data':
    case 'disabled':
      return { severity: 'info', skipSentry: true };
    case 'partial':
    case 'not_applicable':
      return { severity: 'warning', skipSentry: true };
    case 'retryable_failure':
      return { severity: 'warning', skipSentry: false };
    case 'permanent_failure':
      return { severity: 'error', skipSentry: false };
  }
}

// ---------------------------------------------------------------------------
// Retry bookkeeping on the reason column (no schema change).
//
// `coachhelm_failure_reason` is the only writable text the terminal RPC
// offers, so a retryable failure counts its attempts there:
// `engine_timeout` (first attempt), `engine_timeout:r2`, `engine_timeout:r3`,
// then `engine_timeout:exhausted`. Parsing is exact — a legacy value that
// does not match stays a plain code with attempt 1.
// ---------------------------------------------------------------------------

export interface ParsedFailureReason {
  code: string;
  attempt: number;
  exhausted: boolean;
}

export function parseFailureReason(reason: string | null | undefined): ParsedFailureReason | null {
  if (!reason) return null;
  const match = /^([a-z_]+)(?::(?:r(\d+)|(exhausted)))?$/.exec(reason);
  if (!match) return { code: reason, attempt: 1, exhausted: false };
  const [, code, attemptText, exhausted] = match;
  return {
    code: code!,
    attempt: attemptText ? Math.max(1, Number(attemptText)) : 1,
    exhausted: exhausted === 'exhausted',
  };
}

export function formatFailureReason(code: string, attempt: number, exhausted = false): string {
  if (exhausted) return `${code}:exhausted`;
  return attempt <= 1 ? code : `${code}:r${attempt}`;
}

/** Codes the safety net may re-run under `backoff_with_deadline`. */
export const RETRYABLE_FAILURE_CODES: ReadonlySet<string> = new Set(
  (Object.keys(KIND_BY_CODE) as AnalysisOutcomeCode[]).filter((code) => KIND_BY_CODE[code] === 'retryable_failure'),
);

/** Codes the pre-R3 trigger stamped as FAILED for outcomes that were never
 *  failures. The safety net applies the parked wake rules to them too, so the
 *  historical rows are repaired by the same evidence, not a bulk update. */
export const LEGACY_PARKED_FAILURE_CODES: ReadonlySet<string> = new Set([
  'engine_no_recent_rounds',
  'engine_membership_missing',
]);
