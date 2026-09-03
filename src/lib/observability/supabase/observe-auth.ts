import 'server-only';

/**
 * `observeAuthResult` — brief §10's Auth observability, wired the same way
 * `observeSupabaseResult` (`observe-result.ts`) wires PostgREST failures:
 * classify -> skip the two quiet buckets -> metric + log + out-of-band
 * durable record. Reuses `classifyBucket` from `observe-result.ts` rather
 * than re-deriving the five-bucket taxonomy — both modules are server-only,
 * so importing across them adds no client-bundle risk.
 *
 * DOES NOT CALL Sentry.captureException, for the exact reason
 * `observe-result.ts`'s header gives: the action-wrapper layer
 * (`with-golf-action.ts`/`with-baseball-action.ts`/`with-lifting-action.ts`)
 * already captures at the request boundary. A second capture here would
 * repeat the duplicate-capture bug class Phase A fixed.
 *
 * NEVER LOGS A RAW AUTH MESSAGE. `helmLog` below receives only
 * code/feature/action/service/operation — never `classification.normalizedMessage`
 * — because an Auth error message routinely contains an email address
 * (`classify-auth.ts`'s header). Sanitization of the message that DOES reach
 * the envelope (and, downstream, the durable store) happens once, in
 * `buildSupabaseErrorEnvelope`.
 *
 * `recordAuth` (`metrics.ts`) is used AS-IS, not extended: it emits
 * `helm.auth.attempt` unconditionally and `helm.auth.failure` on any
 * non-success outcome. Called only from this failure-only path, attempt and
 * failure counts here are identical — so brief §10's "Auth success rate"
 * Bridge card cannot be derived from this pair alone. That is a known
 * limitation, not a bug; see the B7 doc's "not wired" section.
 *
 * SERVER-ONLY, same reason `observe-result.ts` is: transitively touches
 * `createAdminClient()` through `scheduleDbErrorRecording`.
 */
import { recordAuth } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import {
  buildSupabaseErrorEnvelope,
  type SupabaseErrorEnvelope,
  type SupabaseRuntime,
} from './envelope';
import { classifyAuthError, type AuthOperationKind, type ClassifyAuthContext, type MinimalAuthError } from './classify-auth';
import { classifyBucket, type SupabaseFailureBucket } from './observe-result';
import { scheduleDbErrorRecording } from './record-db-error';

// Local copies of observe-result.ts's runtime/environment/release resolvers —
// same "small, scoped copy per call site" convention record-db-error.ts's
// header documents for MIGRATION_NOT_APPLIED_CODES, rather than exporting
// three private helpers across an internal module boundary for three lines
// of logic.
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

export interface ObserveAuthResultInput {
  error: MinimalAuthError | null | undefined;
  feature: string;
  action: string;
  operation?: AuthOperationKind;
  sport?: string | null;
  journey?: string | null;
  runtime?: SupabaseRuntime;
  environment?: string;
  releaseSha?: string | null;
  durationMs?: number | null;
  helmTraceId?: string | null;
  expectedSessionAbsence?: boolean;
  expectedProviderDisabled?: boolean;
  isRateLimitSpike?: boolean;
  expectedUnauthenticated?: boolean;
  /** See `ClassifyAuthContext.expectedMissingUser` — a `user_not_found` here
   *  is the anti-enumeration design working, not a defect. */
  expectedMissingUser?: boolean;
}

export interface ObserveAuthResultOutcome {
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

/**
 * Never throws. A call site wraps its own Auth `{ data, error }` branch with
 * this and continues handling the error exactly as it already does.
 */
export function observeAuthResult(input: ObserveAuthResultInput): ObserveAuthResultOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const ctx: ClassifyAuthContext = {
      feature: input.feature,
      action: input.action,
      operation: input.operation,
      expectedSessionAbsence: input.expectedSessionAbsence,
      expectedProviderDisabled: input.expectedProviderDisabled,
      isRateLimitSpike: input.isRateLimitSpike,
      expectedUnauthenticated: input.expectedUnauthenticated,
      expectedMissingUser: input.expectedMissingUser,
    };
    const classification = classifyAuthError(input.error, ctx);
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    // Brief §7's rule applies to Auth too: expected/routine buckets get no
    // metric, no log, no durable write.
    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const runtime = input.runtime ?? resolveRuntime();
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
      bucketClass: null,
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
      terminal: classification.terminal,
      safeMetadata: null,
    });

    recordAuth({
      action: input.action,
      outcome: bucket,
      environment,
      runtime,
      errorCode: envelope.code ?? undefined,
    });

    // Deliberately NOT `classification.normalizedMessage` — see file header.
    const logFn = bucket === 'actionable_warning' ? helmLog.warn : helmLog.error;
    logFn('supabase.auth.error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      runtime,
      service: 'auth',
      operation: 'auth',
    });

    scheduleDbErrorRecording(envelope);

    return { observed: true, bucket, envelope };
  } catch {
    return { observed: false, bucket: null, envelope: null };
  }
}
