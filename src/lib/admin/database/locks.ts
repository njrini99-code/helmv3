import 'server-only';

/**
 * Helm Bridge — Locks & Transactions (brief §35D).
 *
 * Reads `helm_debug.db_lock_incidents` through the read RPC
 * `helm_debug_read_db_lock_incidents` (20260903190000, HELD — `helm_debug`
 * is not PostgREST-exposed, so an RPC is the only read path, same reasoning
 * as every other reader in this directory). Every row here was already
 * threshold-evaluated by `evaluateLockSnapshot`
 * (src/lib/observability/supabase/locks.ts) at write time; this file only
 * maps and degrades, it does not re-derive severity.
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

export interface LockIncidentRow {
  id: number;
  detectedAt: string;
  kind: 'long_active' | 'idle_in_tx' | 'lock_wait' | 'deadlock';
  severity: 'warning' | 'critical';
  roleClass: 'app' | 'service' | 'other';
  waitMs: number | null;
  blockedQueryClass: string | null;
  blockingQueryClass: string | null;
  blockedPidCount: number | null;
  relationName: string | null;
  feature: string | null;
  releaseSha: string | null;
  resolvedAt: string | null;
}

export interface LockIncidentsSnapshot {
  incidents: LockIncidentRow[];
  openCount: number;
  criticalOpenCount: number;
  notApplied: boolean;
}

interface RawLockIncidentRow {
  id: number;
  detected_at: string;
  kind: LockIncidentRow['kind'];
  severity: LockIncidentRow['severity'];
  role_class: LockIncidentRow['roleClass'];
  wait_ms: number | null;
  blocked_query_class: string | null;
  blocking_query_class: string | null;
  blocked_pid_count: number | null;
  relation_name: string | null;
  feature: string | null;
  release_sha: string | null;
  resolved_at: string | null;
}

function mapRow(raw: RawLockIncidentRow): LockIncidentRow {
  return {
    id: raw.id,
    detectedAt: raw.detected_at,
    kind: raw.kind,
    severity: raw.severity,
    roleClass: raw.role_class,
    waitMs: raw.wait_ms,
    blockedQueryClass: raw.blocked_query_class,
    blockingQueryClass: raw.blocking_query_class,
    blockedPidCount: raw.blocked_pid_count,
    relationName: raw.relation_name,
    feature: raw.feature,
    releaseSha: raw.release_sha,
    resolvedAt: raw.resolved_at,
  };
}

const DEFAULT_LIMIT = 100;

export async function fetchLockIncidents(): Promise<AdminFetchResult<LockIncidentsSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_lock_incidents' as never, {
    p_limit: DEFAULT_LIMIT,
  } as never)) as { data: RawLockIncidentRow[] | null; error: MaybePostgrestError };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_lock_incidents (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_lock_incidents failed');
  }

  const incidents = (data ?? []).map(mapRow);
  const open = incidents.filter((i) => i.resolvedAt === null);

  return ok({
    incidents,
    openCount: open.length,
    criticalOpenCount: open.filter((i) => i.severity === 'critical').length,
    notApplied: false,
  });
}
