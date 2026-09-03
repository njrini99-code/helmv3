/**
 * SQLSTATE / PostgREST classification — brief §9.
 *
 * "Codes are primary semantics; message matching is fallback." Everything
 * in this file keys off `error.code` (a SQLSTATE like `42501`, or a
 * PostgREST connection code like `PGRST002`) first. Message text is used
 * ONLY as a last resort, when a client/proxy layer swallowed the code, and
 * never to override a code that IS present.
 *
 * SCOPE (Phase 1): PostgREST/Postgres only. Auth/Storage/Realtime/Edge
 * Function classification (brief §10–13) is a later phase — this file has
 * nothing to say about an `AuthApiError` or a Storage `AccessDenied`.
 *
 * CONTEXT-SENSITIVE CODES (brief §9)
 * ------------------------------------
 * A handful of codes cannot be classified from the code alone:
 *   - 42501 (insufficient_privilege) — a denial on a path the product
 *     EXPECTS to sometimes deny (probing "can this user do X") is routine;
 *     the same code on a path that should always be authorized is a real
 *     defect. The caller states which via `expectedAuthorizationDenial`.
 *   - 23505 (unique_violation) — an idempotent create retried is normal;
 *     the same code inside a supposed single-writer creation may be a race.
 *     The caller states which via `expectedUniqueConflict`.
 *   - 23503 (foreign_key_violation) — usually a real defect (referencing
 *     something that should exist), occasionally an expected out-of-order
 *     client retry. `expectedForeignKeyViolation` covers the second case.
 * Getting the default wrong in either direction has a real cost: treating
 * every 42501 as a bug pages someone for routine authorization checks
 * (brief's own anti-pattern list); treating every 42501 as expected hides a
 * real authorization defect. Defaults below are UNEXPECTED unless the
 * caller states otherwise — silence is not evidence of routineness.
 */
import type { Expectedness, Retryability, Severity, SupabaseOperation } from './envelope';

export type SqlstateFamily =
  | 'connection'
  | 'postgrest_transport'
  | 'insufficient_resources'
  | 'deadlock'
  | 'serialization_failure'
  | 'statement_timeout'
  | 'schema_missing_object'
  | 'internal'
  | 'config'
  | 'authorization'
  | 'unique_violation'
  | 'foreign_key_violation'
  | 'check_violation'
  | 'data_exception'
  | 'raised_exception'
  | 'postgrest_other'
  | 'unknown';

export interface MinimalPostgrestError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface ClassifyContext {
  operation: SupabaseOperation;
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  /** This specific 42501 is an expected authorization boundary, not a defect. */
  expectedAuthorizationDenial?: boolean;
  /** This specific 23505 is an expected idempotent-create conflict, not a race. */
  expectedUniqueConflict?: boolean;
  /** This specific 23503 is an expected out-of-order-retry conflict, not a defect. */
  expectedForeignKeyViolation?: boolean;
}

export interface ClassificationResult {
  sqlstate: string | null;
  postgrestCode: string | null;
  /** Canonical short mechanism code stored on the envelope's `code` field —
   *  the SQLSTATE/PostgREST code itself when present, else a short label. */
  code: string;
  family: SqlstateFamily;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  /** Raw message, NOT sanitized — callers pass this through
   *  `sanitizeSupabaseFreeText` (envelope.ts) before persisting. */
  normalizedMessage: string;
}

/** True for a 5-character SQLSTATE (Postgres) as opposed to a PostgREST-native code. */
function isSqlstate(code: string): boolean {
  return /^[0-9A-Z]{5}$/.test(code);
}

const POSTGREST_TRANSPORT_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);

/**
 * The classification table. Ordered by specificity — an exact SQLSTATE/
 * PostgREST-code match wins over a class-prefix match (`08*`, `53*`, `XX*`,
 * `F0*`, `22*`).
 */
function classifyByCode(code: string, ctx: ClassifyContext): Omit<ClassificationResult, 'sqlstate' | 'postgrestCode' | 'normalizedMessage'> {
  // --- PostgREST transport / connection codes -------------------------------
  if (POSTGREST_TRANSPORT_CODES.has(code)) {
    return {
      code,
      family: 'postgrest_transport',
      severity: 'critical',
      expectedness: 'unexpected',
      retryability: 'conditional',
    };
  }

  // --- Context-sensitive codes, checked before the generic table -----------
  if (code === '42501') {
    return ctx.expectedAuthorizationDenial
      ? { code, family: 'authorization', severity: 'info', expectedness: 'expected', retryability: 'no' }
      : { code, family: 'authorization', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }
  if (code === '23505') {
    return ctx.expectedUniqueConflict
      ? { code, family: 'unique_violation', severity: 'info', expectedness: 'routine_recovery', retryability: 'no' }
      : { code, family: 'unique_violation', severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (code === '23503') {
    return ctx.expectedForeignKeyViolation
      ? { code, family: 'foreign_key_violation', severity: 'info', expectedness: 'routine_recovery', retryability: 'no' }
      : { code, family: 'foreign_key_violation', severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
  }

  // --- Exact-match SQLSTATEs --------------------------------------------------
  switch (code) {
    case '40P01': // deadlock_detected
      return { code, family: 'deadlock', severity: 'error', expectedness: 'unexpected', retryability: 'yes' };
    case '40001': // serialization_failure
      return { code, family: 'serialization_failure', severity: 'warning', expectedness: 'routine_recovery', retryability: 'yes' };
    case '57014': // query_canceled (statement_timeout)
      return { code, family: 'statement_timeout', severity: 'error', expectedness: 'unexpected', retryability: 'conditional' };
    case '53400': // config_limit_exceeded
      return { code, family: 'insufficient_resources', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
    case '42P01': // undefined_table
      return { code, family: 'schema_missing_object', severity: 'critical', expectedness: 'unexpected', retryability: 'no' };
    case '42703': // undefined_column
      return { code, family: 'schema_missing_object', severity: 'critical', expectedness: 'unexpected', retryability: 'no' };
    case '42883': // undefined_function
      return { code, family: 'schema_missing_object', severity: 'critical', expectedness: 'unexpected', retryability: 'no' };
    case '42P17': // invalid_object_definition (infinite recursion, e.g. RLS policy)
      return { code, family: 'schema_missing_object', severity: 'critical', expectedness: 'unexpected', retryability: 'no' };
    case '23514': // check_violation
      return { code, family: 'check_violation', severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
    case 'P0001': // raise_exception (custom RAISE in PL/pgSQL — business rule)
      return { code, family: 'raised_exception', severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
    default:
      break;
  }

  // --- Class-prefix SQLSTATEs -------------------------------------------------
  if (isSqlstate(code)) {
    if (code.startsWith('08')) {
      return { code, family: 'connection', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
    }
    if (code.startsWith('53')) {
      return { code, family: 'insufficient_resources', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
    }
    if (code.startsWith('XX')) {
      return { code, family: 'internal', severity: 'critical', expectedness: 'unexpected', retryability: 'unknown' };
    }
    if (code.startsWith('F0')) {
      return { code, family: 'config', severity: 'critical', expectedness: 'unexpected', retryability: 'no' };
    }
    if (code.startsWith('22')) {
      return { code, family: 'data_exception', severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
    }
  }

  // --- Other PostgREST-native codes (PGRST1xx/2xx and friends) --------------
  if (code.startsWith('PGRST')) {
    return { code, family: 'postgrest_other', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
  }

  return { code, family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

/**
 * Fallback ONLY when `error.code` is absent — a client/proxy layer that
 * swallowed the code before it reached this call site. Message matching is
 * explicitly the fallback path, never the primary one (file header).
 */
function classifyByMessageFallback(message: string): Omit<ClassificationResult, 'sqlstate' | 'postgrestCode' | 'normalizedMessage'> {
  const lower = message.toLowerCase();
  if (lower.includes('permission denied') || lower.includes('insufficient_privilege')) {
    return { code: 'unknown_authorization', family: 'authorization', severity: 'error', expectedness: 'unknown', retryability: 'no' };
  }
  if (lower.includes('deadlock')) {
    return { code: 'unknown_deadlock', family: 'deadlock', severity: 'error', expectedness: 'unknown', retryability: 'yes' };
  }
  if (lower.includes('timeout') || lower.includes('canceling statement')) {
    return { code: 'unknown_timeout', family: 'statement_timeout', severity: 'error', expectedness: 'unknown', retryability: 'conditional' };
  }
  if (lower.includes('does not exist')) {
    return { code: 'unknown_missing_object', family: 'schema_missing_object', severity: 'critical', expectedness: 'unknown', retryability: 'no' };
  }
  return { code: 'unknown', family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

/**
 * Classifies a PostgREST/Postgres error. `error.code` is read first and
 * exclusively for the mechanism decision; `error.message` is consulted only
 * when `code` is missing. Never throws — an unparseable input classifies as
 * `family: 'unknown'` rather than raising into the caller's error path
 * (this function runs INSIDE an error-handling branch; it must not itself
 * become a new failure).
 */
export function classifyPostgrestError(error: MinimalPostgrestError, ctx: ClassifyContext): ClassificationResult {
  try {
    const rawCode = (error.code ?? '').trim();
    const message = error.message ?? 'unknown_error';

    if (rawCode.length === 0) {
      const fallback = classifyByMessageFallback(message);
      return { ...fallback, sqlstate: null, postgrestCode: null, normalizedMessage: message };
    }

    const classified = classifyByCode(rawCode, ctx);
    const sqlstateValue = isSqlstate(rawCode) ? rawCode : null;
    const postgrestCodeValue = !isSqlstate(rawCode) ? rawCode : null;

    return {
      ...classified,
      sqlstate: sqlstateValue,
      postgrestCode: postgrestCodeValue,
      normalizedMessage: message,
    };
  } catch {
    return {
      sqlstate: null,
      postgrestCode: null,
      code: 'classifier_failure',
      family: 'unknown',
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: 'classifier_failure',
    };
  }
}
