import 'server-only';

/**
 * Helm Bridge — Slow statements (D5 task 4).
 *
 * Reads `helm_debug.db_statement_samples` through
 * `helm_debug_read_db_statement_samples`: the most recent window's top 10
 * (of the stored top 25) by total time and by mean time, plus a 7-day
 * sparkline series per fingerprint appearing in either list.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';

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

export interface StatementSampleRow {
  id: number;
  sampledAt: string;
  rankPosition: number;
  queryid: string;
  safeQueryClass: string;
  sourceClass: string;
  calls: number;
  rows: number;
  totalExecMs: number;
  meanExecMs: number;
  maxExecMs: number;
  minExecMs: number | null;
}

export interface SparklinePoint {
  sampledAt: string;
  meanExecMs: number;
}

export interface SlowStatementsSnapshot {
  latestSampledAt: string | null;
  topByTotal: StatementSampleRow[];
  topByMean: StatementSampleRow[];
  sparklines: Record<string, SparklinePoint[]>;
}

interface RawStatementRow {
  id: number;
  sampled_at: string;
  rank_position: number;
  queryid: string;
  safe_query_class: string;
  source_class: string;
  calls: number;
  rows: number;
  total_exec_ms: number;
  mean_exec_ms: number;
  max_exec_ms: number;
  min_exec_ms: number | null;
}

function mapRow(raw: RawStatementRow): StatementSampleRow {
  return {
    id: raw.id,
    sampledAt: raw.sampled_at,
    rankPosition: raw.rank_position,
    queryid: raw.queryid,
    safeQueryClass: raw.safe_query_class,
    sourceClass: raw.source_class,
    calls: raw.calls,
    rows: raw.rows,
    totalExecMs: raw.total_exec_ms,
    meanExecMs: raw.mean_exec_ms,
    maxExecMs: raw.max_exec_ms,
    minExecMs: raw.min_exec_ms,
  };
}

export async function fetchSlowStatements(): Promise<AdminFetchResult<SlowStatementsSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_statement_samples' as never, {
    p_top_n: 10,
    p_sparkline_days: 7,
  } as never)) as {
    data: {
      latest_sampled_at: string | null;
      top_by_total: RawStatementRow[];
      top_by_mean: RawStatementRow[];
      sparklines: Record<string, { sampledAt: string; meanExecMs: number }[]>;
    } | null;
    error: MaybePostgrestError;
  };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_statement_samples (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_statement_samples failed');
  }

  return ok({
    latestSampledAt: data?.latest_sampled_at ?? null,
    topByTotal: (data?.top_by_total ?? []).map(mapRow),
    topByMean: (data?.top_by_mean ?? []).map(mapRow),
    sparklines: data?.sparklines ?? {},
  });
}
