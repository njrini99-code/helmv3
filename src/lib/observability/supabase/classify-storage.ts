/**
 * Supabase Storage error classification — brief §11.
 *
 * Keys on `StorageApiError.code` (the service-specific string — `NoSuchKey`,
 * `AccessDenied`, `ResourceAlreadyExists`, …) first, `.status` (HTTP status)
 * as fallback, message match last. Same three-tier priority `classify.ts`
 * and `classify-auth.ts` use, applied to `@supabase/storage-js`'s
 * `StorageApiError` shape (`node_modules/@supabase/storage-js/src/lib/common/errors.ts`:
 * `code: string | undefined`, `status: number`, `statusCode: string` — that
 * last one is confusingly a STRING mirror of the HTTP status, not the same
 * thing as `code`; this file never reads it).
 *
 * SOURCE OF THE CODE TABLE
 * -------------------------
 * Fetched 2026-09-03 from
 * https://supabase.com/docs/guides/storage/debugging/error-codes.md — the
 * complete `ErrorCode`/`StatusCode` table that page documents today. One
 * exception: `TusError`, named in the B2 brief text, is NOT in that fetched
 * table — the fetch's own summary says so explicitly ("The documentation
 * does not list a TusError code"). It is included below anyway (Supabase
 * Storage's resumable-upload path does emit TUS-protocol errors in
 * practice) but classified generically and flagged NOT VERIFIED against the
 * current docs in `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md`.
 *
 * ACCESSDENIED DEFAULTS THE OPPOSITE WAY FROM classify.ts's 42501
 * --------------------------------------------------------------------
 * `classify.ts`'s 42501 (Postgres insufficient_privilege) defaults to
 * UNEXPECTED — "silence is not evidence of routineness" — because a Postgres
 * RLS denial usually means the caller reached for a row it should not
 * assume exists. Storage `AccessDenied` is different in practice: Storage
 * buckets are overwhelmingly single-owner paths (a private avatar bucket, a
 * per-team document bucket) where a denial on someone ELSE's object is the
 * routine, working-as-intended RLS boundary — the surprising, actionable
 * case is a caller denied access to what SHOULD be their own path (brief
 * §11: "AccessDenied on the user's own path likely RLS/auth defect"). So
 * this file inverts the default deliberately, not by oversight:
 * `accessDeniedOnOwnPath` is what escalates it, not what's needed to
 * silence it.
 */
import type { Expectedness, Retryability, Severity } from './envelope';

export interface MinimalStorageError {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

export interface ClassifyStorageContext {
  feature: string;
  action: string;
  /** A missing object here is an expected "may or may not exist" probe
   *  (an optional avatar, a cache check) rather than a required resource.
   *  Default false: a missing object is assumed to matter unless the
   *  caller says otherwise (same "default toward unexpected" discipline
   *  every classifier in this directory uses). */
  expectedMissingObject?: boolean;
  /** `ResourceAlreadyExists`/`KeyAlreadyExists`/`BucketAlreadyExists` here is
   *  a declared idempotent-upsert retry, not a race. */
  idempotentUpsert?: boolean;
  /** This `AccessDenied` is happening on a path the CALLER OWNS — the one
   *  case Storage AccessDenied should NOT be treated as routine. See file
   *  header for why the default is inverted from classify.ts's 42501. */
  accessDeniedOnOwnPath?: boolean;
}

export interface StorageClassificationResult {
  storageCode: string | null;
  httpStatus: number | null;
  code: string;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  normalizedMessage: string;
}

type CodeResult = Omit<StorageClassificationResult, 'storageCode' | 'httpStatus' | 'normalizedMessage'>;

const MISSING_OBJECT_CODES = new Set(['NoSuchBucket', 'NoSuchKey', 'NoSuchUpload', 'TenantNotFound']);
const ALREADY_EXISTS_CODES = new Set(['ResourceAlreadyExists', 'KeyAlreadyExists', 'BucketAlreadyExists']);
/** Routine client-side input validation the server also enforces — not
 *  meaningfully different from a form-validation rejection. */
const EXPECTED_VALIDATION_CODES = new Set(['EntityTooLarge', 'InvalidMimeType']);
/** A request the caller's OWN code built incorrectly — worth seeing, not
 *  urgent. */
const MALFORMED_REQUEST_CODES = new Set([
  'InvalidRequest',
  'InvalidBucketName',
  'InvalidKey',
  'InvalidRange',
  'MissingContentLength',
  'MissingParameter',
  'InvalidUploadId',
  'InvalidChecksum',
  'MissingPart',
]);
/** A genuine signing/auth defect in how the request was constructed. */
const SIGNATURE_CODES = new Set(['InvalidSignature', 'SignatureDoesNotMatch', 'InvalidUploadSignature']);
/** Backend-infra faults this app cannot fix by retrying differently. */
const INFRA_CODES = new Set(['InternalError', 'S3Error', 'S3InvalidAccessKeyId', 'S3MaximumCredentialsLimit']);
/** Contention on the same object — transient, safe to retry after a beat. */
const LOCK_CODES = new Set(['ResourceLocked', 'LockTimeout']);

function classifyByCode(code: string, ctx: ClassifyStorageContext): CodeResult {
  if (MISSING_OBJECT_CODES.has(code)) {
    return ctx.expectedMissingObject
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no' }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
  }

  if (ALREADY_EXISTS_CODES.has(code)) {
    return ctx.idempotentUpsert
      ? { code, severity: 'info', expectedness: 'routine_recovery', retryability: 'no' }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (code === 'DatabaseTimeout') {
    // Not context-dependent — this is Storage's own metadata DB timing out,
    // an infrastructure incident regardless of what the caller was doing.
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (code === 'DatabaseError') {
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (code === 'AccessDenied') {
    // See file header: default is EXPECTED (routine cross-tenant RLS
    // boundary), and `accessDeniedOnOwnPath` is what escalates it.
    return ctx.accessDeniedOnOwnPath
      ? { code, severity: 'error', expectedness: 'unexpected', retryability: 'no' }
      : { code, severity: 'info', expectedness: 'expected', retryability: 'no' };
  }

  if (code === 'InvalidJWT') {
    return { code, severity: 'error', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (EXPECTED_VALIDATION_CODES.has(code)) {
    return { code, severity: 'info', expectedness: 'expected', retryability: 'no' };
  }

  if (MALFORMED_REQUEST_CODES.has(code)) {
    return { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
  }

  if (SIGNATURE_CODES.has(code)) {
    return { code, severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }

  if (INFRA_CODES.has(code)) {
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (LOCK_CODES.has(code)) {
    return { code, severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }

  if (code === 'SlowDown') {
    return { code, severity: 'warning', expectedness: 'unexpected', retryability: 'yes' };
  }

  if (code === 'TusError') {
    // NOT VERIFIED against the current docs table — see file header.
    return { code, severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
  }

  return { code, severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

function classifyByStatus(status: number, ctx: ClassifyStorageContext): CodeResult {
  const code = `http_${status}`;
  if (status === 404) {
    return ctx.expectedMissingObject
      ? { code, severity: 'info', expectedness: 'expected', retryability: 'no' }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'no' };
  }
  if (status === 409) {
    return ctx.idempotentUpsert
      ? { code, severity: 'info', expectedness: 'routine_recovery', retryability: 'no' }
      : { code, severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (status === 403) {
    return ctx.accessDeniedOnOwnPath
      ? { code, severity: 'error', expectedness: 'unexpected', retryability: 'no' }
      : { code, severity: 'info', expectedness: 'expected', retryability: 'no' };
  }
  if (status === 504 || status >= 500) {
    return { code, severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (status === 413 || status === 415) {
    return { code, severity: 'info', expectedness: 'expected', retryability: 'no' };
  }
  return { code, severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

function classifyByMessageFallback(message: string): CodeResult {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('does not exist')) {
    return { code: 'unknown_missing_object', severity: 'warning', expectedness: 'unknown', retryability: 'no' };
  }
  if (lower.includes('access denied') || lower.includes('permission')) {
    return { code: 'unknown_access_denied', severity: 'warning', expectedness: 'unknown', retryability: 'no' };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { code: 'unknown_timeout', severity: 'critical', expectedness: 'unknown', retryability: 'conditional' };
  }
  return { code: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

/**
 * Classifies a Supabase Storage error. `error.code` first, `error.status`
 * fallback, message match last. Never throws.
 */
export function classifyStorageError(
  error: MinimalStorageError,
  ctx: ClassifyStorageContext,
): StorageClassificationResult {
  try {
    const rawCode = (error.code ?? '').trim();
    const status = typeof error.status === 'number' ? error.status : null;
    const message = error.message ?? 'unknown_error';

    if (rawCode.length > 0) {
      const classified = classifyByCode(rawCode, ctx);
      return { ...classified, storageCode: rawCode, httpStatus: status, normalizedMessage: message };
    }
    if (status !== null) {
      const classified = classifyByStatus(status, ctx);
      return { ...classified, storageCode: null, httpStatus: status, normalizedMessage: message };
    }
    const fallback = classifyByMessageFallback(message);
    return { ...fallback, storageCode: null, httpStatus: null, normalizedMessage: message };
  } catch {
    return {
      storageCode: null,
      httpStatus: null,
      code: 'classifier_failure',
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: 'classifier_failure',
    };
  }
}
