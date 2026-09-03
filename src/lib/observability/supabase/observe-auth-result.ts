import 'server-only';

/**
 * `observeAuthResult` — brief §10's Auth capture, mirroring
 * `observeSupabaseResult` (`observe-result.ts`) exactly: classify
 * (`classify-auth.ts`), emit the existing `helm.auth.*` metric family
 * (`recordAuth`, `metrics.ts` — reused, not duplicated, per brief §36-39),
 * log, and a best-effort out-of-band `db_error_event` — skipped entirely for
 * the two buckets brief §7's taxonomy says must not become noise.
 *
 * DISTINCT FROM `recordLoginOutcome` (`golf-login-outcome.ts`). That
 * function is feature-specific instrumentation for one flow (golf login)
 * wired into one server action, predates this file, and stays exactly as
 * it is — this file is the GENERIC Auth-error primitive any call site
 * (golf/baseball/lift-lab auth, admin auth, OAuth callbacks) can adopt,
 * the same relationship `observeSupabaseResult` has to any one PostgREST
 * caller. Not wired into golf-login-outcome.ts's own call sites in this PR
 * — see the measured-truth doc's coverage note.
 *
 * SERVER-ONLY, same reasoning as `observe-result.ts`: transitively touches
 * `createAdminClient()` through `record-db-error.ts`.
 */
import { recordAuth } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import { buildSupabaseErrorEnvelope, type SupabaseErrorEnvelope } from './envelope';
import { classifyAuthError, type AuthOperation, type ClassifyAuthContext, type MinimalAuthError } from './classify-auth';
import { scheduleDbErrorRecording } from './record-db-error';
import { resolveEnvironment, resolveReleaseSha, resolveRuntime } from './runtime-context';
import { classifyBucket, type SupabaseFailureBucket } from './observe-result';

export interface ObserveAuthResultInput {
  error: MinimalAuthError | null | undefined;
  operation: AuthOperation;
  feature: string;
  action: string;
  sport?: string | null;
  journey?: string | null;
  environment?: string;
  releaseSha?: string | null;
  durationMs?: number | null;
  helmTraceId?: string | null;
  providerOptional?: boolean;
}

export interface ObserveAuthResultOutcome {
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

export function observeAuthResult(input: ObserveAuthResultInput): ObserveAuthResultOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const ctx: ClassifyAuthContext = {
      operation: input.operation,
      feature: input.feature,
      action: input.action,
      providerOptional: input.providerOptional,
    };
    const classification = classifyAuthError(input.error, ctx);
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    recordAuth({
      action: input.action,
      outcome: bucket,
      environment: input.environment,
      runtime: process.env.NEXT_RUNTIME,
      errorCode: classification.code,
    });

    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const runtime = resolveRuntime();
    const environment = input.environment ?? resolveEnvironment();
    const releaseSha = input.releaseSha ?? resolveReleaseSha();
    const correlation = getSentryCorrelation();

    const envelope = buildSupabaseErrorEnvelope({
      service: 'auth',
      environment,
      releaseSha,
      runtime,
      sport: input.sport ?? null,
      feature: input.feature,
      action: input.action,
      journey: input.journey ?? null,
      operation: 'auth',
      relation: null,
      rpc: null,
      functionName: null,
      bucketClass: input.operation,
      code: classification.code,
      sqlstate: null,
      postgrestCode: null,
      authCode: classification.authCode,
      storageCode: null,
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
    logFn('supabase.auth_error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      runtime,
      service: 'auth',
      operation: input.operation,
    });

    scheduleDbErrorRecording(envelope);

    return { observed: true, bucket, envelope };
  } catch {
    return { observed: false, bucket: null, envelope: null };
  }
}
