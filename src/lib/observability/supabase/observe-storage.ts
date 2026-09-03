import 'server-only';

/**
 * `observeStorageResult` — brief §11's Storage observability, wired the same
 * way `observeSupabaseResult`/`observeAuthResult` are: classify -> skip the
 * two quiet buckets -> metric + log + out-of-band durable record.
 *
 * `bucketClass` IS THE PRIVACY BOUNDARY (brief §6, §11). The caller supplies
 * a small, safe, closed label — `'golf-media/player_avatar'`,
 * `'documents/document_version'` — never the object key or storage path.
 * Nothing in this file, `classify-storage.ts`, or the envelope ever reads an
 * actual Storage path; there is no field for one to accidentally flow
 * through.
 *
 * Does NOT call Sentry.captureException — same reason `observe-result.ts`
 * and `observe-auth.ts` don't (the action-wrapper layer already captures at
 * the request boundary).
 */
import { recordStorageFailure } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import { buildSupabaseErrorEnvelope, type SupabaseErrorEnvelope, type SupabaseOperation, type SupabaseRuntime } from './envelope';
import { classifyStorageError, type ClassifyStorageContext, type MinimalStorageError } from './classify-storage';
import { classifyBucket, type SupabaseFailureBucket } from './observe-result';
import { scheduleDbErrorRecording } from './record-db-error';

// Local copies — see observe-auth.ts's header for why these three tiny
// resolvers are duplicated rather than imported across an internal module
// boundary (same convention record-db-error.ts documents).
function hasEdgeRuntimeGlobal(): boolean {
  return (globalThis as Record<string, unknown>).EdgeRuntime !== undefined;
}
function resolveRuntime(): SupabaseRuntime {
  return hasEdgeRuntimeGlobal() ? 'edge' : 'node';
}
function resolveEnvironment(): string {
  return (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown').slice(0, 64);
}
function resolveReleaseSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
}

export interface ObserveStorageResultInput {
  error: MinimalStorageError | null | undefined;
  /** upload | download | delete-as-'invoke' is NOT how this maps — Storage
   *  removals/uploads map onto the shared `SupabaseOperation` union's
   *  `upload`/`download` values; a `.remove()` call passes `'delete'` (the
   *  union already has it for PostgREST DELETE and it fits removal too). */
  operation: SupabaseOperation;
  feature: string;
  action: string;
  /** Safe label ONLY — never an object key or path. See file header. */
  bucketClass: string;
  sport?: string | null;
  journey?: string | null;
  runtime?: SupabaseRuntime;
  environment?: string;
  releaseSha?: string | null;
  durationMs?: number | null;
  helmTraceId?: string | null;
  expectedMissingObject?: boolean;
  idempotentUpsert?: boolean;
  accessDeniedOnOwnPath?: boolean;
}

export interface ObserveStorageResultOutcome {
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

/**
 * Never throws. A call site wraps its own Storage `{ data, error }` branch
 * with this and continues handling the error exactly as it already does —
 * this never changes what the caller returns.
 */
export function observeStorageResult(input: ObserveStorageResultInput): ObserveStorageResultOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const ctx: ClassifyStorageContext = {
      feature: input.feature,
      action: input.action,
      expectedMissingObject: input.expectedMissingObject,
      idempotentUpsert: input.idempotentUpsert,
      accessDeniedOnOwnPath: input.accessDeniedOnOwnPath,
    };
    const classification = classifyStorageError(input.error, ctx);
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const runtime = input.runtime ?? resolveRuntime();
    const environment = input.environment ?? resolveEnvironment();
    const releaseSha = input.releaseSha ?? resolveReleaseSha();
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
      operation: input.operation,
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

    recordStorageFailure({
      feature: input.feature,
      action: input.action,
      sport: input.sport ?? undefined,
      environment,
      operation: input.operation,
      runtime,
      errorCode: envelope.code ?? undefined,
    });

    const logFn = bucket === 'actionable_warning' ? helmLog.warn : helmLog.error;
    logFn('supabase.storage.error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      runtime,
      service: 'storage',
      operation: input.operation,
      bucket_class: input.bucketClass,
    });

    scheduleDbErrorRecording(envelope);

    return { observed: true, bucket, envelope };
  } catch {
    return { observed: false, bucket: null, envelope: null };
  }
}
