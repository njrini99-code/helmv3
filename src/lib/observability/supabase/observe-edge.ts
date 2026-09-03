import 'server-only';

/**
 * `observeEdgeInvoke` — brief §13's app-side half of Edge Function
 * observability, wired the same way `observeSupabaseResult`/`observeAuthResult`/
 * `observeStorageResult` are. The other half — instrumenting the function's
 * OWN handler with Sentry Deno — lives in
 * `supabase/functions/_shared/observability.ts` (a completely separate Deno
 * runtime this Next.js module cannot import into or from).
 *
 * Does NOT call Sentry.captureException — same reason every other
 * `observe-*` in this directory doesn't (the action-wrapper layer already
 * captures at the request boundary that CALLS `functions.invoke()`).
 */
import { recordEdgeFunctionFailure } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import { buildSupabaseErrorEnvelope, type SupabaseErrorEnvelope, type SupabaseRuntime } from './envelope';
import { classifyEdgeFunctionError, type MinimalEdgeError } from './classify-edge';
import { classifyBucket, type SupabaseFailureBucket } from './observe-result';
import { scheduleDbErrorRecording } from './record-db-error';

// Local copies — see observe-auth.ts's header.
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

export interface ObserveEdgeInvokeInput {
  error: MinimalEdgeError | null | undefined;
  functionName: string;
  feature: string;
  action: string;
  sport?: string | null;
  journey?: string | null;
  runtime?: SupabaseRuntime;
  environment?: string;
  releaseSha?: string | null;
  durationMs?: number | null;
  helmTraceId?: string | null;
}

export interface ObserveEdgeInvokeOutcome {
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

/**
 * Never throws. A call site wraps its own `functions.invoke()` `{ data, error }`
 * (or try/catch, since `invoke` can also throw) branch with this and
 * continues handling the error exactly as it already does.
 */
export function observeEdgeInvoke(input: ObserveEdgeInvokeInput): ObserveEdgeInvokeOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const classification = classifyEdgeFunctionError(input.error, {
      feature: input.feature,
      action: input.action,
      functionName: input.functionName,
    });
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const runtime = input.runtime ?? resolveRuntime();
    const environment = input.environment ?? resolveEnvironment();
    const releaseSha = input.releaseSha ?? resolveReleaseSha();
    const correlation = getSentryCorrelation();

    const envelope = buildSupabaseErrorEnvelope({
      service: 'edge_function',
      environment,
      releaseSha,
      runtime,
      sport: input.sport ?? null,
      feature: input.feature,
      action: input.action,
      journey: input.journey ?? null,
      operation: 'invoke',
      relation: null,
      rpc: null,
      functionName: input.functionName,
      bucketClass: null,
      code: classification.code,
      sqlstate: null,
      postgrestCode: null,
      authCode: null,
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

    recordEdgeFunctionFailure({
      feature: input.feature,
      action: input.action,
      environment,
      runtime,
      errorCode: envelope.code ?? undefined,
    });

    const logFn = bucket === 'actionable_warning' ? helmLog.warn : helmLog.error;
    logFn('supabase.edge_function.error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      runtime,
      service: 'edge_function',
      operation: 'invoke',
      function_name: input.functionName,
    });

    scheduleDbErrorRecording(envelope);

    return { observed: true, bucket, envelope };
  } catch {
    return { observed: false, bucket: null, envelope: null };
  }
}
