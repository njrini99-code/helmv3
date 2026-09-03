import 'server-only';

/**
 * `observeStorageResult` — brief §11's Storage capture. Same shape as
 * `observeAuthResult`/`observeSupabaseResult`: classify
 * (`classify-storage.ts`), metric (`recordDbFailure` — Storage has no
 * dedicated `helm.storage.*` family yet; reusing the DB-failure counter with
 * `operation` set to the Storage action keeps one counter family per brief
 * §36-39 rather than adding a fourth), log, best-effort out-of-band write.
 *
 * PRIVACY (brief §6, §11): "Never store a full private object key unless
 * necessary; use `bucket=golf-media object_class=player_avatar
 * operation=upload`." This file never accepts a raw object path — only
 * `bucketClass` (a caller-supplied SAFE label, e.g. `player_avatar`), which
 * becomes `envelope.bucketClass`. There is no field anywhere in this module
 * a call site could put a real Storage key into.
 */
import { recordDbFailure } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import { buildSupabaseErrorEnvelope, type SupabaseErrorEnvelope } from './envelope';
import { classifyStorageError, type ClassifyStorageContext, type MinimalStorageError, type StorageOperation } from './classify-storage';
import { scheduleDbErrorRecording } from './record-db-error';
import { resolveEnvironment, resolveReleaseSha, resolveRuntime } from './runtime-context';
import { classifyBucket, type SupabaseFailureBucket } from './observe-result';

export interface ObserveStorageResultInput {
  error: MinimalStorageError | null | undefined;
  operation: StorageOperation;
  feature: string;
  action: string;
  /** Safe label only — e.g. `player_avatar`, `recruit_document`. NEVER a
   *  real bucket name or object path (see file header). */
  bucketClass: string;
  sport?: string | null;
  journey?: string | null;
  durationMs?: number | null;
  helmTraceId?: string | null;
  expectedMissingObject?: boolean;
  expectedAlreadyExists?: boolean;
}

export interface ObserveStorageResultOutcome {
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

export function observeStorageResult(input: ObserveStorageResultInput): ObserveStorageResultOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const ctx: ClassifyStorageContext = {
      operation: input.operation,
      feature: input.feature,
      action: input.action,
      bucketClass: input.bucketClass,
      expectedMissingObject: input.expectedMissingObject,
      expectedAlreadyExists: input.expectedAlreadyExists,
    };
    const classification = classifyStorageError(input.error, ctx);
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    const runtime = resolveRuntime();
    const environment = resolveEnvironment();

    recordDbFailure({
      feature: input.feature,
      action: input.action,
      errorCode: classification.code,
      durationMs: input.durationMs ?? undefined,
      sport: input.sport ?? undefined,
      environment,
      operation: input.operation,
      runtime,
    });

    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const releaseSha = resolveReleaseSha();
    const correlation = getSentryCorrelation();

    const envelope = buildSupabaseErrorEnvelope({
      service: 'storage',
      environment,
      releaseSha,
      runtime,
      sport: input.sport ?? null,
      feature: input.feature,
      action: input.action,
      journey: input.journey ?? null,
      operation: input.operation === 'upload' || input.operation === 'download' ? input.operation : 'invoke',
      relation: null,
      rpc: null,
      functionName: null,
      bucketClass: input.bucketClass,
      code: classification.code,
      sqlstate: null,
      postgrestCode: null,
      authCode: null,
      storageCode: classification.storageCode,
      httpStatus: classification.httpStatus,
      retryability: classification.retryability,
      expectedness: classification.expectedness,
      severity: classification.severity,
      normalizedMessage: classification.normalizedMessage,
      safeDetails: null,
      safeHint: null,
      sentryTraceId: correlation?.traceId ?? null,
      sentrySpanId: correlation?.spanId ?? null,
      helmTraceId: input.helmTraceId ?? null,
      durationMs: input.durationMs ?? null,
      attempt: null,
      terminal: true,
      safeMetadata: null,
    });

    const logFn = bucket === 'actionable_warning' ? helmLog.warn : helmLog.error;
    logFn('supabase.storage_error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      runtime,
      service: 'storage',
      operation: input.operation,
    });

    scheduleDbErrorRecording(envelope);

    return { observed: true, bucket, envelope };
  } catch {
    return { observed: false, bucket: null, envelope: null };
  }
}
