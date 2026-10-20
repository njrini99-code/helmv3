import 'server-only';

/**
 * Helm Bridge — Locks & Transactions (brief §35D).
 *
 * Reads `helm_debug.db_lock_incidents` through the read RPC
 * `helm_debug_read_db_lock_incidents` (20260903191000, HELD — `helm_debug`
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
  /** Unresolved and re-stamped inside LOCK_INCIDENT_ACTIVE_WINDOW_MS. */
  active: boolean;
}

export interface LockIncidentsSnapshot {
  incidents: LockIncidentRow[];
  /** Active incidents (see isLockIncidentActive) among the rows actually
   *  fetched. When
   *  `openCountIsFloor` is true this is a lower bound, not a total. */
  openCount: number;
  /** True when the read hit its page ceiling, so `openCount` and
   *  `criticalOpenCount` are floors rather than totals. */
  openCountIsFloor: boolean;
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

/**
 * `record_db_lock_incident` (20260903191000) re-stamps `detected_at` on an
 * unresolved incident of the same kind and query class seen again within 15
 * minutes, and `db-health-sampler` runs every 5 minutes. So a lock that is
 * still held is re-stamped at least twice inside this window, and an
 * unresolved row older than it is an incident the sampler stopped seeing:
 * it has ended. Nothing writes `resolved_at`, so without this every incident
 * ever recorded counted as open (100 "at least" on 2026-10-13, newest
 * 2026-10-05).
 */
export const LOCK_INCIDENT_ACTIVE_WINDOW_MS = 15 * 60_000;

export function isLockIncidentActive(
  incident: Pick<LockIncidentRow, 'resolvedAt' | 'detectedAt'>,
  nowMs: number,
): boolean {
  if (incident.resolvedAt !== null) return false;
  const detectedMs = Date.parse(incident.detectedAt);
  if (Number.isNaN(detectedMs)) return true;
  return nowMs - detectedMs <= LOCK_INCIDENT_ACTIVE_WINDOW_MS;
}

function mapRow(raw: RawLockIncidentRow, nowMs: number): LockIncidentRow {
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
    active: isLockIncidentActive({ resolvedAt: raw.resolved_at, detectedAt: raw.detected_at }, nowMs),
  };
}

const DEFAULT_LIMIT = 100;

export async function fetchLockIncidents(nowMs: number = Date.now()): Promise<AdminFetchResult<LockIncidentsSnapshot>> {
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

  const incidents = (data ?? []).map((raw) => mapRow(raw, nowMs));
  const open = incidents.filter((i) => i.active);
  // The reader asks for at most DEFAULT_LIMIT rows, so a full page means the
  // true total is unknown, not equal to the page size. `openCount` is then a
  // floor, and the tiles that render it must say so rather than present a
  // saturated cap as a real count. The RPC returns newest first, so once any
  // fetched row has ended, every active incident is already on this page and
  // the count is exact.
  const atCeiling = incidents.length >= DEFAULT_LIMIT && open.length === incidents.length;

  const result = ok({
    incidents,
    openCount: open.length,
    openCountIsFloor: atCeiling,
    criticalOpenCount: open.filter((i) => i.severity === 'critical').length,
    notApplied: false,
  });
  return atCeiling ? { ...result, truncated: true } : result;
}
