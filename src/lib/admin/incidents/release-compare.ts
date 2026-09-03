/**
 * Post-deployment comparison read model (brief §9/§28) — "each release a
 * marker; click opens a baseline comparison table (root incidents, affected
 * users, round-submit success, DB p95, new SQLSTATEs, invariant breaches
 * with deltas)."
 *
 * PURE. This module never reads a reliability snapshot or a UnifiedIncident
 * list itself — it compares two already-extracted `ReleaseSnapshotFacts`
 * records. `deriveRootIncidentFacts` is the one adapter this file provides,
 * and it only covers the two dimensions the CURRENT data model can actually
 * answer (root incidents, affected users) from a `UnifiedIncident[]` plus
 * the `CoverageSummary` (`sources.ts`) that already says whether the board
 * was blind. Journey success, DB p95 and invariant breaches have no read
 * model in this repo yet (they are later Phase D work per the control-plane
 * plan) — this module accepts them as facts the caller supplies once one
 * exists, rather than fabricating a derivation ahead of the data.
 *
 * NEVER UNKNOWN AS ZERO. Every metric is `null` when its source could not be
 * read — never `0` standing in for "we do not know". `dbSourceBlind` on
 * `ReleaseSnapshotFacts` is a second, authoritative override: even a caller
 * that passed a raw `0` for a DB-derived field gets `'unknown'` out of
 * `buildReleaseComparison` when the DB source was blind for that window,
 * because a zero read from a source that could not be read is not a zero.
 */

import type { CoverageSummary } from './sources';
import type { UnifiedIncident } from './types';

// ---------------------------------------------------------------------------
// Snapshot facts
// ---------------------------------------------------------------------------

export interface ReleaseSnapshotFacts {
  releaseSha: string | null;
  /** null = could not be counted for this window (a source was blind). */
  rootIncidentCount: number | null;
  affectedUsers: number | null;
  /** 0..1, null = no journey data for this window. */
  journeySuccessRate: number | null;
  /** milliseconds, null = DB p95 unavailable for this window. */
  dbP95Ms: number | null;
  /** SQLSTATE/PostgREST codes observed this window. Empty means "none
   *  observed" — only trustworthy when `dbSourceBlind` is false. */
  sqlstates: readonly string[];
  invariantBreaches: number | null;
  /** Overrides dbP95Ms/invariantBreaches/sqlstates to unknown regardless of
   *  what numbers were passed — see the module header. */
  dbSourceBlind: boolean;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type ComparisonState = 'unknown' | 'improved' | 'worsened' | 'unchanged';

export interface ComparisonMetric {
  baseline: number | null;
  current: number | null;
  /** current - baseline. Null whenever either side is null. */
  delta: number | null;
  state: ComparisonState;
}

const UNKNOWN_METRIC: ComparisonMetric = { baseline: null, current: null, delta: null, state: 'unknown' };

function compareMetric(
  baseline: number | null,
  current: number | null,
  direction: 'lower-is-better' | 'higher-is-better',
): ComparisonMetric {
  if (baseline === null || current === null) {
    return { baseline, current, delta: null, state: 'unknown' };
  }
  const delta = current - baseline;
  if (delta === 0) return { baseline, current, delta, state: 'unchanged' };
  const improved = direction === 'lower-is-better' ? delta < 0 : delta > 0;
  return { baseline, current, delta, state: improved ? 'improved' : 'worsened' };
}

export interface ReleaseComparisonResult {
  rootIncidents: ComparisonMetric;
  affectedUsers: ComparisonMetric;
  journeySuccessRate: ComparisonMetric;
  dbP95Ms: ComparisonMetric;
  invariantBreaches: ComparisonMetric;
  /** Present only in current, not baseline. Null when either side's DB
   *  source was blind — an empty array would falsely claim "no new codes". */
  newSqlstates: readonly string[] | null;
  dbBlind: boolean;
}

/**
 * Compare two release snapshots. `rootIncidents`, `affectedUsers` and
 * `journeySuccessRate` degrade independently of DB blindness — an incident
 * count is not a DB metric and should not go unknown because Postgres could
 * not be read. `dbP95Ms`, `invariantBreaches` and `newSqlstates` are forced
 * unknown together whenever EITHER side's DB source was blind, because a
 * delta built from one trustworthy side and one blind side is not a
 * trustworthy delta.
 */
export function buildReleaseComparison(input: {
  baseline: ReleaseSnapshotFacts;
  current: ReleaseSnapshotFacts;
}): ReleaseComparisonResult {
  const { baseline, current } = input;
  const dbBlind = baseline.dbSourceBlind || current.dbSourceBlind;

  return {
    rootIncidents: compareMetric(baseline.rootIncidentCount, current.rootIncidentCount, 'lower-is-better'),
    affectedUsers: compareMetric(baseline.affectedUsers, current.affectedUsers, 'lower-is-better'),
    journeySuccessRate: compareMetric(baseline.journeySuccessRate, current.journeySuccessRate, 'higher-is-better'),
    dbP95Ms: dbBlind ? UNKNOWN_METRIC : compareMetric(baseline.dbP95Ms, current.dbP95Ms, 'lower-is-better'),
    invariantBreaches: dbBlind
      ? UNKNOWN_METRIC
      : compareMetric(baseline.invariantBreaches, current.invariantBreaches, 'lower-is-better'),
    newSqlstates: dbBlind ? null : current.sqlstates.filter((code) => !baseline.sqlstates.includes(code)),
    dbBlind,
  };
}

// ---------------------------------------------------------------------------
// Adapter: the two dimensions today's incident model can actually answer
// ---------------------------------------------------------------------------

/**
 * Root-incident count and affected-user count for one window of already-built
 * `UnifiedIncident`s, gated by whether the board that produced them was
 * blind anywhere. Counts only ACTIONABLE, non-resolved incidents — the same
 * definition `truth-strip.ts`'s "Incidents" cell uses, so this comparison
 * can never disagree with the number an operator sees elsewhere on the same
 * board for the same window.
 */
export function deriveRootIncidentFacts(
  incidents: readonly UnifiedIncident[],
  coverage: CoverageSummary,
): Pick<ReleaseSnapshotFacts, 'rootIncidentCount' | 'affectedUsers'> {
  if (coverage.anyBlind) {
    return { rootIncidentCount: null, affectedUsers: null };
  }
  const actionable = incidents.filter(
    (i) => i.actionable && i.lifecycle.state !== 'resolved' && i.lifecycle.state !== 'not-a-defect',
  );
  const affectedUsers = actionable.reduce((sum, i) => (i.affectedUsersKnown ? sum + i.affectedUsers : sum), 0);
  return { rootIncidentCount: actionable.length, affectedUsers };
}
