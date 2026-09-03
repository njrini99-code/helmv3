/**
 * Table health / vacuum / bloat / scans collector — GET
 * /api/cron/db-table-health (brief §29, Phase 2 A3)
 *
 * Hourly: reads the current absolute pg_stat_user_tables counters for the
 * 40 largest relations across `public` and `helm_debug` plus the
 * previously stored row per relation, via the read-only definer-rights RPC
 * `public.helm_debug_db_table_snapshot()`. Delta arithmetic happens in
 * TypeScript (`computeTableSampleDelta`, `table-health.ts` — pure, unit
 * tested), then the whole window's delta rows persist in one call to
 * `public.record_db_table_samples(jsonb)`. No warnings are computed or
 * stored here — `evaluateTableHealth` runs at READ time in
 * src/lib/admin/database/tables.ts, so a threshold tuned later applies
 * retroactively to already-stored history instead of only to future rows.
 *
 * Both RPCs are HELD (20260903190100_helm_debug_db_table_samples.sql, not
 * applied to production) — degrades to a 200 no-op while unapplied, same
 * isMigrationNotAppliedError pattern as every other collector in this
 * series.
 *
 * Auth: requireCronAuth. Schedule: hourly, `7 * * * *` (vercel.json) — the
 * ':07' offset keeps this off the exact top of every hour other daily/
 * hourly jobs in this repo tend to cluster on.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { requireCronAuth } from '@/lib/cron/auth';
import { computeTableSampleDelta, type TableCurrentSnapshot, type TablePriorSnapshot } from '@/lib/observability/supabase/table-health';

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

interface RawCurrentRow {
  relation_name: string;
  n_live_tup: number;
  n_dead_tup: number;
  last_autovacuum: string | null;
  last_autoanalyze: string | null;
  seq_scan: number;
  idx_scan: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
  total_bytes: number;
  index_bytes: number;
}

interface RawPriorRow {
  n_dead_tup: number;
  seq_scan: number;
  idx_scan: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
}

function toCurrentSnapshot(raw: RawCurrentRow): TableCurrentSnapshot {
  return {
    relationName: raw.relation_name,
    nLiveTup: raw.n_live_tup,
    nDeadTup: raw.n_dead_tup,
    lastAutovacuum: raw.last_autovacuum,
    lastAutoanalyze: raw.last_autoanalyze,
    seqScan: raw.seq_scan,
    idxScan: raw.idx_scan,
    nTupIns: raw.n_tup_ins,
    nTupUpd: raw.n_tup_upd,
    nTupDel: raw.n_tup_del,
    totalBytes: raw.total_bytes,
    indexBytes: raw.index_bytes,
  };
}

function toPriorSnapshot(raw: RawPriorRow | undefined): TablePriorSnapshot | null {
  if (!raw) return null;
  return {
    nDeadTup: raw.n_dead_tup,
    seqScan: raw.seq_scan,
    idxScan: raw.idx_scan,
    nTupIns: raw.n_tup_ins,
    nTupUpd: raw.n_tup_upd,
    nTupDel: raw.n_tup_del,
  };
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('db-table-health', async () => {
    const admin = createAdminClient();

    const snapshotResult = (await admin.rpc('helm_debug_db_table_snapshot' as never, {} as never)) as {
      data: { current: RawCurrentRow[]; prior: Record<string, RawPriorRow> } | null;
      error: MaybePostgrestError;
    };

    if (snapshotResult.error) {
      if (isMigrationNotAppliedError(snapshotResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: snapshotResult.error.code ?? 'unknown',
          detail: 'public.helm_debug_db_table_snapshot does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`helm_debug_db_table_snapshot failed: ${describeError(snapshotResult.error)}`);
    }

    if (!snapshotResult.data) {
      throw new Error('helm_debug_db_table_snapshot returned no data');
    }

    const { current, prior } = snapshotResult.data;

    const deltaRows: Record<string, unknown>[] = [];
    for (const rawRow of current) {
      const currentSnapshot = toCurrentSnapshot(rawRow);
      const priorSnapshot = toPriorSnapshot(prior[currentSnapshot.relationName]);
      const delta = computeTableSampleDelta(currentSnapshot, priorSnapshot);
      deltaRows.push({
        relationName: delta.relationName,
        nLiveTup: delta.nLiveTup,
        nDeadTup: delta.nDeadTup,
        deadRatio: delta.deadRatio,
        lastAutovacuum: delta.lastAutovacuum,
        lastAutoanalyze: delta.lastAutoanalyze,
        seqScan: delta.seqScan,
        idxScan: delta.idxScan,
        nTupIns: delta.nTupIns,
        nTupUpd: delta.nTupUpd,
        nTupDel: delta.nTupDel,
        totalBytes: delta.totalBytes,
        indexBytes: delta.indexBytes,
        nDeadTupDelta: delta.nDeadTupDelta,
        seqScanDelta: delta.seqScanDelta,
        idxScanDelta: delta.idxScanDelta,
        nTupInsDelta: delta.nTupInsDelta,
        nTupUpdDelta: delta.nTupUpdDelta,
        nTupDelDelta: delta.nTupDelDelta,
        collectorStatus: delta.collectorStatus,
      });
    }

    const writeResult = (await admin.rpc('record_db_table_samples' as never, {
      p_rows: deltaRows,
    } as never)) as { data: number | null; error: MaybePostgrestError };

    if (writeResult.error) {
      if (isMigrationNotAppliedError(writeResult.error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: writeResult.error.code ?? 'unknown',
          detail: 'public.record_db_table_samples does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`record_db_table_samples failed: ${describeError(writeResult.error)}`);
    }

    return NextResponse.json({
      ok: true,
      rowsWritten: writeResult.data,
      relationsObserved: current.length,
    });
  });
}
