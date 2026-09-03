/**
 * pg_stat_statements delta + regression collector — GET /api/cron/db-stat-delta
 * (brief §16–17)
 *
 * Every 15 minutes: reads the current cumulative Top-K (by total_exec_time)
 * from `pg_stat_statements` plus the stored prior state for exactly those
 * queryids, via the read-only SECURITY DEFINER RPC
 * `public.helm_debug_stat_statements_snapshot()` — which also computes the
 * privacy-safe `safe_query_class`/`source_class` labels server-side from a
 * bounded prefix of the query text, so raw SQL text never crosses into this
 * route or any stored table. Delta arithmetic, baseline update, and
 * regression detection all happen in TypeScript
 * (`query-regression.ts` — pure, unit tested against fixtures), then both
 * the window's delta rows and the refreshed prior-state/baseline rows are
 * persisted in one call to `public.record_db_stat_snapshot(...)`.
 *
 * Both RPCs are HELD (20260903180200_helm_debug_db_stat_deltas.sql, not
 * applied to production) — degrades to a 200 no-op while unapplied, same
 * `isMigrationNotAppliedError` pattern as every other collector in this PR.
 *
 * Auth: `requireCronAuth`. Schedule: every 15 minutes (vercel.json).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { requireCronAuth } from '@/lib/cron/auth';
import {
  computeStatDelta,
  updateStatBaseline,
  detectQueryRegression,
  type StatCurrentRow,
  type StatPriorRow,
} from '@/lib/observability/supabase/query-regression';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Top-K bound — brief §16 suggests 25-50; 50 is the ceiling the RPC itself
 *  also clamps to (defence in depth, see the migration). */
const TOP_K = 50;

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

interface RawCurrentRow {
  queryid: string;
  calls: number;
  total_exec_ms: number;
  mean_exec_ms: number;
  max_exec_ms: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  temp_blks_read: number;
  temp_blks_written: number;
  wal_bytes: number;
  safe_query_class: string;
  source_class: string;
}

interface RawPriorRow {
  last_seen_at: string;
  stats_reset_at: string | null;
  calls: number;
  total_exec_ms: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  temp_blks_read: number;
  temp_blks_written: number;
  wal_bytes: number;
  mean_exec_ms_baseline: number | null;
  max_exec_ms_baseline: number | null;
  rows_per_call_baseline: number | null;
  sample_count: number;
  baseline_status: 'collecting' | 'established';
}

function toCurrentRow(raw: RawCurrentRow): StatCurrentRow {
  return {
    queryid: raw.queryid,
    calls: raw.calls,
    totalExecMs: raw.total_exec_ms,
    maxExecMs: raw.max_exec_ms,
    rows: raw.rows,
    sharedBlksHit: raw.shared_blks_hit,
    sharedBlksRead: raw.shared_blks_read,
    tempBlksRead: raw.temp_blks_read,
    tempBlksWritten: raw.temp_blks_written,
    walBytes: raw.wal_bytes,
    safeQueryClass: raw.safe_query_class,
    sourceClass: raw.source_class,
  };
}

function toPriorRow(raw: RawPriorRow | undefined): StatPriorRow | null {
  if (!raw) return null;
  return {
    statsResetAt: raw.stats_reset_at,
    calls: raw.calls,
    totalExecMs: raw.total_exec_ms,
    rows: raw.rows,
    sharedBlksHit: raw.shared_blks_hit,
    sharedBlksRead: raw.shared_blks_read,
    tempBlksRead: raw.temp_blks_read,
    tempBlksWritten: raw.temp_blks_written,
    walBytes: raw.wal_bytes,
    meanExecMsBaseline: raw.mean_exec_ms_baseline,
    maxExecMsBaseline: raw.max_exec_ms_baseline,
    rowsPerCallBaseline: raw.rows_per_call_baseline,
    sampleCount: raw.sample_count,
    baselineStatus: raw.baseline_status,
  };
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('db-stat-delta', async () => {
    const admin = createAdminClient();

    const snapshotResult = (await admin.rpc('helm_debug_stat_statements_snapshot' as never, {
      p_limit: TOP_K,
    } as never)) as {
      data: { stats_reset_at: string | null; current: RawCurrentRow[]; prior: Record<string, RawPriorRow> } | null;
      error: MaybePostgrestError;
    };

    if (snapshotResult.error) {
      if (isMigrationNotAppliedError(snapshotResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: snapshotResult.error.code ?? 'unknown',
          detail: 'public.helm_debug_stat_statements_snapshot does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`helm_debug_stat_statements_snapshot failed: ${describeError(snapshotResult.error)}`);
    }

    if (!snapshotResult.data) {
      throw new Error('helm_debug_stat_statements_snapshot returned no data');
    }

    const { stats_reset_at: statsResetAt, current, prior } = snapshotResult.data;
    const sampledAt = new Date().toISOString();

    const deltaRows: Record<string, unknown>[] = [];
    const priorStateRows: Record<string, unknown>[] = [];
    let regressionCount = 0;

    for (const rawRow of current) {
      const currentRow = toCurrentRow(rawRow);
      const priorRow = toPriorRow(prior[currentRow.queryid]);
      const delta = computeStatDelta(currentRow, priorRow, statsResetAt);
      const baseline = updateStatBaseline(priorRow, delta);
      const regressionFlags = detectQueryRegression(delta, baseline);
      if (regressionFlags.length > 0) regressionCount += 1;

      deltaRows.push({
        queryid: currentRow.queryid,
        safeQueryClass: currentRow.safeQueryClass,
        sourceClass: currentRow.sourceClass,
        callsDelta: delta.callsDelta,
        totalExecMsDelta: delta.totalExecMsDelta,
        meanExecMsWindow: delta.meanExecMsWindow,
        maxExecMsObserved: delta.maxExecMsObserved,
        rowsDelta: delta.rowsDelta,
        walBytesDelta: delta.walBytesDelta,
        sharedBlksHitDelta: delta.sharedBlksHitDelta,
        sharedBlksReadDelta: delta.sharedBlksReadDelta,
        tempBlksReadDelta: delta.tempBlksReadDelta,
        tempBlksWrittenDelta: delta.tempBlksWrittenDelta,
        regressionFlags,
        baselineStatus: baseline.baselineStatus,
      });

      priorStateRows.push({
        queryid: currentRow.queryid,
        calls: currentRow.calls,
        totalExecMs: currentRow.totalExecMs,
        rows: currentRow.rows,
        sharedBlksHit: currentRow.sharedBlksHit,
        sharedBlksRead: currentRow.sharedBlksRead,
        tempBlksRead: currentRow.tempBlksRead,
        tempBlksWritten: currentRow.tempBlksWritten,
        walBytes: currentRow.walBytes,
        meanExecMsBaseline: baseline.meanExecMsBaseline,
        maxExecMsBaseline: baseline.maxExecMsBaseline,
        rowsPerCallBaseline: baseline.rowsPerCallBaseline,
        sampleCount: baseline.sampleCount,
        baselineStatus: baseline.baselineStatus,
      });
    }

    const writeResult = (await admin.rpc('record_db_stat_snapshot' as never, {
      p_sampled_at: sampledAt,
      p_stats_reset_at: statsResetAt,
      p_delta_rows: deltaRows,
      p_prior_state_rows: priorStateRows,
    } as never)) as { data: number | null; error: MaybePostgrestError };

    if (writeResult.error) {
      if (isMigrationNotAppliedError(writeResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: writeResult.error.code ?? 'unknown',
          detail: 'public.record_db_stat_snapshot does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`record_db_stat_snapshot failed: ${describeError(writeResult.error)}`);
    }

    return NextResponse.json({
      ok: true,
      rowsWritten: writeResult.data,
      queriesObserved: current.length,
      regressionCount,
    });
  });
}
