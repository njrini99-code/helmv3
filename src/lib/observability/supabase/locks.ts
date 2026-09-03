/**
 * Pure lock/blocking/transaction evaluation (brief §18).
 *
 * SAME REASONING AS db-health-delta.ts / query-regression.ts: threshold
 * arithmetic on a bounded snapshot deserves fixture-driven tests, not
 * plpgsql. `evaluateLockSnapshot` takes the rows
 * `public.helm_debug_db_lock_snapshot()` (the read-only definer-rights RPC,
 * 20260903190000_helm_debug_db_lock_incidents.sql) returns, already
 * classified into `roleClass`/`safeQueryClass`/`blockingQueryClass` IN SQL —
 * this module never sees raw query text, only the small closed labels the
 * SQL facade computed from a 200-character-bounded prefix.
 *
 * ONE SNAPSHOT ROW CAN PRODUCE AT MOST ONE INCIDENT KIND: `isWaitingOnLock`
 * takes priority over `state`, because a backend can be `state = 'active'`
 * while ALSO blocked on a lock (Postgres marks a backend waiting on a lock as
 * still "active" — the lock wait is the more actionable classification of
 * the two).
 *
 * THRESHOLDS (brief §18, exact numbers handed down by the task brief, not
 * independently derived): app roles use the same 8s posture the
 * anon/authenticated/authenticator `statement_timeout` already enforces
 * (measured production value —
 * docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §2); service
 * role gets longer thresholds because its own statement_timeout is 30s, not
 * 8s (same doc). The three service-role pairs are given in the same order
 * as the three app-role checks (active, lock wait, idle-in-tx) — that
 * ordering is this file's own inference from the brief's prose, not a value
 * measured or independently specified; documented here so a reviewer can
 * check the inference rather than trust it silently.
 */

export type LockKind = 'long_active' | 'idle_in_tx' | 'lock_wait' | 'deadlock';
export type LockSeverity = 'warning' | 'critical';
export type RoleClass = 'app' | 'service' | 'other';

/** One row `helm_debug_db_lock_snapshot()` returns — already safe (no raw
 *  query text, no usename, just the derived role_class/safe_query_class). */
export interface LockSnapshotRow {
  pid: number;
  roleClass: RoleClass;
  /** `pg_stat_activity.state` — only 'active' and 'idle in transaction' are
   *  ever included in the snapshot (the SQL facade's WHERE clause). */
  state: 'active' | 'idle in transaction' | null;
  /** ms since query_start (active/lock-wait) or state_change (idle-in-tx). */
  durationMs: number;
  isWaitingOnLock: boolean;
  safeQueryClass: string;
  blockingQueryClass: string | null;
  blockedPidCount: number;
  relationName: string | null;
}

interface ThresholdPair {
  warningMs: number;
  criticalMs: number;
}

export interface LockThresholds {
  active: ThresholdPair;
  lockWait: ThresholdPair;
  idleInTx: ThresholdPair;
}

export interface LockThresholdsByRole {
  app: LockThresholds;
  service: LockThresholds;
  /** Roles that are neither app nor service_role (postgres, replication,
   *  Supabase-internal) reuse the service-role posture — longer-lived by
   *  design and not the product's own timeout budget, so app's 8s posture
   *  would false-positive on them constantly. */
  other: LockThresholds;
}

export const DEFAULT_LOCK_THRESHOLDS: LockThresholdsByRole = {
  app: {
    active: { warningMs: 5_000, criticalMs: 8_000 },
    lockWait: { warningMs: 2_000, criticalMs: 6_000 },
    idleInTx: { warningMs: 5_000, criticalMs: 8_000 },
  },
  service: {
    active: { warningMs: 20_000, criticalMs: 30_000 },
    lockWait: { warningMs: 10_000, criticalMs: 25_000 },
    idleInTx: { warningMs: 30_000, criticalMs: 60_000 },
  },
  other: {
    active: { warningMs: 20_000, criticalMs: 30_000 },
    lockWait: { warningMs: 10_000, criticalMs: 25_000 },
    idleInTx: { warningMs: 30_000, criticalMs: 60_000 },
  },
};

export interface LockIncidentCandidate {
  kind: LockKind;
  severity: LockSeverity;
  roleClass: RoleClass;
  waitMs: number | null;
  blockedQueryClass: string | null;
  blockingQueryClass: string | null;
  blockedPidCount: number | null;
  relationName: string | null;
}

function severityFor(durationMs: number, pair: ThresholdPair): LockSeverity | null {
  if (durationMs >= pair.criticalMs) return 'critical';
  if (durationMs > pair.warningMs) return 'warning';
  return null;
}

export interface EvaluateLockSnapshotOptions {
  rows: LockSnapshotRow[];
  /** From `computeDbHealthDelta(...).deltas.deadlocks` for the SAME
   *  collector run — `null` means "no delta signal this window" (first
   *  sample or a counter reset), which must NOT be treated as "no
   *  deadlock" (zero). Only a non-null value > 0 produces a `deadlock`
   *  candidate. */
  deadlocksDelta: number | null;
  thresholds?: LockThresholdsByRole;
}

/**
 * Returns zero or more incident candidates to persist via
 * `record_db_lock_incident`. The caller (the cron route) is responsible for
 * the actual RPC calls and for `feature`/`action`/`release_sha`/
 * `helm_trace_id` — this function has no access to request/deploy context by
 * design (it is pure).
 */
export function evaluateLockSnapshot(options: EvaluateLockSnapshotOptions): LockIncidentCandidate[] {
  const thresholds = options.thresholds ?? DEFAULT_LOCK_THRESHOLDS;
  const candidates: LockIncidentCandidate[] = [];

  for (const row of options.rows) {
    const posture = thresholds[row.roleClass];

    if (row.isWaitingOnLock) {
      const severity = severityFor(row.durationMs, posture.lockWait);
      if (severity) {
        candidates.push({
          kind: 'lock_wait',
          severity,
          roleClass: row.roleClass,
          waitMs: row.durationMs,
          blockedQueryClass: row.safeQueryClass,
          blockingQueryClass: row.blockingQueryClass,
          blockedPidCount: row.blockedPidCount,
          relationName: row.relationName,
        });
      }
      continue;
    }

    if (row.state === 'active') {
      const severity = severityFor(row.durationMs, posture.active);
      if (severity) {
        candidates.push({
          kind: 'long_active',
          severity,
          roleClass: row.roleClass,
          waitMs: row.durationMs,
          blockedQueryClass: row.safeQueryClass,
          blockingQueryClass: null,
          blockedPidCount: null,
          relationName: row.relationName,
        });
      }
      continue;
    }

    if (row.state === 'idle in transaction') {
      const severity = severityFor(row.durationMs, posture.idleInTx);
      if (severity) {
        candidates.push({
          kind: 'idle_in_tx',
          severity,
          roleClass: row.roleClass,
          waitMs: row.durationMs,
          blockedQueryClass: row.safeQueryClass,
          blockingQueryClass: null,
          blockedPidCount: null,
          relationName: row.relationName,
        });
      }
    }
  }

  // Any true deadlock in a product workflow is actionable (brief §18) — no
  // threshold, no role-class posture, just presence this window. roleClass
  // is 'other' because pg_stat_database's deadlocks counter does not
  // identify which role's transaction lost — a real per-role attribution
  // would need pg_stat_activity evidence captured AT the deadlock, which
  // this 5-minute-window delta signal cannot provide after the fact.
  if (options.deadlocksDelta !== null && options.deadlocksDelta > 0) {
    candidates.push({
      kind: 'deadlock',
      severity: 'critical',
      roleClass: 'other',
      waitMs: null,
      blockedQueryClass: null,
      blockingQueryClass: null,
      blockedPidCount: null,
      relationName: null,
    });
  }

  return candidates;
}
