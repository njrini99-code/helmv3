/**
 * Deterministic replay fixtures — brief §57.
 *
 * Each fixture is one FAILURE MECHANISM, stated as an input the real
 * production pipeline accepts plus the classification that pipeline is
 * expected to produce. Nothing here re-implements the classifier; the
 * expectations are the contract, and `replay-runner.ts` runs the real code
 * against them.
 *
 * NEVER A DATABASE. Every fixture drives `observeSupabaseResult` or
 * `checkZeroRowMutationIntegrity` with an injected fake client
 * (`RecordDbErrorOptions.client`), so a replay run cannot reach production,
 * a preview, or a local stack. The brief's "on local Docker / isolated DB"
 * option is deliberately NOT taken: an isolated database still needs one to
 * exist, and every mechanism below is decided in TypeScript from an error
 * shape, so a database would add a dependency without adding evidence. What
 * a database WOULD add — proof that Postgres really raises 40P01 for this
 * interleaving — is out of scope here and recorded as NOT VERIFIED.
 *
 * The pairs are the point. 42501 appears twice (expected vs unexpected) and
 * 23505 appears twice (idempotent retry vs genuine race), because the
 * classifier's whole job is telling those apart, and a fixture set that only
 * contains failures cannot show it does.
 */

import type { SupabaseFailureBucket } from '../observe-result';
import type { Expectedness, Retryability, Severity } from '../envelope';
import {
  SENTINEL_BEARER,
  SENTINEL_EMAIL,
  SENTINEL_JWT,
  SENTINEL_SERVICE_KEY_PAIR,
  SENTINEL_UUID,
} from './privacy-sentinels';

export interface ReplayExpectation {
  bucket: SupabaseFailureBucket;
  /** The envelope's `code` — SQLSTATE when there is one, else the PostgREST code. */
  code: string;
  sqlstate: string | null;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  fingerprint: string;
  /**
   * Whether the pipeline builds an envelope AND hands it to the recorder.
   * False for the two buckets brief §7 says must produce no metric, no log
   * and no durable write.
   */
  recorded: boolean;
  /** brief §8's per-occurrence path, reserved for P0/P1 evidence. */
  forceIndividualRow: boolean;
}

interface ObserveResultFixtureInput {
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc';
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  sport?: string | null;
  expectedAuthorizationDenial?: boolean;
  expectedUniqueConflict?: boolean;
}

interface IntegrityFixtureInput {
  affectedRows: number;
  expectedMinimumRows: number;
  operation: 'update' | 'insert' | 'upsert' | 'delete' | 'rpc';
  feature: string;
  action: string;
  relation?: string | null;
  rpc?: string | null;
  sport?: string | null;
}

export type ReplayFixture =
  | { id: string; title: string; path: 'observe_result'; input: ObserveResultFixtureInput; expected: ReplayExpectation }
  | { id: string; title: string; path: 'integrity'; input: IntegrityFixtureInput; expected: ReplayExpectation };

/** Constant environment for every fixture, so a run is reproducible. */
export const REPLAY_ENVIRONMENT = 'replay';

export const REPLAY_FIXTURES: readonly ReplayFixture[] = [
  {
    id: 'authorization_denial_42501',
    title: '42501 — RLS/grant denial the app did NOT expect',
    path: 'observe_result',
    input: {
      // The details string carries a UUID and an email exactly the way a real
      // Postgres message does. Both are sentinels; neither may survive.
      error: {
        code: '42501',
        message: `permission denied for table golf_rounds (${SENTINEL_EMAIL})`,
        details: `Failing row contains user ${SENTINEL_UUID}`,
        hint: `retry with ${SENTINEL_BEARER}`,
      },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'save_partial_round',
      rpc: 'save_partial_round_atomic',
      sport: 'golf',
    },
    expected: {
      bucket: 'actionable_error',
      code: '42501',
      sqlstate: '42501',
      severity: 'error',
      expectedness: 'unexpected',
      retryability: 'no',
      fingerprint: 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'authorization_denial_42501_expected',
    title: '42501 — an authorization boundary the caller declared expected',
    path: 'observe_result',
    input: {
      error: { code: '42501', message: 'permission denied for table golf_rounds' },
      operation: 'select',
      feature: 'roster',
      action: 'read_other_team_roster',
      relation: 'golf_players',
      expectedAuthorizationDenial: true,
    },
    expected: {
      bucket: 'expected_control_flow',
      code: '42501',
      sqlstate: '42501',
      severity: 'info',
      expectedness: 'expected',
      retryability: 'no',
      // Never built: an expected denial gets no metric, no log, no durable write.
      fingerprint: '',
      recorded: false,
      forceIndividualRow: false,
    },
  },
  {
    id: 'unique_violation_race_23505',
    title: '23505 — a genuine race, not an idempotent retry',
    path: 'observe_result',
    input: {
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "golf_shots_round_hole_shot_key"',
        details: `Key (round_id, hole_number, shot_number)=(${SENTINEL_UUID}, 11, 4) already exists.`,
      },
      operation: 'insert',
      feature: 'shot_tracking',
      action: 'insert_shots',
      relation: 'golf_shots',
      sport: 'golf',
    },
    expected: {
      bucket: 'actionable_warning',
      code: '23505',
      sqlstate: '23505',
      severity: 'warning',
      expectedness: 'unexpected',
      retryability: 'conditional',
      fingerprint: 'supabase|postgrest|shot_tracking|insert|golf_shots|23505',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'unique_violation_expected_23505',
    title: '23505 — the idempotent-create conflict the caller declared expected',
    path: 'observe_result',
    input: {
      error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_rounds_idempotency_key"' },
      operation: 'insert',
      feature: 'round_tracking',
      action: 'create_draft',
      relation: 'golf_rounds',
      expectedUniqueConflict: true,
    },
    expected: {
      bucket: 'routine_recovery',
      code: '23505',
      sqlstate: '23505',
      severity: 'info',
      expectedness: 'routine_recovery',
      retryability: 'no',
      fingerprint: '',
      recorded: false,
      forceIndividualRow: false,
    },
  },
  {
    id: 'deadlock_40P01',
    title: '40P01 — deadlock detected, retryable',
    path: 'observe_result',
    input: {
      error: {
        code: '40P01',
        message: 'deadlock detected',
        details: 'Process 18452 waits for ShareLock on transaction 991; blocked by process 18461.',
        hint: 'See server log for query details.',
      },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'submit_round',
      rpc: 'submit_round_atomic',
      sport: 'golf',
    },
    expected: {
      bucket: 'actionable_error',
      code: '40P01',
      sqlstate: '40P01',
      severity: 'error',
      expectedness: 'unexpected',
      retryability: 'yes',
      fingerprint: 'supabase|postgrest|round_tracking|rpc|submit_round_atomic|40p01',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'statement_timeout_57014',
    title: '57014 — statement cancelled by timeout',
    path: 'observe_result',
    input: {
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'save_partial_round',
      rpc: 'save_partial_round_atomic',
      sport: 'golf',
    },
    expected: {
      bucket: 'actionable_error',
      code: '57014',
      sqlstate: '57014',
      severity: 'error',
      expectedness: 'unexpected',
      retryability: 'conditional',
      fingerprint: 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|57014',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'round_missing_race_PGRST116',
    title: 'PGRST116 — single-row read found no row (round vanished mid-flow)',
    path: 'observe_result',
    input: {
      // A `.single()` read whose row was deleted or never committed. Not a
      // SQLSTATE at all — PostgREST's own code — so it must classify from
      // `postgrestCode`, and `expectedness` must stay 'unknown' rather than
      // being guessed either way.
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: `Results contain 0 rows, application/vnd.pgrst.object+json requires 1 row (${SENTINEL_UUID})`,
      },
      operation: 'select',
      feature: 'round_tracking',
      action: 'load_round',
      relation: 'golf_rounds',
      sport: 'golf',
    },
    expected: {
      bucket: 'actionable_warning',
      code: 'PGRST116',
      sqlstate: null,
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      fingerprint: 'supabase|postgrest|round_tracking|select|golf_rounds|pgrst116',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'schema_mismatch_42703',
    title: '42703 — undefined column: the deployed code and the schema disagree',
    path: 'observe_result',
    input: {
      error: {
        code: '42703',
        message: 'column golf_rounds.strokes_gained_total_v2 does not exist',
        hint: 'Perhaps you meant to reference the column "golf_rounds.strokes_gained_total".',
      },
      operation: 'select',
      feature: 'stats_analytics',
      action: 'load_round_stats',
      relation: 'golf_rounds',
      sport: 'golf',
    },
    expected: {
      bucket: 'critical_error',
      code: '42703',
      sqlstate: '42703',
      severity: 'critical',
      expectedness: 'unexpected',
      retryability: 'no',
      fingerprint: 'supabase|postgrest|stats_analytics|select|golf_rounds|42703',
      recorded: true,
      forceIndividualRow: false,
    },
  },
  {
    id: 'stale_optimistic_lock',
    title: 'Stale optimistic lock — HTTP 200, error null, zero rows matched',
    path: 'integrity',
    input: {
      // The write succeeded at the transport layer and changed nothing,
      // because the `WHERE version = n` predicate no longer matched. brief
      // §24: an HTTP 200 must never be treated as proof of durable state.
      affectedRows: 0,
      expectedMinimumRows: 1,
      operation: 'update',
      feature: 'round_tracking',
      action: 'save_partial_round',
      relation: 'golf_rounds',
      sport: 'golf',
    },
    expected: {
      bucket: 'critical_error',
      code: 'data_integrity_zero_rows',
      sqlstate: null,
      severity: 'critical',
      expectedness: 'unexpected',
      retryability: 'unknown',
      fingerprint: 'supabase|postgrest|round_tracking|update|golf_rounds|data_integrity_zero_rows',
      recorded: true,
      forceIndividualRow: true,
    },
  },
  {
    id: 'zero_row_update',
    title: 'Zero-row update on a different relation — the same silent class',
    path: 'integrity',
    input: {
      affectedRows: 0,
      expectedMinimumRows: 18,
      operation: 'upsert',
      feature: 'round_tracking',
      action: 'upsert_holes',
      relation: 'golf_holes',
      sport: 'golf',
    },
    expected: {
      bucket: 'critical_error',
      code: 'data_integrity_zero_rows',
      sqlstate: null,
      severity: 'critical',
      expectedness: 'unexpected',
      retryability: 'unknown',
      fingerprint: 'supabase|postgrest|round_tracking|upsert|golf_holes|data_integrity_zero_rows',
      recorded: true,
      forceIndividualRow: true,
    },
  },
  {
    id: 'privacy_sentinel_sweep',
    title: 'Every sentinel secret and PII shape at once — none may survive',
    path: 'observe_result',
    input: {
      error: {
        code: 'XX000',
        message: `internal error for ${SENTINEL_EMAIL} token=${SENTINEL_JWT}`,
        details: `${SENTINEL_SERVICE_KEY_PAIR} row=${SENTINEL_UUID}`,
        hint: SENTINEL_BEARER,
      },
      operation: 'rpc',
      feature: 'round_tracking',
      action: 'submit_round',
      rpc: 'submit_round_atomic',
      sport: 'golf',
    },
    expected: {
      bucket: 'critical_error',
      code: 'XX000',
      sqlstate: 'XX000',
      severity: 'critical',
      expectedness: 'unexpected',
      retryability: 'unknown',
      fingerprint: 'supabase|postgrest|round_tracking|rpc|submit_round_atomic|xx000',
      recorded: true,
      forceIndividualRow: false,
    },
  },
];
