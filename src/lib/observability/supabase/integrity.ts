import 'server-only';

/**
 * "Errors with HTTP 200" — brief §24, mandatory.
 *
 * A zero-row UPDATE/INSERT/UPSERT/DELETE is not a PostgREST error. PostgREST
 * returns HTTP 200/204 with an empty result and `error: null` whether a
 * mutation touched the row it meant to touch or touched nothing at all —
 * "the row didn't exist / RLS silently filtered it / the id was wrong" and
 * "it worked" are INDISTINGUISHABLE from the `{ data, error }` shape alone.
 * `observeSupabaseResult` (`observe-result.ts`) only ever sees a non-null
 * `error`, so it cannot catch this class of failure — this file is the
 * separate, narrower check brief §24 asks for.
 *
 * SCOPE (Phase 1): this is the GENERIC primitive — "did this mutation
 * affect at least as many rows as the caller expected" — not the full
 * per-feature outcome-contract registry the brief describes (round submit:
 * RPC returns durable id -> round submitted -> holes durable -> shots
 * durable -> stats eventually refreshed). Wiring that registry across every
 * critical Helm workflow is a large, feature-by-feature effort this
 * foundation phase does not have the product knowledge to do safely for
 * every workflow at once; `checkZeroRowMutationIntegrity` is the reusable
 * building block a later phase (or an individual feature owner) calls at
 * each step of such a chain. NOT VERIFIED in this PR: any specific
 * workflow's outcome contract is actually wired to this function.
 *
 * ALWAYS force-individual-row (brief §8's hybrid model): a data-integrity
 * violation is P0/P1 by definition (§24: "A violated critical invariant is
 * a DATA_INTEGRITY UnifiedIncident even at HTTP 200 and zero Sentry
 * errors") — collapsing occurrences into one fingerprint/hour-bucket row
 * would hide exactly how many times a silent write failure actually
 * happened.
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
import { scheduleDbErrorRecording } from './record-db-error';

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

export interface MutationIntegrityCheckInput {
  /** Rows the mutation actually affected — `(data ?? []).length` for a
   *  `.select()`-chained mutation, or an explicit count the caller tracks. */
  affectedRows: number;
  /** Rows the caller expected — almost always 1 for a single-entity mutation. */
  expectedMinimumRows: number;
  service?: SupabaseService;
  operation: SupabaseOperation;
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  sport?: string | null;
  journey?: string | null;
  helmTraceId?: string | null;
  durationMs?: number | null;
}

export interface MutationIntegrityCheckOutcome {
  /** True when affectedRows met or exceeded expectedMinimumRows — nothing recorded. */
  ok: boolean;
  envelope: SupabaseErrorEnvelope | null;
}

/**
 * Call immediately after an `error === null` mutation whose row count is
 * knowable and whose caller has a specific expectation (most single-entity
 * writes: "I updated one round, I expect one row back"). Never throws.
 */
export function checkZeroRowMutationIntegrity(input: MutationIntegrityCheckInput): MutationIntegrityCheckOutcome {
  try {
    if (input.affectedRows >= input.expectedMinimumRows) {
      return { ok: true, envelope: null };
    }

    const runtime = resolveRuntime();
    const environment = resolveEnvironment();
    const releaseSha = resolveReleaseSha();
    const correlation = getSentryCorrelation();

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
      code: 'data_integrity_zero_rows',
      sqlstate: null,
      postgrestCode: null,
      authCode: null,
      storageCode: null,
      httpStatus: 200,
      retryability: 'unknown',
      expectedness: 'unexpected',
      severity: 'critical',
      normalizedMessage: `expected >= ${input.expectedMinimumRows} row(s), got ${input.affectedRows}`,
      safeDetails: null,
      safeHint: 'HTTP 200 with error=null but the affected-row count fell below the caller-declared minimum',
      sentryTraceId: correlation?.traceId ?? null,
      sentrySpanId: correlation?.spanId ?? null,
      helmTraceId: input.helmTraceId ?? null,
      durationMs: input.durationMs ?? null,
      attempt: null,
      terminal: true,
      safeMetadata: {
        affected_rows: input.affectedRows,
        expected_minimum_rows: input.expectedMinimumRows,
      },
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

    helmLog.error('supabase.data_integrity_violation', {
      feature: input.feature,
      action: input.action,
      result: 'critical_error',
      error_code: envelope.code ?? undefined,
      runtime,
      service: envelope.service,
      operation: input.operation,
      rpc: input.rpc ?? undefined,
      relation: input.relation ?? undefined,
    });

    scheduleDbErrorRecording(envelope, { forceIndividualRow: true });

    return { ok: false, envelope };
  } catch {
    // Fail-open like every other function in this module family: a bug in
    // THIS check must never surface as a false integrity alarm on top of
    // whatever the caller's mutation actually did. `ok: true` here means
    // "this check could not run," not "integrity was verified" — callers
    // that need to distinguish the two should treat a thrown envelope as
    // orthogonal evidence, not rely on this return value as proof.
    return { ok: true, envelope: null };
  }
}
