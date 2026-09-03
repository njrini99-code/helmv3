/**
 * Pure table-health delta computation + warning evaluation (brief §29).
 *
 * TWO STAGES, SAME SHAPE AS query-regression.ts (computeStatDelta +
 * detectQueryRegression): `computeTableSampleDelta` turns one relation's
 * current absolute pg_stat_user_tables counters plus its previously stored
 * row into a delta row (or 'first_sample'/'reset_detected' with every delta
 * held `null`); `evaluateTableHealth` takes a WHOLE WINDOW of already-
 * computed delta rows (every table needs the others to answer "is one table
 * driving most writes") and returns warnings, never pages (brief §29 is
 * explicit: "warnings, not pages").
 *
 * DEAD-TUPLE COUNT IS NOT A MONOTONIC COUNTER, UNLIKE EVERY OTHER DELTA
 * SOURCE IN THIS REPO. `n_dead_tup` legitimately DECREASES after autovacuum
 * — that is the whole point of autovacuum — so a shrinking dead-tuple count
 * must NOT be treated as a counter reset the way a shrinking `xact_commit`
 * or `calls` would be (db-health-delta.ts, query-regression.ts). Reset
 * detection here only looks at the genuinely monotonic counters
 * (seq_scan, idx_scan, n_tup_ins/upd/del).
 *
 * THRESHOLDS BELOW ARE JUDGMENT CALLS, NOT MEASURED FACTS — the brief names
 * the four warning SHAPES (§29) but not exact numbers; each constant below
 * is a plain, documented guess, tunable without touching call sites.
 */

export interface TableCurrentSnapshot {
  relationName: string;
  nLiveTup: number;
  nDeadTup: number;
  lastAutovacuum: string | null;
  lastAutoanalyze: string | null;
  seqScan: number;
  idxScan: number;
  nTupIns: number;
  nTupUpd: number;
  nTupDel: number;
  totalBytes: number;
  indexBytes: number;
}

export interface TablePriorSnapshot {
  seqScan: number;
  idxScan: number;
  nTupIns: number;
  nTupUpd: number;
  nTupDel: number;
  nDeadTup: number;
}

export type TableCollectorStatus = 'ok' | 'first_sample' | 'reset_detected';

export interface TableSampleDelta {
  relationName: string;
  nLiveTup: number;
  nDeadTup: number;
  /** `nDeadTup / (nLiveTup + nDeadTup)`, or null when both are 0 (nothing
   *  to divide, not "perfectly healthy"). Always computable — unlike the
   *  delta fields below, this does not depend on a prior sample. */
  deadRatio: number | null;
  lastAutovacuum: string | null;
  lastAutoanalyze: string | null;
  seqScan: number;
  idxScan: number;
  nTupIns: number;
  nTupUpd: number;
  nTupDel: number;
  totalBytes: number;
  indexBytes: number;
  /** May legitimately be negative (autovacuum ran) — never treated as a
   *  reset signal. Null only on first_sample. */
  nDeadTupDelta: number | null;
  seqScanDelta: number | null;
  idxScanDelta: number | null;
  nTupInsDelta: number | null;
  nTupUpdDelta: number | null;
  nTupDelDelta: number | null;
  collectorStatus: TableCollectorStatus;
}

function nullDeltaFields(): Pick<
  TableSampleDelta,
  'nDeadTupDelta' | 'seqScanDelta' | 'idxScanDelta' | 'nTupInsDelta' | 'nTupUpdDelta' | 'nTupDelDelta'
> {
  return {
    nDeadTupDelta: null,
    seqScanDelta: null,
    idxScanDelta: null,
    nTupInsDelta: null,
    nTupUpdDelta: null,
    nTupDelDelta: null,
  };
}

export function computeTableSampleDelta(
  current: TableCurrentSnapshot,
  prior: TablePriorSnapshot | null,
): TableSampleDelta {
  const totalTup = current.nLiveTup + current.nDeadTup;
  const deadRatio = totalTup > 0 ? current.nDeadTup / totalTup : null;

  const base = {
    relationName: current.relationName,
    nLiveTup: current.nLiveTup,
    nDeadTup: current.nDeadTup,
    deadRatio,
    lastAutovacuum: current.lastAutovacuum,
    lastAutoanalyze: current.lastAutoanalyze,
    seqScan: current.seqScan,
    idxScan: current.idxScan,
    nTupIns: current.nTupIns,
    nTupUpd: current.nTupUpd,
    nTupDel: current.nTupDel,
    totalBytes: current.totalBytes,
    indexBytes: current.indexBytes,
  };

  if (!prior) {
    return { ...base, ...nullDeltaFields(), collectorStatus: 'first_sample' };
  }

  const seqScanDelta = current.seqScan - prior.seqScan;
  const idxScanDelta = current.idxScan - prior.idxScan;
  const nTupInsDelta = current.nTupIns - prior.nTupIns;
  const nTupUpdDelta = current.nTupUpd - prior.nTupUpd;
  const nTupDelDelta = current.nTupDel - prior.nTupDel;

  // nDeadTup is deliberately excluded from reset detection — see file header.
  const resetDetected = seqScanDelta < 0 || idxScanDelta < 0 || nTupInsDelta < 0 || nTupUpdDelta < 0 || nTupDelDelta < 0;

  if (resetDetected) {
    return { ...base, ...nullDeltaFields(), collectorStatus: 'reset_detected' };
  }

  return {
    ...base,
    nDeadTupDelta: current.nDeadTup - prior.nDeadTup,
    seqScanDelta,
    idxScanDelta,
    nTupInsDelta,
    nTupUpdDelta,
    nTupDelDelta,
    collectorStatus: 'ok',
  };
}

export type TableHealthWarningKind =
  | 'dead_tuples_rising'
  | 'no_autovacuum_high_write'
  | 'seq_scan_growth_idx_flat'
  | 'write_concentration';

export interface TableHealthWarning {
  kind: TableHealthWarningKind;
  relationName: string;
  detail: string;
}

/** Bloat is worth a warning once at least a fifth of a table's tuples are
 *  dead — a judgment call, not a Postgres-recommended number. */
export const DEAD_RATIO_WARNING = 0.2;
/** How long without an autovacuum, on a table that is still writing a lot,
 *  before that silence itself is the warning. */
export const NO_AUTOVACUUM_HOURS = 24;
/** "Large write deltas" (brief §29) for one hourly collector window — a
 *  judgment call sized for Helm's busiest product tables (golf_shots,
 *  golf_rounds), not a Postgres constant. */
export const HIGH_WRITE_DELTA_THRESHOLD = 5_000;
/** How many MORE sequential scans than index scans in one window before a
 *  growing seq/idx gap is worth flagging. */
export const SEQ_SCAN_GROWTH_THRESHOLD = 100;
/** A table needs to be responsible for at least this share of the WINDOW's
 *  total write volume to be called out as "driving most writes". */
export const WRITE_CONCENTRATION_SHARE = 0.6;
/** Below this total write volume for the whole window, concentration is
 *  meaningless — one table doing 8 of 10 total writes is not a finding. */
export const WRITE_CONCENTRATION_MIN_TOTAL = 1_000;

/**
 * Evaluates one window's worth of already-delta'd rows across every sampled
 * relation. `now` is passed in (not read internally) so this stays pure and
 * fixture-testable, same convention as every other evaluator in this
 * directory.
 */
export function evaluateTableHealth(rows: readonly TableSampleDelta[], now: Date): TableHealthWarning[] {
  const warnings: TableHealthWarning[] = [];

  let totalWrites = 0;
  const writesByRelation = new Map<string, number>();
  for (const row of rows) {
    const writes = (row.nTupInsDelta ?? 0) + (row.nTupUpdDelta ?? 0) + (row.nTupDelDelta ?? 0);
    writesByRelation.set(row.relationName, writes);
    totalWrites += writes;
  }

  for (const row of rows) {
    if (row.deadRatio !== null && row.deadRatio >= DEAD_RATIO_WARNING && (row.nDeadTupDelta === null || row.nDeadTupDelta > 0)) {
      warnings.push({
        kind: 'dead_tuples_rising',
        relationName: row.relationName,
        detail: `dead ratio ${(row.deadRatio * 100).toFixed(1)}%`,
      });
    }

    const writeVolume = (row.nTupInsDelta ?? 0) + (row.nTupUpdDelta ?? 0) + (row.nTupDelDelta ?? 0);
    const autovacuumAgeHours = row.lastAutovacuum
      ? (now.getTime() - new Date(row.lastAutovacuum).getTime()) / 3_600_000
      : null;
    if (writeVolume >= HIGH_WRITE_DELTA_THRESHOLD && (autovacuumAgeHours === null || autovacuumAgeHours > NO_AUTOVACUUM_HOURS)) {
      warnings.push({
        kind: 'no_autovacuum_high_write',
        relationName: row.relationName,
        detail:
          autovacuumAgeHours === null ? 'no autovacuum on record' : `no autovacuum in ${autovacuumAgeHours.toFixed(0)}h`,
      });
    }

    if (row.seqScanDelta !== null && row.seqScanDelta >= SEQ_SCAN_GROWTH_THRESHOLD && (row.idxScanDelta === null || row.idxScanDelta <= 1)) {
      warnings.push({
        kind: 'seq_scan_growth_idx_flat',
        relationName: row.relationName,
        detail: `+${row.seqScanDelta} seq scans this window, index scans flat`,
      });
    }
  }

  if (totalWrites >= WRITE_CONCENTRATION_MIN_TOTAL) {
    for (const [relationName, writes] of writesByRelation) {
      const share = writes / totalWrites;
      if (share >= WRITE_CONCENTRATION_SHARE) {
        warnings.push({
          kind: 'write_concentration',
          relationName,
          detail: `${Math.round(share * 100)}% of this window's write volume`,
        });
      }
    }
  }

  return warnings;
}
