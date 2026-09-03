import 'server-only';

/**
 * Helm Bridge — Database Mission Control (brief §35A).
 *
 * Reads what the collectors have already written; nothing here collects or
 * mutates. Sourced from `helm_debug.db_health_samples` (via the read RPC
 * `helm_debug_read_db_health_history`, since `helm_debug` is not
 * PostgREST-exposed — see the migration's own comment) and
 * `background_job_logs` for the three new collectors' own run history
 * (`db-health-sampler`, `db-stat-delta`, `db-observability-prune`) —
 * `background_job_logs` IS a public, PostgREST-exposed table, unlike
 * `helm_debug`, so that half reads with a plain `.from()` the same way
 * `src/lib/admin/data/reliability.ts` does.
 *
 * DEGRADES CLEANLY WHILE THE MIGRATIONS ARE HELD. Every RPC this file calls
 * (`20260903180100_helm_debug_db_health_samples.sql`,
 * `20260903180200_helm_debug_db_stat_deltas.sql`) is HELD — see
 * `supabase/migrations/HELD.md`. A missing-function/relation error is not
 * surfaced as `status: 'error'`; it is surfaced as `status: 'unconfigured'`
 * with an explicit `notApplied: true`, so the Bridge page can render "not
 * shipped yet" rather than "broken."
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  evaluateConnectionSaturation,
  evaluateRollbackRate,
  type ConnectionSaturationResult,
  type RollbackRateResult,
} from '@/lib/observability/supabase/health-rules';

type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: MaybePostgrestError): boolean {
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

export interface DbHealthSampleRow {
  id: number;
  sampledAt: string;
  statsResetAt: string | null;
  connectionsTotal: number;
  connectionsActive: number;
  connectionsIdleInTx: number;
  connectionsWaitingLock: number;
  connectionsPctMax: number | null;
  longestActiveMs: number | null;
  longestIdleInTxMs: number | null;
  longestLockWaitMs: number | null;
  dbSizeBytes: number;
  xactCommitDelta: number | null;
  xactRollbackDelta: number | null;
  deadlocksDelta: number | null;
  cacheHitRatio: number | null;
  tempBytesDelta: number | null;
  collectorStatus: string;
}

export interface CollectorHealth {
  jobType: string;
  lastStatus: 'completed' | 'failed' | 'never_run';
  lastRunAt: string | null;
}

export interface DatabaseMissionControlSnapshot {
  latestSample: DbHealthSampleRow | null;
  history: DbHealthSampleRow[];
  collectors: CollectorHealth[];
  /** Connection-saturation and rollback-rate rules (brief §19, §23),
   *  Phase 2 track A2 — computed here from the SAME `history` array
   *  already fetched above, no extra query. Pure evaluators
   *  (src/lib/observability/supabase/health-rules.ts); this file only
   *  wires history in most-recent-first order, which
   *  `helm_debug_read_db_health_history` already returns. */
  rules: {
    connectionSaturation: ConnectionSaturationResult;
    rollbackRate: RollbackRateResult;
  };
  /** True when the health-sampler migration has not been applied yet — the
   *  Bridge renders a distinct "not shipped" state, never a fabricated GREEN. */
  notApplied: boolean;
}

interface RawHealthRow {
  id: number;
  sampled_at: string;
  stats_reset_at: string | null;
  connections_total: number;
  connections_active: number;
  connections_idle_in_tx: number;
  connections_waiting_lock: number;
  connections_pct_max: number | null;
  longest_active_ms: number | null;
  longest_idle_in_tx_ms: number | null;
  longest_lock_wait_ms: number | null;
  db_size_bytes: number;
  xact_commit_delta: number | null;
  xact_rollback_delta: number | null;
  deadlocks_delta: number | null;
  cache_hit_ratio: number | null;
  temp_bytes_delta: number | null;
  collector_status: string;
}

function mapHealthRow(raw: RawHealthRow): DbHealthSampleRow {
  return {
    id: raw.id,
    sampledAt: raw.sampled_at,
    statsResetAt: raw.stats_reset_at,
    connectionsTotal: raw.connections_total,
    connectionsActive: raw.connections_active,
    connectionsIdleInTx: raw.connections_idle_in_tx,
    connectionsWaitingLock: raw.connections_waiting_lock,
    connectionsPctMax: raw.connections_pct_max,
    longestActiveMs: raw.longest_active_ms,
    longestIdleInTxMs: raw.longest_idle_in_tx_ms,
    longestLockWaitMs: raw.longest_lock_wait_ms,
    dbSizeBytes: raw.db_size_bytes,
    xactCommitDelta: raw.xact_commit_delta,
    xactRollbackDelta: raw.xact_rollback_delta,
    deadlocksDelta: raw.deadlocks_delta,
    cacheHitRatio: raw.cache_hit_ratio,
    tempBytesDelta: raw.temp_bytes_delta,
    collectorStatus: raw.collector_status,
  };
}

const COLLECTOR_JOB_TYPES = ['db-health-sampler', 'db-stat-delta', 'db-observability-prune'] as const;

/** Exported so src/lib/admin/database/telemetry.ts (brief §40-48's
 *  self-monitoring — "collector runtime, DB calls, rows written") can reuse
 *  the SAME collector-health read this file already does, rather than a
 *  second query against `background_job_logs` that could silently drift
 *  from this one. */
export async function fetchCollectorHealth(
  admin: ReturnType<typeof createAdminClient>,
): Promise<CollectorHealth[]> {
  const { data, error } = await admin
    .from('background_job_logs')
    .select('job_type, status, started_at')
    .in('job_type', COLLECTOR_JOB_TYPES as unknown as string[])
    .order('started_at', { ascending: false })
    .limit(60);

  if (error || !data) {
    return COLLECTOR_JOB_TYPES.map((jobType) => ({ jobType, lastStatus: 'never_run', lastRunAt: null }));
  }

  return COLLECTOR_JOB_TYPES.map((jobType) => {
    const latest = data.find((row) => row.job_type === jobType);
    if (!latest) return { jobType, lastStatus: 'never_run' as const, lastRunAt: null };
    return {
      jobType,
      lastStatus: (latest.status === 'completed' ? 'completed' : 'failed') as 'completed' | 'failed',
      lastRunAt: latest.started_at,
    };
  });
}

const HISTORY_LIMIT = 50; // ~4 hours at 5-minute cadence.

export async function fetchDatabaseMissionControl(): Promise<AdminFetchResult<DatabaseMissionControlSnapshot>> {
  const admin = createAdminClient();

  const [historyResult, collectors] = await Promise.all([
    admin
      .rpc('helm_debug_read_db_health_history' as never, { p_limit: HISTORY_LIMIT } as never)
      .then((result) => result as unknown as { data: RawHealthRow[] | null; error: MaybePostgrestError }),
    fetchCollectorHealth(admin),
  ]);

  if (historyResult.error) {
    if (isMigrationNotAppliedError(historyResult.error)) {
      return unconfigured('db_health_samples (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(historyResult.error.message ?? 'helm_debug_read_db_health_history failed');
  }

  const history = (historyResult.data ?? []).map(mapHealthRow);

  return ok({
    latestSample: history[0] ?? null,
    history,
    collectors,
    rules: {
      connectionSaturation: evaluateConnectionSaturation(history),
      rollbackRate: evaluateRollbackRate(history),
    },
    notApplied: false,
  });
}
