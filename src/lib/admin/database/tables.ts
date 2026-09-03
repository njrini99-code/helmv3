import 'server-only';

/**
 * Helm Bridge — Table Health (brief §29, Phase 2 A3).
 *
 * Reads `helm_debug.db_table_samples` through the read RPC
 * `helm_debug_read_db_table_health` (helm_debug is not PostgREST-exposed,
 * same reasoning as every other reader in this directory). The RPC returns
 * an append-log across many hourly windows for many relations; this file
 * reduces that to the LATEST sample per relation (the current-state view
 * the Bridge wants) and runs `evaluateTableHealth`
 * (src/lib/observability/supabase/table-health.ts) over that one window at
 * READ time — so a threshold tuned later applies to already-stored history,
 * not just future collector runs.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { evaluateTableHealth, type TableSampleDelta, type TableHealthWarning } from '@/lib/observability/supabase/table-health';

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

export interface TableHealthRow {
  relationName: string;
  sampledAt: string;
  nLiveTup: number;
  nDeadTup: number;
  deadRatio: number | null;
  lastAutovacuum: string | null;
  lastAutoanalyze: string | null;
  totalBytes: number;
  indexBytes: number;
  nTupInsDelta: number | null;
  nTupUpdDelta: number | null;
  nTupDelDelta: number | null;
  collectorStatus: 'ok' | 'first_sample' | 'reset_detected';
}

export interface TableHealthSnapshot {
  latestSampledAt: string | null;
  tables: TableHealthRow[];
  warnings: TableHealthWarning[];
  notApplied: boolean;
}

interface RawTableSampleRow {
  id: number;
  sampled_at: string;
  relation_name: string;
  n_live_tup: number;
  n_dead_tup: number;
  dead_ratio: number | null;
  last_autovacuum: string | null;
  last_autoanalyze: string | null;
  seq_scan: number;
  idx_scan: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
  total_bytes: number;
  index_bytes: number;
  n_dead_tup_delta: number | null;
  seq_scan_delta: number | null;
  idx_scan_delta: number | null;
  n_tup_ins_delta: number | null;
  n_tup_upd_delta: number | null;
  n_tup_del_delta: number | null;
  collector_status: 'ok' | 'first_sample' | 'reset_detected';
}

function toDelta(raw: RawTableSampleRow): TableSampleDelta {
  return {
    relationName: raw.relation_name,
    nLiveTup: raw.n_live_tup,
    nDeadTup: raw.n_dead_tup,
    deadRatio: raw.dead_ratio,
    lastAutovacuum: raw.last_autovacuum,
    lastAutoanalyze: raw.last_autoanalyze,
    seqScan: raw.seq_scan,
    idxScan: raw.idx_scan,
    nTupIns: raw.n_tup_ins,
    nTupUpd: raw.n_tup_upd,
    nTupDel: raw.n_tup_del,
    totalBytes: raw.total_bytes,
    indexBytes: raw.index_bytes,
    nDeadTupDelta: raw.n_dead_tup_delta,
    seqScanDelta: raw.seq_scan_delta,
    idxScanDelta: raw.idx_scan_delta,
    nTupInsDelta: raw.n_tup_ins_delta,
    nTupUpdDelta: raw.n_tup_upd_delta,
    nTupDelDelta: raw.n_tup_del_delta,
    collectorStatus: raw.collector_status,
  };
}

function toRow(raw: RawTableSampleRow): TableHealthRow {
  return {
    relationName: raw.relation_name,
    sampledAt: raw.sampled_at,
    nLiveTup: raw.n_live_tup,
    nDeadTup: raw.n_dead_tup,
    deadRatio: raw.dead_ratio,
    lastAutovacuum: raw.last_autovacuum,
    lastAutoanalyze: raw.last_autoanalyze,
    totalBytes: raw.total_bytes,
    indexBytes: raw.index_bytes,
    nTupInsDelta: raw.n_tup_ins_delta,
    nTupUpdDelta: raw.n_tup_upd_delta,
    nTupDelDelta: raw.n_tup_del_delta,
    collectorStatus: raw.collector_status,
  };
}

/** The RPC returns rows ordered `sampled_at desc` across every relation —
 *  keeping only the FIRST row seen per relation keeps only the latest
 *  sample for that relation. */
function latestPerRelation(rows: RawTableSampleRow[]): RawTableSampleRow[] {
  const seen = new Set<string>();
  const latest: RawTableSampleRow[] = [];
  for (const row of rows) {
    if (seen.has(row.relation_name)) continue;
    seen.add(row.relation_name);
    latest.push(row);
  }
  return latest;
}

const DEFAULT_LIMIT = 200;

export async function fetchTableHealth(): Promise<AdminFetchResult<TableHealthSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_table_health' as never, {
    p_limit: DEFAULT_LIMIT,
  } as never)) as { data: RawTableSampleRow[] | null; error: MaybePostgrestError };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_table_samples (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_table_health failed');
  }

  const rows = data ?? [];
  const latest = latestPerRelation(rows);
  const deltas = latest.map(toDelta);
  const warnings = evaluateTableHealth(deltas, new Date());

  return ok({
    latestSampledAt: latest[0]?.sampled_at ?? null,
    tables: latest.map(toRow),
    warnings,
    notApplied: false,
  });
}
