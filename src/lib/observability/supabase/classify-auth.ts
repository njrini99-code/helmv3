/**
 * Supabase Auth error classification — brief §10.
 *
 * "Stable Supabase Auth error codes, not text." `error.code` (the stable
 * string Supabase Auth started shipping on `AuthApiError` — `invalid_credentials`,
 * `over_request_rate_limit`, etc.) is the PRIMARY signal, exactly like
 * `classify.ts`'s SQLSTATE table. `error.status` (HTTP status) is the
 * fallback when a code is missing, and free-text message matching is the
 * last resort — same three-tier priority `classify.ts` documents, applied to
 * a different error family.
 *
 * SOURCE OF THE CODE TABLE (brief's own instruction: fetch, don't recall)
 * -------------------------------------------------------------------------
 * Fetched 2026-09-03 from
 * https://supabase.com/docs/guides/auth/debugging/error-codes.md — the
 * complete `code` table Supabase Auth documents today, cross-checked for the
 * `hook_*` family (a second, narrower fetch, same date, same URL). Every
 * `expected*`/`Actionable` code named in this file's classification table is
 * one this fetch actually returned; nothing here is from training-data
 * recall. Two things that page does NOT give: a per-code HTTP status (the
 * docs state error objects expose `code`/`status`/`message` but the table
 * itself carries no status column), and `hook_timeout_after_retry`, the
 * mfa_ and sso_ code families were only surfaced by a second, narrower fetch — recorded here so a
 * future re-verification knows to ask specifically. See
 * `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` for the fetch date
 * ledger shared across all four B-track classifiers.
 *
 * CONTEXT-SENSITIVE CODES, SAME DISCIPLINE AS classify.ts
 * -----------------------------------------------------------
 * A handful of Auth codes are not a defect OR routine on their own — the
 * calling code states which, and the default (silence) is always the
 * UNEXPECTED/actionable branch, never the quiet one. Getting this backwards
 * either pages someone for a normal invalid-password attempt, or hides a
 * real authentication defect behind "well it's just a 401" — see
 * `classify.ts`'s header for why silence is never treated as evidence of
 * routineness.
 *
 * NEVER LOGS AN AUTH MESSAGE RAW. `normalizedMessage` here is NOT sanitized
 * — same contract as `classify.ts`'s `ClassificationResult.normalizedMessage`
 * — sanitization happens once, in `buildSupabaseErrorEnvelope`
 * (`envelope.ts`). `observeAuthResult` (this directory) never logs this raw
 * message to `helmLog`; it logs only code/feature/action/service/operation,
 * because an Auth message routinely embeds an email address.
 */
import type { Expectedness, Retryability, Severity } from './envelope';

export interface MinimalAuthError {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  name?: string | null;
}

export type AuthOperationKind =
  | 'sign_in'
  | 'sign_up'
  | 'sign_out'
  | 'session_refresh'
  | 'oauth'
  | 'mfa'
  | 'password_reset'
  | 'other';

export interface ClassifyAuthContext {
  feature: string;
  action: string;
  operation?: AuthOperationKind;
  /** A missing/expired session at this call site is routine (e.g. sign-out
   *  on an already-expired session, a background session check). */
  expectedSessionAbsence?: boolean;
  /** `provider_disabled` is expected here because the UI already hides this
   *  provider's option when it is disabled — the server rejecting it is not
   *  new information. */
  expectedProviderDisabled?: boolean;
  /** This specific 429 is a caller-identified spike (bulk operation, known
   *  load event) rather than an ordinary rate-limit hit. */
  isRateLimitSpike?: boolean;
  /** This call site is unauthenticated BY DESIGN — a `bad_jwt`/`no_authorization`
   *  here is not a defect. Default is false: a path is assumed to require
   *  authentication unless the caller says otherwise (same "default toward
   *  unexpected" discipline as `classify.ts`). */
  expectedUnauthenticated?: boolean;
}

export interface AuthClassificationResult {
  authCode: string | null;
  httpStatus: number | null;
  /** Canonical short code for the envelope's `code` field: `authCode` when
   *  present, else `http_<status>`, else a short fallback label. */
  code: string;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  /** False for the two refresh-token codes and nothing else in this table —
   *  brief §10: "warning, terminal false" for refresh/session-expiry
   *  failures, because a fresh sign-in still recovers the journey. Every
   *  other actionable code defaults terminal:true. */
  terminal: boolean;
  /** Raw message, NOT sanitized — see file header. */
  normalizedMessage: string;
}

type CodeResult = Omit<AuthClassificationResult, 'authCode' | 'httpStatus' | 'normalizedMessage'>;

/** Codes fetched from the docs (see file header) that are routine control
 *  flow REGARDLESS of context — sign-in/sign-up UX handles all of these as
 *  ordinary form validation, not an incident. */
const UNCONDITIONALLY_EXPECTED_CODES = new Set([
  'invalid_credentials',
  'otp_expired',
  'email_not_confirmed',
  'weak_password',
  'validation_failed',
  'same_password',
  'email_exists',
  'email_address_invalid',
  'flow_state_expired',
  'flow_state_not_found',
  'bad_code_verifier',
]);

function classifyByCode(code: string, ctx: ClassifyAuthContext): CodeResult {
  if (UNCONDITIONALLY_EXPECTED_CODES.has(code)) {
    return { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true };
  }

  if (code === 'user_not_found') {
    // Expected: a sign-in probe for an unregistered email. Unexpected: the
    // SAME code on a path that assumed an authenticated/known user already
    // exists (e.g. profile lookup mid-session) — that is a real defect.
    return ctx.operation === 'sign_in'
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'session_not_found') {
    return ctx.operation === 'sign_out' || ctx.expectedSessionAbsence
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'provider_disabled') {
    return ctx.expectedProviderDisabled
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'over_request_rate_limit') {
    return {
      code,
      severity: ctx.isRateLimitSpike ? 'critical' : 'warning',
      expectedness: 'unexpected',
      retryability: 'conditional',
      terminal: true,
    };
  }

  if (code === 'unexpected_failure') {
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional', terminal: true };
  }

  if (code === 'bad_oauth_state' || code === 'bad_oauth_callback') {
    return { code, severity: 'error', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'refresh_token_not_found' || code === 'refresh_token_already_used') {
    // brief §10: "warning, terminal false" — a fresh sign-in still recovers
    // this journey, so it must not be marked as the end of the road.
    return { code, severity: 'warning', expectedness: 'unexpected', retryability: 'conditional', terminal: false };
  }

  if (code === 'hook_timeout' || code === 'hook_timeout_after_retry') {
    return { code, severity: 'error', expectedness: 'unexpected', retryability: 'conditional', terminal: true };
  }

  if (code === 'hook_payload_over_size_limit' || code === 'hook_payload_invalid_content_type') {
    // A config/integration defect (the hook payload shape is wrong), not a
    // transient condition — retrying the same request will not help.
    return { code, severity: 'error', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'bad_jwt' || code === 'no_authorization') {
    return ctx.expectedUnauthenticated
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true }
      : { code, severity: 'error', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }

  if (code === 'captcha_failed' || code === 'bad_json' || code === 'conflict') {
    return { code, severity: 'warning', expectedness: 'unexpected', retryability: 'conditional', terminal: true };
  }

  // Any other documented-but-untabled code (mfa_*, sso_*, email_provider_disabled,
  // anonymous_provider_disabled, …): unknown expectedness, never dropped —
  // same "unknown lands in an actionable bucket" rule classify.ts uses.
  return { code, severity: 'warning', expectedness: 'unknown', retryability: 'unknown', terminal: true };
}

/** Fallback ONLY when `error.code` is absent — HTTP status is the next-best
 *  stable signal Supabase Auth exposes. */
function classifyByStatus(status: number, ctx: ClassifyAuthContext): CodeResult {
  const code = `http_${status}`;
  if (status === 429) {
    return {
      code,
      severity: ctx.isRateLimitSpike ? 'critical' : 'warning',
      expectedness: 'unexpected',
      retryability: 'conditional',
      terminal: true,
    };
  }
  if (status >= 500) {
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional', terminal: true };
  }
  if (status === 401) {
    return ctx.expectedUnauthenticated
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true }
      : { code, severity: 'error', expectedness: 'unexpected', retryability: 'no', terminal: true };
  }
  if (status === 400 || status === 422) {
    return { code, severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true };
  }
  return { code, severity: 'warning', expectedness: 'unknown', retryability: 'unknown', terminal: true };
}

/** Last resort, only when both `code` and `status` are absent. */
function classifyByMessageFallback(message: string): CodeResult {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return { code: 'unknown_invalid_credentials', severity: 'info', expectedness: 'expected', retryability: 'no', terminal: true };
  }
  if (lower.includes('rate limit')) {
    return { code: 'unknown_rate_limit', severity: 'warning', expectedness: 'unexpected', retryability: 'conditional', terminal: true };
  }
  if (lower.includes('expired')) {
    return { code: 'unknown_expired', severity: 'warning', expectedness: 'unexpected', retryability: 'conditional', terminal: false };
  }
  return { code: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown', terminal: true };
}

/**
 * Classifies a Supabase Auth error. `error.code` first, `error.status`
 * fallback, message fallback last. Never throws — an unparseable input
 * classifies as `expectedness: 'unknown'` rather than raising into the
 * caller's error-handling branch (same contract as `classifyPostgrestError`).
 */
export function classifyAuthError(error: MinimalAuthError, ctx: ClassifyAuthContext): AuthClassificationResult {
  try {
    const rawCode = (error.code ?? '').trim();
    const status = typeof error.status === 'number' ? error.status : null;
    const message = error.message ?? 'unknown_error';

    if (rawCode.length > 0) {
      const classified = classifyByCode(rawCode, ctx);
      return { ...classified, authCode: rawCode, httpStatus: status, normalizedMessage: message };
    }

    if (status !== null) {
      const classified = classifyByStatus(status, ctx);
      return { ...classified, authCode: null, httpStatus: status, normalizedMessage: message };
    }

    const fallback = classifyByMessageFallback(message);
    return { ...fallback, authCode: null, httpStatus: null, normalizedMessage: message };
  } catch {
    return {
      authCode: null,
      httpStatus: null,
      code: 'classifier_failure',
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      terminal: true,
      normalizedMessage: 'classifier_failure',
    };
  }
}
