import 'server-only';

/**
 * Out-of-band Supabase/Postgres failure recorder — brief §7, §8.
 *
 * "A SEPARATE, fail-open, service-role-only observability write AFTER the
 * failed request returned" — this file is that write. It exists because a
 * rolled-back transaction erases its own writes (brief §2): if the
 * business RPC that just failed had tried to record its own failure inside
 * the same transaction, ROLLBACK would erase the record along with
 * everything else. `recordDbErrorOutOfBand` opens a brand-new request
 * against `public.record_db_error_event` (20260903180000, HELD) — a
 * completely separate transaction that survives regardless of what the
 * original one did.
 *
 * FAIL-OPEN, ALWAYS. Never throws, never rejects into a caller's `await`,
 * never retries (brief: "no retry storm"), bounded by a short timeout so a
 * struggling database cannot make this write hang the request that is
 * calling it fire-and-forget in the first place. The business error the
 * original caller returns to ITS caller is completely unaffected by
 * anything in this file succeeding, failing, or timing out.
 *
 * DEGRADES CLEANLY WHILE THE MIGRATION IS HELD, same pattern
 * `src/app/api/cron/helm-debug-prune/route.ts` already uses for
 * `helm_debug_prune`: `record_db_error_event` does not exist in production
 * yet (20260903180000 is HELD, not applied — see
 * supabase/migrations/HELD.md). `isMigrationNotAppliedError` recognizes
 * that shape and no-ops instead of logging a confusing "RPC not found"
 * warning on every single actionable Supabase failure until the owner
 * applies the migration.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { vercelWaitUntil } from '../vercel-wait-until';
import type { SupabaseErrorEnvelope } from './envelope';

/** Matches helm-debug-prune/route.ts's own constant — kept as a separate,
 *  scoped copy rather than a shared import: both are small and this repo's
 *  established convention (see that route's own header) is a local copy
 *  per call site over a speculative shared util. */
const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
}

const WRITE_TIMEOUT_MS = 3_000;

function timeout(ms: number): Promise<{ timedOut: true }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), ms);
  });
}

/**
 * The one method this recorder calls on a Supabase client. Narrow on
 * purpose: an injected replay/test double implements a single function
 * rather than pretending to be a SupabaseClient.
 */
export interface DbErrorRecorderClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null } | null }>;
}

export interface RecordDbErrorOptions {
  /** Maps to `record_db_error_event`'s `p_force_individual_row` (brief §8). */
  forceIndividualRow?: boolean;
  /**
   * REPLAY/TEST SEAM (brief §57). Substitutes the admin client so a fixture
   * can drive this function's REAL body — argument construction, the
   * migration-not-applied branch, the timeout race, the fail-open catch —
   * against a double, with no database and no service-role secret.
   *
   * Production callers never pass this: `scheduleDbErrorRecording` omits it,
   * so `createAdminClient()` stays the only path a request can take. It is a
   * parameter rather than a module mock because the replay runner
   * (scripts/db-observability-replay.mjs) executes under plain Node, where
   * `vi.mock` does not exist — and a fixture suite that can only run inside
   * one test framework is a fixture suite that cannot be run from a runbook.
   */
  client?: DbErrorRecorderClient;
}

export interface RecordDbErrorOutcome {
  ok: boolean;
  skipped?: 'migration-not-applied' | 'timed-out';
  errorId?: string;
  failure?: string;
}

/**
 * Performs the write and RETURNS the promise so tests can await it — the
 * `false` production convention is that CALLERS never `await` this (see
 * `observe-result.ts`'s `observeSupabaseResult`, the only production
 * caller): they fire it, hand the promise to `vercelWaitUntil` so the
 * platform keeps the function alive long enough for it to settle, and move
 * on immediately. `forceIndividualRow` maps directly to
 * `record_db_error_event`'s `p_force_individual_row` — reserved for P0/P1
 * data-integrity/security events that want one row per occurrence rather
 * than the default fingerprint/hour-bucket upsert (brief §8's "hybrid"
 * model).
 */
export async function recordDbErrorOutOfBand(
  envelope: SupabaseErrorEnvelope,
  options: RecordDbErrorOptions = {},
): Promise<RecordDbErrorOutcome> {
  try {
    const admin = options.client ?? createAdminClient();

    const rpcCall = admin.rpc('record_db_error_event' as never, {
      p_service: envelope.service,
      p_environment: envelope.environment,
      p_runtime: envelope.runtime,
      p_feature: envelope.feature,
      p_action: envelope.action,
      p_operation: envelope.operation,
      p_severity: envelope.severity,
      p_expectedness: envelope.expectedness,
      p_retryability: envelope.retryability,
      p_fingerprint: envelope.fingerprint,
      p_normalized_message: envelope.normalizedMessage,
      p_terminal: envelope.terminal,
      p_release_sha: envelope.releaseSha,
      p_sport: envelope.sport,
      p_journey: envelope.journey,
      p_relation_name: envelope.relation,
      p_rpc_name: envelope.rpc,
      p_function_name: envelope.functionName,
      p_bucket_class: envelope.bucketClass,
      p_error_code: envelope.code,
      p_sqlstate: envelope.sqlstate,
      p_postgrest_code: envelope.postgrestCode,
      p_auth_code: envelope.authCode,
      p_storage_code: envelope.storageCode,
      p_http_status: envelope.httpStatus,
      p_safe_details: envelope.safeDetails,
      p_safe_hint: envelope.safeHint,
      p_helm_trace_id: envelope.helmTraceId,
      p_sentry_trace_id: envelope.sentryTraceId,
      p_sentry_span_id: envelope.sentrySpanId,
      p_duration_ms: envelope.durationMs,
      p_attempt: envelope.attempt,
      p_safe_metadata: envelope.safeMetadata ?? {},
      p_force_individual_row: options.forceIndividualRow ?? false,
    } as never) as unknown as Promise<{ data: string | null; error: { code?: string | null; message?: string | null } | null }>;

    const result = await Promise.race([rpcCall, timeout(WRITE_TIMEOUT_MS)]);

    if ('timedOut' in result) {
      return { ok: false, skipped: 'timed-out' };
    }

    if (result.error) {
      if (isMigrationNotAppliedError(result.error)) {
        return { ok: true, skipped: 'migration-not-applied' };
      }
      return { ok: false, failure: result.error.message ?? 'unknown_error' };
    }

    return { ok: true, errorId: result.data ?? undefined };
  } catch (error) {
    // Fail-open, unconditionally — a thrown error here (network failure,
    // admin client construction failure, anything) must never propagate
    // into the caller's request path.
    return { ok: false, failure: error instanceof Error ? error.message : 'unknown_error' };
  }
}

/**
 * Fire-and-forget entry point for production call sites: starts the write,
 * registers it with `vercelWaitUntil` so the Vercel runtime keeps the
 * function alive long enough for it to finish, and returns immediately
 * without awaiting. Never throws — `recordDbErrorOutOfBand` itself never
 * rejects (every branch above returns a value), so there is nothing here
 * that could escape into the caller.
 */
export function scheduleDbErrorRecording(
  envelope: SupabaseErrorEnvelope,
  options: RecordDbErrorOptions = {},
): void {
  const task = recordDbErrorOutOfBand(envelope, options);
  vercelWaitUntil(task);
}
