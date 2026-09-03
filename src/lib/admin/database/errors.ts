import 'server-only';

/**
 * Helm Bridge — Database Errors, grouped by fingerprint (brief §35B).
 *
 * Reads `helm_debug.db_error_events` through the read RPC
 * `helm_debug_read_db_error_events` (`helm_debug` is not PostgREST-exposed —
 * see the migration's comment for why an RPC is the only path). Each row IS
 * already a fingerprint/hour-bucket group — the aggregation the brief asks
 * for happens at write time (`record_db_error_event`'s UPSERT,
 * 20260903180000), not here; this file only re-groups by `fingerprint`
 * ACROSS hour buckets so the Bridge shows one card per mechanism rather than
 * one per hour that mechanism fired.
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

export interface DbErrorEventRow {
  id: string;
  fingerprint: string;
  service: string;
  environment: string;
  releaseSha: string | null;
  feature: string;
  action: string;
  operation: string;
  relationName: string | null;
  rpcName: string | null;
  errorCode: string | null;
  sqlstate: string | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  expectedness: 'expected' | 'routine_recovery' | 'unexpected' | 'unknown';
  retryability: 'yes' | 'no' | 'conditional' | 'unknown';
  normalizedMessage: string;
  safeDetails: string | null;
  safeHint: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  helmTraceId: string | null;
  sentryTraceId: string | null;
}

export interface DbErrorFingerprintGroup {
  fingerprint: string;
  feature: string;
  service: string;
  errorCode: string | null;
  severity: DbErrorEventRow['severity'];
  totalOccurrences: number;
  bucketCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  latest: DbErrorEventRow;
}

export interface DatabaseErrorsSnapshot {
  groups: DbErrorFingerprintGroup[];
  totalEvents: number;
  criticalCount: number;
  notApplied: boolean;
}

interface RawErrorRow {
  id: string;
  fingerprint: string;
  service: string;
  environment: string;
  release_sha: string | null;
  feature: string;
  action: string;
  operation: string;
  relation_name: string | null;
  rpc_name: string | null;
  error_code: string | null;
  sqlstate: string | null;
  severity: DbErrorEventRow['severity'];
  expectedness: DbErrorEventRow['expectedness'];
  retryability: DbErrorEventRow['retryability'];
  normalized_message: string;
  safe_details: string | null;
  safe_hint: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  helm_trace_id: string | null;
  sentry_trace_id: string | null;
}

function mapErrorRow(raw: RawErrorRow): DbErrorEventRow {
  return {
    id: raw.id,
    fingerprint: raw.fingerprint,
    service: raw.service,
    environment: raw.environment,
    releaseSha: raw.release_sha,
    feature: raw.feature,
    action: raw.action,
    operation: raw.operation,
    relationName: raw.relation_name,
    rpcName: raw.rpc_name,
    errorCode: raw.error_code,
    sqlstate: raw.sqlstate,
    severity: raw.severity,
    expectedness: raw.expectedness,
    retryability: raw.retryability,
    normalizedMessage: raw.normalized_message,
    safeDetails: raw.safe_details,
    safeHint: raw.safe_hint,
    occurrenceCount: raw.occurrence_count,
    firstSeenAt: raw.first_seen_at,
    lastSeenAt: raw.last_seen_at,
    helmTraceId: raw.helm_trace_id,
    sentryTraceId: raw.sentry_trace_id,
  };
}

function groupByFingerprint(rows: DbErrorEventRow[]): DbErrorFingerprintGroup[] {
  const groups = new Map<string, DbErrorFingerprintGroup>();
  for (const row of rows) {
    const existing = groups.get(row.fingerprint);
    if (!existing) {
      groups.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        feature: row.feature,
        service: row.service,
        errorCode: row.errorCode,
        severity: row.severity,
        totalOccurrences: row.occurrenceCount,
        bucketCount: 1,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        latest: row,
      });
      continue;
    }
    existing.totalOccurrences += row.occurrenceCount;
    existing.bucketCount += 1;
    if (row.firstSeenAt < existing.firstSeenAt) existing.firstSeenAt = row.firstSeenAt;
    if (row.lastSeenAt > existing.lastSeenAt) {
      existing.lastSeenAt = row.lastSeenAt;
      existing.latest = row;
      existing.severity = row.severity;
    }
  }
  return Array.from(groups.values()).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

const DEFAULT_LOOKBACK_LIMIT = 300;

export async function fetchDatabaseErrors(): Promise<AdminFetchResult<DatabaseErrorsSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_error_events' as never, {
    p_limit: DEFAULT_LOOKBACK_LIMIT,
  } as never)) as { data: RawErrorRow[] | null; error: MaybePostgrestError };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_error_events (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_error_events failed');
  }

  const rows = (data ?? []).map(mapErrorRow);
  const groups = groupByFingerprint(rows);
  const totalEvents = rows.reduce((sum, row) => sum + row.occurrenceCount, 0);
  const criticalCount = groups.filter((g) => g.severity === 'critical').length;

  return ok({ groups, totalEvents, criticalCount, notApplied: false });
}
