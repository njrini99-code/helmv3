import 'server-only';

/**
 * Helm Bridge — Query Performance (brief §35C).
 *
 * Reads `helm_debug.db_stat_deltas` through the read RPC
 * `helm_debug_read_db_stat_deltas`: the most recent 15-minute window's
 * Top-K rows (sorted by `total_exec_ms_delta` — the workload actually
 * dominating DB time in that window) plus any row flagged with a
 * regression in the lookback window, so a regression is never lost between
 * two Bridge page loads just because a later window came back clean.
 *
 * `sourceClass` is what brief §16 calls the HELM PRODUCT WORKLOAD /
 * SUPABASE INTERNAL-REALTIME / PG_NET-JOB / OBSERVABILITY / UNKNOWN split —
 * computed at collection time (`helm_debug_stat_statements_snapshot`'s SQL,
 * from a bounded query-text pattern match, never persisted as raw text) and
 * carried straight through here for the Bridge to group by.
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

export interface StatDeltaRow {
  id: number;
  sampledAt: string;
  queryid: string;
  safeQueryClass: string;
  sourceClass: string;
  callsDelta: number | null;
  totalExecMsDelta: number | null;
  meanExecMsWindow: number | null;
  maxExecMsObserved: number | null;
  rowsDelta: number | null;
  regressionFlags: string[];
  baselineStatus: 'collecting' | 'established';
}

export interface QueryPerformanceSnapshot {
  latestSampledAt: string | null;
  latest: StatDeltaRow[];
  recentRegressions: StatDeltaRow[];
  workloadSplit: Record<string, number>;
  notApplied: boolean;
}

interface RawStatDeltaRow {
  id: number;
  sampled_at: string;
  queryid: string;
  safe_query_class: string;
  source_class: string;
  calls_delta: number | null;
  total_exec_ms_delta: number | null;
  mean_exec_ms_window: number | null;
  max_exec_ms_observed: number | null;
  rows_delta: number | null;
  regression_flags: string[];
  baseline_status: 'collecting' | 'established';
}

function mapRow(raw: RawStatDeltaRow): StatDeltaRow {
  return {
    id: raw.id,
    sampledAt: raw.sampled_at,
    queryid: raw.queryid,
    safeQueryClass: raw.safe_query_class,
    sourceClass: raw.source_class,
    callsDelta: raw.calls_delta,
    totalExecMsDelta: raw.total_exec_ms_delta,
    meanExecMsWindow: raw.mean_exec_ms_window,
    maxExecMsObserved: raw.max_exec_ms_observed,
    rowsDelta: raw.rows_delta,
    regressionFlags: raw.regression_flags ?? [],
    baselineStatus: raw.baseline_status,
  };
}

function computeWorkloadSplit(rows: StatDeltaRow[]): Record<string, number> {
  const split: Record<string, number> = {};
  for (const row of rows) {
    const ms = row.totalExecMsDelta ?? 0;
    split[row.sourceClass] = (split[row.sourceClass] ?? 0) + ms;
  }
  return split;
}

export async function fetchQueryPerformance(): Promise<AdminFetchResult<QueryPerformanceSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_stat_deltas' as never, {
    p_regression_lookback_hours: 24,
  } as never)) as {
    data: { latest_sampled_at: string | null; latest: RawStatDeltaRow[]; recent_regressions: RawStatDeltaRow[] } | null;
    error: MaybePostgrestError;
  };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_stat_deltas (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_stat_deltas failed');
  }

  const latest = (data?.latest ?? []).map(mapRow);
  const recentRegressions = (data?.recent_regressions ?? []).map(mapRow);

  return ok({
    latestSampledAt: data?.latest_sampled_at ?? null,
    latest,
    recentRegressions,
    workloadSplit: computeWorkloadSplit(latest),
    notApplied: false,
  });
}
