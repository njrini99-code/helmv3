import 'server-only';

/**
 * `observeSupabaseResult` — brief §7's app-observed failure capture.
 *
 * The one function a server call site adds around a `{ data, error }`
 * PostgREST/RPC result to get: classification (`classify.ts`), a metric
 * (`helm.db.failure` via `metrics.ts`'s `recordDbFailure` — imported, never
 * duplicated), a structured log, and a best-effort out-of-band durable
 * record (`record-db-error.ts`) — all in one call, all fail-open, all
 * skipped entirely for the two buckets the brief says must NOT become
 * noise (`expected_control_flow`, `routine_recovery`).
 *
 * WHAT THIS FUNCTION DELIBERATELY DOES NOT DO
 * ------------------------------------------------
 * It does not call `Sentry.captureException`. Brief §7: "existing server
 * error pipeline + Sentry, THEN a best-effort out-of-band write" — Sentry
 * capture is M1-M4's job (`with-golf-action.ts`/`with-baseball-action.ts`/
 * `with-lifting-action.ts`/`onRequestError`, see
 * `docs/observability/SENTRY_COVERAGE_MATRIX.md`), which already runs at
 * every server-action/route boundary this repo has. A second capture here
 * would be exactly the duplicate-capture class of bug Phase A found and
 * fixed (`fix(observability): four duplicate-capture bugs`). This function
 * is additive: metric + log + durable DB-error-event, nothing Sentry-facing.
 *
 * SERVER-ONLY. Transitively touches `createAdminClient()` (a service-role
 * secret) through `record-db-error.ts`. Every current call site this repo
 * would wire this into (server actions, RPC-calling data-access modules,
 * cron routes) is server-side already; browser-observed Supabase failures
 * stay on the existing M1-style client capture path.
 *
 * DEDUPE (brief §33) IS STRUCTURAL, NOT CODE HERE. Two calls with the same
 * (service, feature, operation, rpc-or-relation, code) build the SAME
 * `fingerprint` (envelope.ts), and `record_db_error_event`'s
 * fingerprint/hour-bucket UPSERT (20260903180000) collapses them into one
 * row with an incrementing `occurrence_count` — this function does not need
 * to know that happened; it just builds the envelope and hands it off.
 */
import { recordDbFailure } from '../metrics';
import { helmLog } from '../structured-log';
import { getSentryCorrelation } from '../correlation';
import {
  buildSupabaseErrorEnvelope,
  type SupabaseErrorEnvelope,
  type SupabaseOperation,
  type SupabaseRuntime,
  type SupabaseService,
} from './envelope';
import { classifyPostgrestError, type ClassifyContext, type MinimalPostgrestError } from './classify';
import { scheduleDbErrorRecording } from './record-db-error';
import { resolveEnvironment, resolveReleaseSha, resolveRuntime } from './runtime-context';

export type SupabaseFailureBucket =
  | 'expected_control_flow'
  | 'routine_recovery'
  | 'actionable_warning'
  | 'actionable_error'
  | 'critical_error';

/** Brief §7's five-bucket taxonomy, derived from the classifier's
 *  (expectedness, severity) pair. `unknown` expectedness is never silently
 *  dropped — it lands in the actionable buckets so an unclassified failure
 *  stays visible rather than disappearing like an EXPECTED one. */
export function classifyBucket(
  expectedness: SupabaseErrorEnvelope['expectedness'],
  severity: SupabaseErrorEnvelope['severity'],
): SupabaseFailureBucket {
  if (expectedness === 'expected') return 'expected_control_flow';
  if (expectedness === 'routine_recovery') return 'routine_recovery';
  if (severity === 'critical') return 'critical_error';
  if (severity === 'error') return 'actionable_error';
  return 'actionable_warning';
}

export interface ObserveSupabaseResultInput {
  error: MinimalPostgrestError | null | undefined;
  service?: SupabaseService;
  operation: SupabaseOperation;
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  sport?: string | null;
  journey?: string | null;
  runtime?: SupabaseRuntime;
  environment?: string;
  releaseSha?: string | null;
  durationMs?: number | null;
  attempt?: number | null;
  terminal?: boolean;
  helmTraceId?: string | null;
  expectedAuthorizationDenial?: boolean;
  expectedUniqueConflict?: boolean;
  expectedForeignKeyViolation?: boolean;
  /** Route to the P0/P1 individual-row path (brief §8) instead of the
   *  default fingerprint/hour-bucket upsert — reserve for data-integrity
   *  or security-critical events where per-occurrence evidence matters. */
  forceIndividualRow?: boolean;
}

export interface ObserveSupabaseResultOutcome {
  /** False only when `input.error` was null/undefined — nothing to observe. */
  observed: boolean;
  bucket: SupabaseFailureBucket | null;
  envelope: SupabaseErrorEnvelope | null;
}

/**
 * Never throws. A call site wraps its own `if (error) { ... }` branch with
 * this and continues handling the error exactly as it already does — this
 * function's return value is informational (useful for tests and for a
 * caller that wants the bucket/envelope for its own logic), never a
 * decision the caller must act on.
 */
export function observeSupabaseResult(input: ObserveSupabaseResultInput): ObserveSupabaseResultOutcome {
  try {
    if (!input.error) return { observed: false, bucket: null, envelope: null };

    const ctx: ClassifyContext = {
      operation: input.operation,
      feature: input.feature,
      action: input.action,
      relation: input.relation,
      rpc: input.rpc,
      expectedAuthorizationDenial: input.expectedAuthorizationDenial,
      expectedUniqueConflict: input.expectedUniqueConflict,
      expectedForeignKeyViolation: input.expectedForeignKeyViolation,
    };
    const classification = classifyPostgrestError(input.error, ctx);
    const bucket = classifyBucket(classification.expectedness, classification.severity);

    // Brief §7: "do not send every permission denial, duplicate key, wrong
    // password or missing row [as] a high-priority issue" — these two
    // buckets get NO metric, NO log, NO durable write. The classification
    // itself is the complete record; nothing below would be new evidence.
    if (bucket === 'expected_control_flow' || bucket === 'routine_recovery') {
      return { observed: true, bucket, envelope: null };
    }

    const runtime = input.runtime ?? resolveRuntime();
    const environment = input.environment ?? resolveEnvironment();
    const releaseSha = input.releaseSha ?? resolveReleaseSha();
    const correlation = getSentryCorrelation();
    const code = classification.sqlstate ?? classification.postgrestCode ?? classification.code;

    const envelope = buildSupabaseErrorEnvelope({
      service: input.service ?? 'postgrest',
      environment,
      releaseSha,
      runtime,
      sport: input.sport ?? null,
      feature: input.feature,
      action: input.action,
      journey: input.journey ?? null,
      operation: input.operation,
      relation: input.relation ?? null,
      rpc: input.rpc ?? null,
      functionName: input.rpc ?? null,
      bucketClass: null,
      code,
      sqlstate: classification.sqlstate,
      postgrestCode: classification.postgrestCode,
      authCode: null,
      storageCode: null,
      httpStatus: null,
      retryability: classification.retryability,
      expectedness: classification.expectedness,
      severity: classification.severity,
      normalizedMessage: classification.normalizedMessage,
      safeDetails: input.error.details ?? null,
      safeHint: input.error.hint ?? null,
      sentryTraceId: correlation?.traceId ?? null,
      sentrySpanId: correlation?.spanId ?? null,
      helmTraceId: input.helmTraceId ?? null,
      durationMs: input.durationMs ?? null,
      attempt: input.attempt ?? null,
      terminal: input.terminal ?? true,
      safeMetadata: null,
    });

    recordDbFailure({
      feature: input.feature,
      action: input.action,
      errorCode: envelope.code ?? undefined,
      durationMs: input.durationMs ?? undefined,
      sport: input.sport ?? undefined,
      environment,
      operation: input.operation,
      runtime,
    });

    const logFn = bucket === 'actionable_warning' ? helmLog.warn : helmLog.error;
    logFn('supabase.error', {
      feature: input.feature,
      action: input.action,
      result: bucket,
      error_code: envelope.code ?? undefined,
      retry: input.attempt ?? undefined,
      runtime,
      service: envelope.service,
      operation: input.operation,
      rpc: input.rpc ?? undefined,
      relation: input.relation ?? undefined,
    });

    scheduleDbErrorRecording(envelope, { forceIndividualRow: input.forceIndividualRow });

    return { observed: true, bucket, envelope };
  } catch {
    // This function runs INSIDE an error-handling branch — it must never
    // itself become a new failure for the caller to handle.
    return { observed: false, bucket: null, envelope: null };
  }
}
