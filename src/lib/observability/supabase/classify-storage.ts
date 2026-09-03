/**
 * Supabase Storage error classification — brief §11.
 *
 * "Normalize modern Storage codes" — `StorageApiError`/`StorageUnknownError`
 * carry a `statusCode` (string-typed HTTP status, per storage-js) and, for
 * the modern storage-api error shape, an `error` field that IS the stable
 * code (`NoSuchBucket`, `InvalidJWT`, `AccessDenied`, …) — storage-js
 * confusingly names this `error` rather than `code`; this file's
 * `MinimalStorageError.code` is what a call site should map that onto.
 *
 * CLASSIFICATION DEPENDS ON ACTION (brief §11), NOT ON CODE ALONE
 * ------------------------------------------------------------------
 * "absent avatar 404 expected; required team document missing
 * warning/error" — the SAME `NoSuchKey`/`NoSuchBucket` code means different
 * things depending on whether the caller expected the object might not
 * exist. `expectedMissingObject` carries that, same asymmetry pattern as
 * `classify.ts`'s `expectedAuthorizationDenial` for 42501. Likewise
 * `expectedAlreadyExists` for `ResourceAlreadyExists` on an idempotent
 * upsert (brief: "routine").
 */
import type { Expectedness, Retryability, Severity } from './envelope';

export type StorageOperation = 'upload' | 'download' | 'remove' | 'list' | 'move' | 'copy' | 'create_signed_url';

export type StorageErrorFamily =
  | 'not_found'
  | 'auth'
  | 'infrastructure'
  | 'capacity'
  | 'conflict'
  | 'unknown';

export interface MinimalStorageError {
  /** The storage-api stable code (`NoSuchBucket`, `InvalidJWT`, …) — see
   *  file header for the storage-js `error`-vs-`code` naming note. */
  code?: string | null;
  statusCode?: string | number | null;
  message?: string | null;
}

export interface ClassifyStorageContext {
  operation: StorageOperation;
  feature: string;
  action: string;
  bucketClass: string;
  /** This call expects the object might legitimately not exist (an avatar
   *  lookup, an optional attachment) — NoSuchKey/NoSuchBucket here is
   *  routine, not a defect. Default false (unexpected — a required object
   *  missing IS a defect). */
  expectedMissingObject?: boolean;
  /** This call is an idempotent upsert that may race with itself —
   *  ResourceAlreadyExists here is routine. Default false. */
  expectedAlreadyExists?: boolean;
}

export interface StorageClassificationResult {
  storageCode: string | null;
  httpStatus: number | null;
  code: string;
  family: StorageErrorFamily;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  normalizedMessage: string;
}

function parseStatus(statusCode: string | number | null | undefined): number | null {
  if (typeof statusCode === 'number') return statusCode;
  if (typeof statusCode === 'string') {
    const parsed = Number.parseInt(statusCode, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function classifyByCode(
  code: string,
  ctx: ClassifyStorageContext,
): Omit<StorageClassificationResult, 'storageCode' | 'httpStatus' | 'normalizedMessage'> {
  if (code === 'NoSuchBucket' || code === 'NoSuchKey' || code === 'ObjectNotFound') {
    return ctx.expectedMissingObject
      ? { code, family: 'not_found', severity: 'info', expectedness: 'expected', retryability: 'no' }
      : { code, family: 'not_found', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }
  if (code === 'ResourceAlreadyExists') {
    return ctx.expectedAlreadyExists
      ? { code, family: 'conflict', severity: 'info', expectedness: 'routine_recovery', retryability: 'no' }
      : { code, family: 'conflict', severity: 'warning', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (code === 'InvalidJWT' || code === 'AccessDenied') {
    // Brief §11: "AccessDenied on the user's own path likely RLS/auth
    // defect" — always unexpected. No caller-declared "expected denial"
    // escape hatch here (unlike PostgREST 42501): a user's own Storage
    // path denying them is never a normal probe the product performs.
    return { code, family: 'auth', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }
  if (code === 'DatabaseTimeout') {
    // Brief §11: "infrastructure incident" — always critical.
    return { code, family: 'infrastructure', severity: 'critical', expectedness: 'unexpected', retryability: 'yes' };
  }
  if (code === 'DatabaseError' || code === 'InternalError') {
    return { code, family: 'infrastructure', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (code === 'ResourceLocked') {
    return { code, family: 'conflict', severity: 'warning', expectedness: 'unexpected', retryability: 'yes' };
  }
  if (code === 'EntityTooLarge') {
    return { code, family: 'capacity', severity: 'warning', expectedness: 'expected', retryability: 'no' };
  }
  return { code, family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

function classifyByStatus(status: number): Omit<StorageClassificationResult, 'storageCode' | 'httpStatus' | 'normalizedMessage'> {
  if (status >= 500) {
    return { code: `http_${status}`, family: 'infrastructure', severity: 'critical', expectedness: 'unexpected', retryability: 'conditional' };
  }
  if (status === 404) {
    return { code: 'http_404', family: 'not_found', severity: 'warning', expectedness: 'unknown', retryability: 'no' };
  }
  if (status === 401 || status === 403) {
    return { code: `http_${status}`, family: 'auth', severity: 'error', expectedness: 'unexpected', retryability: 'no' };
  }
  return { code: `http_${status}`, family: 'unknown', severity: 'warning', expectedness: 'unknown', retryability: 'unknown' };
}

/** Never throws — same contract as `classifyPostgrestError`/`classifyAuthError`. */
export function classifyStorageError(error: MinimalStorageError, ctx: ClassifyStorageContext): StorageClassificationResult {
  try {
    const message = error.message ?? 'unknown_storage_error';
    const httpStatus = parseStatus(error.statusCode);
    const code = (error.code ?? '').trim();

    if (code.length > 0) {
      const classified = classifyByCode(code, ctx);
      return { ...classified, storageCode: code, httpStatus, normalizedMessage: message };
    }
    if (httpStatus !== null) {
      const classified = classifyByStatus(httpStatus);
      return { ...classified, storageCode: null, httpStatus, normalizedMessage: message };
    }
    return {
      storageCode: null,
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
      storageCode: null,
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
