/**
 * Supabase Auth error classification — brief §10.
 *
 * "Stable Supabase Auth error codes, not text." supabase-js's `AuthApiError`
 * (and its subclasses `AuthApiError`/`AuthRetryableFetchError`/
 * `AuthWeakPasswordError`) carries a stable `code` string (GoTrue's error-code
 * catalogue, e.g. `invalid_credentials`, `refresh_token_not_found`) alongside
 * an HTTP `status`. Same discipline as `classify.ts`: `code` is read first and
 * primarily; `status` is the fallback for a code Helm has not enumerated
 * (GoTrue adds codes over time); `message` is the last resort only when
 * neither is present (a network-level `AuthRetryableFetchError` can lack
 * both).
 *
 * SCOPE — what this file does NOT decide
 * ---------------------------------------
 * "429 spikes" and "Auth 5xx" (brief §10) are RATE judgments, not per-call
 * ones — this file classifies ONE occurrence's mechanism (`invalid_grant` is
 * always the same kind of thing) and always returns the same severity for
 * the same code; whether five of them in a minute constitute a spike is an
 * alerting-layer decision (brief §49–55), not something a single call's
 * classifier can know. Same reasoning `classify.ts`'s header applies to
 * `23505`.
 *
 * CONTEXT-SENSITIVE CODES
 * ------------------------
 * `provider_disabled`/`signup_disabled` (brief: "disabled optional provider
 * the UI handles") are only EXPECTED when the caller says the provider is
 * optional (`providerOptional: true`) — a disabled provider on a REQUIRED
 * sign-in path is a real product defect, same asymmetry `classify.ts` uses
 * for `expectedAuthorizationDenial`.
 */
import type { Expectedness, Retryability, Severity } from './envelope';

export type AuthOperation =
  | 'sign_in'
  | 'sign_up'
  | 'sign_out'
  | 'refresh_session'
  | 'oauth_callback'
  | 'otp_verify'
  | 'otp_send'
  | 'password_reset'
  | 'admin'
  | 'get_session'
  | 'get_user';

export type AuthErrorFamily =
  | 'invalid_credentials'
  | 'unconfirmed'
  | 'otp'
  | 'rate_limit'
  | 'session'
  | 'oauth'
  | 'provider_disabled'
  | 'validation'
  | 'authorization'
  | 'server_error'
  | 'network'
  | 'unknown';

export interface MinimalAuthError {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  /** True for `AuthRetryableFetchError` / `isAuthRetryableFetchError` — a
   *  transport failure that never reached GoTrue, distinct from a GoTrue
   *  response carrying an error code. supabase-js exposes this as a type
   *  guard, not a field, so callers pass the guard's result through here. */
  isRetryableFetchError?: boolean;
}

export interface ClassifyAuthContext {
  operation: AuthOperation;
  feature: string;
  action: string;
  /** This call site treats the provider/flow as optional — the UI already
   *  offers a fallback, so `provider_disabled`/`signup_disabled` here is
   *  EXPECTED rather than a defect. Default false (unexpected). */
  providerOptional?: boolean;
}

export interface AuthClassificationResult {
  authCode: string | null;
  httpStatus: number | null;
  /** Canonical short code stored on the envelope's `code` field. */
  code: string;
  family: AuthErrorFamily;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  normalizedMessage: string;
}

/** GoTrue codes brief §10 names as EXPECTED/LOW — never a Sentry issue, never
 *  a durable event, matching `observeAuthResult`'s expected_control_flow
 *  bucket. */
const EXPECTED_LOW_CODES = new Set(['invalid_credentials', 'otp_expired', 'invalid_otp', 'same_password']);

/** Codes GoTrue returns for a session that has simply ended (routine
 *  recovery, not a defect) — a caller re-authenticates and moves on. */
const ROUTINE_SESSION_CODES = new Set(['session_not_found', 'session_expired']);

function classifyByCode(code: string, ctx: ClassifyAuthContext): Omit<AuthClassificationResult, 'authCode' | 'httpStatus' | 'normalizedMessage'> {
  if (EXPECTED_LOW_CODES.has(code)) {
    return { code, family: 'invalid_credentials', severity: 'info', expectedness: 'expected', retryability: 'no' };
  }
  if (code === 'email_not_confirmed') {
    return { code, family: 'unconfirmed', severity: 'info', expectedness: 'expected', retryability: 'conditional' };
  }
  if (ROUTINE_SESSION_CODES.has(code)) {
    return { code, family: 'session', severity: 'info', expectedness: 'routine_recovery', retryability: 'yes' };
  }
  if (code === 'provider_disabled' || code === 'signup_disabled') {
    return ctx.providerOptional
      ? { code, family: 'provider_disabled', severity: 'info', expectedness: 'expected', retryability: 'no' }
      : { code, family: 'provider_disabled', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }

  // Refresh/session failures — brief §10's "refresh/session failures spiking
  // after a release" and "misclassified as sign-out" are both about THIS
  // family: a token/session mechanism failing is never routine on its own,
  // even though a single occurrence is a normal part of token rotation edge
  // cases (hence 'conditional' retryability rather than 'no').
  if (code === 'refresh_token_not_found' || code === 'refresh_token_already_used' || code === 'bad_jwt' || code === 'session_not_found') {
    return { code, family: 'session', severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (code === 'over_email_send_rate_limit' || code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit') {
    return { code, family: 'rate_limit', severity: 'warning', expectedness: 'unexpected', retryability: 'yes' };
  }

  if (code === 'flow_state_not_found' || code === 'flow_state_expired' || code === 'bad_oauth_callback' || code === 'bad_oauth_state') {
    // Brief §10: "bad OAuth callback/state from app code" — always actionable,
    // never a routine user action (the user didn't type this wrong).
    return { code, family: 'oauth', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }

  if (code === 'validation_failed' || code === 'weak_password' || code === 'bad_json' || code === 'email_address_invalid') {
    return { code, family: 'validation', severity: 'info', expectedness: 'expected', retryability: 'no' };
  }

  if (code === 'not_admin' || code === 'no_authorization' || code === 'user_banned') {
    return { code, family: 'authorization', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }

  if (code === 'request_timeout') {
    return { code, family: 'network', severity: 'warning', expectedness: 'unexpected', retryability: 'yes' };
  }

  if (code === 'unexpected_failure') {
    // Brief §10: "DB-trigger failure causing Auth 500" lands here — GoTrue's
    // catch-all for a server-side failure it cannot attribute to the caller.
    return { code, family: 'server_error', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }

  return { code, family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

function classifyByStatus(status: number): Omit<AuthClassificationResult, 'authCode' | 'httpStatus' | 'normalizedMessage'> {
  if (status >= 500) {
    return { code: `http_${status}`, family: 'server_error', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (status === 429) {
    return { code: 'http_429', family: 'rate_limit', severity: 'warning', expectedness: 'unexpected', retryability: 'yes' };
  }
  if (status === 401 || status === 403) {
    return { code: `http_${status}`, family: 'authorization', severity: 'warning', expectedness: 'unknown', retryability: 'no' };
  }
  if (status >= 400) {
    return { code: `http_${status}`, family: 'validation', severity: 'info', expectedness: 'unknown', retryability: 'no' };
  }
  return { code: `http_${status}`, family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

/**
 * Classifies one Supabase Auth error. Never throws — runs inside an
 * error-handling branch, same contract as `classifyPostgrestError`.
 */
export function classifyAuthError(error: MinimalAuthError, ctx: ClassifyAuthContext): AuthClassificationResult {
  try {
    const message = error.message ?? 'unknown_auth_error';

    if (error.isRetryableFetchError) {
      return {
        authCode: null,
        httpStatus: error.status ?? null,
        code: 'network_retryable',
        family: 'network',
        severity: 'warning',
        expectedness: 'unexpected',
        retryability: 'yes',
        normalizedMessage: message,
      };
    }

    const code = (error.code ?? '').trim();
    if (code.length > 0) {
      const classified = classifyByCode(code, ctx);
      return { ...classified, authCode: code, httpStatus: error.status ?? null, normalizedMessage: message };
    }

    if (typeof error.status === 'number') {
      const classified = classifyByStatus(error.status);
      return { ...classified, authCode: null, httpStatus: error.status, normalizedMessage: message };
    }

    return {
      authCode: null,
      httpStatus: null,
      code: 'unknown',
      family: 'unknown',
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: message,
    };
  } catch {
    return {
      authCode: null,
      httpStatus: null,
      code: 'classifier_failure',
      family: 'unknown',
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: 'classifier_failure',
    };
  }
}
