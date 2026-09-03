/**
 * Pure delta arithmetic for the database health sampler (brief §15–16).
 *
 * WHY THIS IS A PURE FUNCTION, NOT PLPGSQL
 * --------------------------------------------
 * `pg_stat_database` counters are cumulative since an unknown (possibly
 * NULL) reset point — measured in production 2026-09-03,
 * `pg_stat_database.stats_reset` for this database is NULL (never
 * explicitly reset). "Never treat totals as a rate" (brief §1/§16) means
 * every one of this module's callers needs the SAME arithmetic applied the
 * SAME way, and that arithmetic deserves fixture-driven tests a SQL
 * function cannot get without pgTAP. `computeDbHealthDelta` takes the
 * `{current, previous}` shape `public.helm_debug_db_health_snapshot()`
 * (the SECURITY DEFINER read RPC) returns and produces exactly what
 * `public.record_db_health_sample(...)` (the write RPC) expects — no I/O,
 * no Supabase client, no Sentry, so it is testable with plain fixtures.
 *
 * COUNTER-RESET DETECTION, TWO SIGNALS (per advisor review of this design)
 * -----------------------------------------------------------------------
 *   1. `stats_reset_at` changed between `previous` and `current` — a
 *      cluster-wide `pg_stat_reset()` happened.
 *   2. ANY individual counter's current value is LESS than its previous
 *      value — catches a narrower reset a changed `stats_reset_at` would
 *      miss (Postgres does not reset per-counter, but a restored backup,
 *      a role change, or an unexpected `pg_stat_reset()` call between
 *      samples can still produce this shape).
 * Either signal marks EVERY delta in that sample `null` (not negative, not
 * zero, not the raw current value) and sets `collectorStatus:
 * 'reset_detected'` — a reader must be able to tell "nothing changed" apart
 * from "we can't tell what changed."
 */

export interface DbHealthRawSnapshot {
  statsResetAt: string | null;
  xactCommit: number;
  xactRollback: number;
  deadlocks: number;
  conflicts: number;
  tupReturned: number;
  tupFetched: number;
  tupInserted: number;
  tupUpdated: number;
  tupDeleted: number;
  tempFiles: number;
  tempBytes: number;
  blksRead: number;
  blksHit: number;
}

export interface DbHealthCurrentSnapshot extends DbHealthRawSnapshot {
  sampledAt: string;
  connectionsTotal: number;
  connectionsActive: number;
  connectionsIdleInTx: number;
  connectionsWaitingLock: number;
  longestActiveMs: number;
  longestIdleInTxMs: number;
  longestLockWaitMs: number;
  dbSizeBytes: number;
  maxConnections: number;
}

export type CollectorStatus = 'ok' | 'first_sample' | 'reset_detected';

export interface DbHealthDeltaResult {
  collectorStatus: CollectorStatus;
  connectionsPctMax: number;
  cacheHitRatio: number | null;
  deltas: {
    xactCommit: number | null;
    xactRollback: number | null;
    deadlocks: number | null;
    conflicts: number | null;
    tupReturned: number | null;
    tupFetched: number | null;
    tupInserted: number | null;
    tupUpdated: number | null;
    tupDeleted: number | null;
    tempFiles: number | null;
    tempBytes: number | null;
    blksRead: number | null;
    blksHit: number | null;
  };
}

const RAW_COUNTER_KEYS = [
  'xactCommit',
  'xactRollback',
  'deadlocks',
  'conflicts',
  'tupReturned',
  'tupFetched',
  'tupInserted',
  'tupUpdated',
  'tupDeleted',
  'tempFiles',
  'tempBytes',
  'blksRead',
  'blksHit',
] as const satisfies readonly (keyof DbHealthRawSnapshot)[];

function nullDeltas(): DbHealthDeltaResult['deltas'] {
  return {
    xactCommit: null,
    xactRollback: null,
    deadlocks: null,
    conflicts: null,
    tupReturned: null,
    tupFetched: null,
    tupInserted: null,
    tupUpdated: null,
    tupDeleted: null,
    tempFiles: null,
    tempBytes: null,
    blksRead: null,
    blksHit: null,
  };
}

/** `blks_hit / (blks_hit + blks_read)` over the WINDOW (delta), not cumulative
 *  — a cumulative ratio converges toward 1 over months and hides a recent
 *  regression. Returns null when the window has zero block reads/hits
 *  (nothing to divide, not "perfect cache"). */
function computeCacheHitRatio(blksHitDelta: number, blksReadDelta: number): number | null {
  const total = blksHitDelta + blksReadDelta;
  if (total <= 0) return null;
  return Math.round((blksHitDelta / total) * 10000) / 10000;
}

/**
 * `previous` is `null` on the very first sample this database has ever
 * taken (or after retention pruned every prior row) — that is
 * `'first_sample'`, not a reset: nothing was lost, there was simply nothing
 * before it.
 */
export function computeDbHealthDelta(
  current: DbHealthCurrentSnapshot,
  previous: DbHealthRawSnapshot | null,
): DbHealthDeltaResult {
  const connectionsPctMax =
    current.maxConnections > 0
      ? Math.round((current.connectionsTotal / current.maxConnections) * 10000) / 10000
      : 0;

  if (!previous) {
    return { collectorStatus: 'first_sample', connectionsPctMax, cacheHitRatio: null, deltas: nullDeltas() };
  }

  const resetByTimestamp =
    previous.statsResetAt !== null &&
    current.statsResetAt !== null &&
    previous.statsResetAt !== current.statsResetAt;

  const rawDeltas = RAW_COUNTER_KEYS.map((key) => current[key] - previous[key]);
  const resetByNegativeCounter = rawDeltas.some((delta) => delta < 0);

  if (resetByTimestamp || resetByNegativeCounter) {
    return { collectorStatus: 'reset_detected', connectionsPctMax, cacheHitRatio: null, deltas: nullDeltas() };
  }

  const deltas = {
    xactCommit: current.xactCommit - previous.xactCommit,
    xactRollback: current.xactRollback - previous.xactRollback,
    deadlocks: current.deadlocks - previous.deadlocks,
    conflicts: current.conflicts - previous.conflicts,
    tupReturned: current.tupReturned - previous.tupReturned,
    tupFetched: current.tupFetched - previous.tupFetched,
    tupInserted: current.tupInserted - previous.tupInserted,
    tupUpdated: current.tupUpdated - previous.tupUpdated,
    tupDeleted: current.tupDeleted - previous.tupDeleted,
    tempFiles: current.tempFiles - previous.tempFiles,
    tempBytes: current.tempBytes - previous.tempBytes,
    blksRead: current.blksRead - previous.blksRead,
    blksHit: current.blksHit - previous.blksHit,
  };

  return {
    collectorStatus: 'ok',
    connectionsPctMax,
    cacheHitRatio: computeCacheHitRatio(deltas.blksHit, deltas.blksRead),
    deltas,
  };
}
