/**
 * Database health sampler cron — GET /api/cron/db-health-sampler (brief §15)
 *
 * Every 5 minutes: reads current absolute Postgres/pg_stat_database counters
 * plus the most recently stored sample via the read-only SECURITY DEFINER
 * RPC `public.helm_debug_db_health_snapshot()`, computes deltas in
 * TypeScript (`computeDbHealthDelta`, `db-health-delta.ts` — pure, unit
 * tested, never SQL arithmetic), and persists one row via
 * `public.record_db_health_sample(...)`. Both RPCs are HELD
 * (20260903180100_helm_debug_db_health_samples.sql, not applied to
 * production) — this route degrades to a 200 no-op while unapplied, exactly
 * like `src/app/api/cron/helm-debug-prune/route.ts` already does for
 * `helm_debug_prune`; see that file's header for the full reasoning behind
 * `isMigrationNotAppliedError`.
 *
 * Auth: `requireCronAuth` (`src/lib/cron/auth.ts`), the shared Vercel-cron
 * bearer-secret check every `/api/cron` route holds to.
 * Schedule: every 5 minutes (vercel.json) — see
 * docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §6 for the
 * connection-budget justification (one short-lived service_role connection
 * per run, never held open).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { requireCronAuth } from '@/lib/cron/auth';
import { computeDbHealthDelta, type DbHealthCurrentSnapshot, type DbHealthRawSnapshot } from '@/lib/observability/supabase/db-health-delta';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

/** Raw shape `helm_debug_db_health_snapshot()`'s `current` key returns —
 *  snake_case, matching the jsonb_build_object keys in the migration. */
interface RawCurrentJson {
  sampled_at: string;
  stats_reset_at: string | null;
  connections_total: number;
  connections_active: number;
  connections_idle_in_tx: number;
  connections_waiting_lock: number;
  longest_active_ms: number;
  longest_idle_in_tx_ms: number;
  longest_lock_wait_ms: number;
  xact_commit: number;
  xact_rollback: number;
  deadlocks: number;
  conflicts: number;
  tup_returned: number;
  tup_fetched: number;
  tup_inserted: number;
  tup_updated: number;
  tup_deleted: number;
  temp_files: number;
  temp_bytes: number;
  blks_read: number;
  blks_hit: number;
  db_size_bytes: number;
  max_connections: number;
}

interface RawPreviousJson {
  sampled_at: string;
  stats_reset_at: string | null;
  xact_commit: number;
  xact_rollback: number;
  deadlocks: number;
  conflicts: number;
  tup_returned: number;
  tup_fetched: number;
  tup_inserted: number;
  tup_updated: number;
  tup_deleted: number;
  temp_files: number;
  temp_bytes: number;
  blks_read: number;
  blks_hit: number;
}

function toCurrentSnapshot(raw: RawCurrentJson): DbHealthCurrentSnapshot {
  return {
    sampledAt: raw.sampled_at,
    statsResetAt: raw.stats_reset_at,
    connectionsTotal: raw.connections_total,
    connectionsActive: raw.connections_active,
    connectionsIdleInTx: raw.connections_idle_in_tx,
    connectionsWaitingLock: raw.connections_waiting_lock,
    longestActiveMs: raw.longest_active_ms,
    longestIdleInTxMs: raw.longest_idle_in_tx_ms,
    longestLockWaitMs: raw.longest_lock_wait_ms,
    xactCommit: raw.xact_commit,
    xactRollback: raw.xact_rollback,
    deadlocks: raw.deadlocks,
    conflicts: raw.conflicts,
    tupReturned: raw.tup_returned,
    tupFetched: raw.tup_fetched,
    tupInserted: raw.tup_inserted,
    tupUpdated: raw.tup_updated,
    tupDeleted: raw.tup_deleted,
    tempFiles: raw.temp_files,
    tempBytes: raw.temp_bytes,
    blksRead: raw.blks_read,
    blksHit: raw.blks_hit,
    dbSizeBytes: raw.db_size_bytes,
    maxConnections: raw.max_connections,
  };
}

function toPreviousSnapshot(raw: RawPreviousJson | null): DbHealthRawSnapshot | null {
  if (!raw) return null;
  return {
    statsResetAt: raw.stats_reset_at,
    xactCommit: raw.xact_commit,
    xactRollback: raw.xact_rollback,
    deadlocks: raw.deadlocks,
    conflicts: raw.conflicts,
    tupReturned: raw.tup_returned,
    tupFetched: raw.tup_fetched,
    tupInserted: raw.tup_inserted,
    tupUpdated: raw.tup_updated,
    tupDeleted: raw.tup_deleted,
    tempFiles: raw.temp_files,
    tempBytes: raw.temp_bytes,
    blksRead: raw.blks_read,
    blksHit: raw.blks_hit,
  };
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('db-health-sampler', async () => {
    const admin = createAdminClient();

    const snapshotResult = (await admin.rpc('helm_debug_db_health_snapshot' as never, {} as never)) as {
      data: { current: RawCurrentJson; previous: RawPreviousJson | null } | null;
      error: MaybePostgrestError;
    };

    if (snapshotResult.error) {
      if (isMigrationNotAppliedError(snapshotResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: snapshotResult.error.code ?? 'unknown',
          detail: 'public.helm_debug_db_health_snapshot (or the tables it reads) does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`helm_debug_db_health_snapshot failed: ${describeError(snapshotResult.error)}`);
    }

    if (!snapshotResult.data) {
      throw new Error('helm_debug_db_health_snapshot returned no data');
    }

    const current = toCurrentSnapshot(snapshotResult.data.current);
    const previous = toPreviousSnapshot(snapshotResult.data.previous);
    const delta = computeDbHealthDelta(current, previous);

    const writeResult = (await admin.rpc('record_db_health_sample' as never, {
      p_stats_reset_at: current.statsResetAt,
      p_connections_total: current.connectionsTotal,
      p_connections_active: current.connectionsActive,
      p_connections_idle_in_tx: current.connectionsIdleInTx,
      p_connections_waiting_lock: current.connectionsWaitingLock,
      p_connections_pct_max: delta.connectionsPctMax,
      p_longest_active_ms: current.longestActiveMs,
      p_longest_idle_in_tx_ms: current.longestIdleInTxMs,
      p_longest_lock_wait_ms: current.longestLockWaitMs,
      p_xact_commit: current.xactCommit,
      p_xact_rollback: current.xactRollback,
      p_deadlocks: current.deadlocks,
      p_conflicts: current.conflicts,
      p_tup_returned: current.tupReturned,
      p_tup_fetched: current.tupFetched,
      p_tup_inserted: current.tupInserted,
      p_tup_updated: current.tupUpdated,
      p_tup_deleted: current.tupDeleted,
      p_temp_files: current.tempFiles,
      p_temp_bytes: current.tempBytes,
      p_blks_read: current.blksRead,
      p_blks_hit: current.blksHit,
      p_db_size_bytes: current.dbSizeBytes,
      p_xact_commit_delta: delta.deltas.xactCommit,
      p_xact_rollback_delta: delta.deltas.xactRollback,
      p_deadlocks_delta: delta.deltas.deadlocks,
      p_conflicts_delta: delta.deltas.conflicts,
      p_tup_returned_delta: delta.deltas.tupReturned,
      p_tup_fetched_delta: delta.deltas.tupFetched,
      p_tup_inserted_delta: delta.deltas.tupInserted,
      p_tup_updated_delta: delta.deltas.tupUpdated,
      p_tup_deleted_delta: delta.deltas.tupDeleted,
      p_temp_files_delta: delta.deltas.tempFiles,
      p_temp_bytes_delta: delta.deltas.tempBytes,
      p_blks_read_delta: delta.deltas.blksRead,
      p_blks_hit_delta: delta.deltas.blksHit,
      p_cache_hit_ratio: delta.cacheHitRatio,
      p_collector_status: delta.collectorStatus,
    } as never)) as { data: number | null; error: MaybePostgrestError };

    if (writeResult.error) {
      if (isMigrationNotAppliedError(writeResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: writeResult.error.code ?? 'unknown',
          detail: 'public.record_db_health_sample does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`record_db_health_sample failed: ${describeError(writeResult.error)}`);
    }

    return NextResponse.json({
      ok: true,
      sampleId: writeResult.data,
      collectorStatus: delta.collectorStatus,
      connectionsPctMax: delta.connectionsPctMax,
      cacheHitRatio: delta.cacheHitRatio,
    });
  });
}
