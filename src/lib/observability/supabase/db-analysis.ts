/**
 * Pure flatten/diff helpers for the Database Tab's analysis snapshot
 * (index suggestions, unused indexes, bloat, seq-scan ratios, connections,
 * locks — D5 task 2). No I/O — `db-table-health/route.ts` calls
 * `flattenAnalysisSnapshot` on the RPC's jsonb payload before writing, and
 * the Bridge's coverage/analysis read model calls `summarizeChangeSince`
 * to build the "changed since yesterday" strip from the read facade's
 * `latest`/`prior` windows.
 */

export type AnalysisCategory =
  | 'index_suggestion'
  | 'unused_index'
  | 'bloat'
  | 'seq_scan_ratio'
  | 'connections'
  | 'locks'
  | 'rls_coverage';

export interface RlsCoverageSnapshotRaw {
  tables_missing_policies: Record<string, unknown>[];
  over_privileged_definers: Record<string, unknown>[];
}

export interface AnalysisSnapshotRaw {
  unused_indexes: Record<string, unknown>[];
  bloat: Record<string, unknown>[];
  seq_scan_ratio: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  locks: Record<string, unknown>[];
  index_suggestions: Record<string, unknown>[];
  rls_coverage: RlsCoverageSnapshotRaw;
  has_pgstattuple: boolean;
  has_index_advisor: boolean;
}

export interface AnalysisRow {
  category: AnalysisCategory;
  subject: string | null;
  payload: Record<string, unknown>;
}

function subjectFor(category: AnalysisCategory, item: Record<string, unknown>): string | null {
  switch (category) {
    case 'unused_index':
      return typeof item.index_name === 'string' ? item.index_name : null;
    case 'bloat':
      return typeof item.table_name === 'string' ? item.table_name : null;
    case 'seq_scan_ratio':
      return typeof item.table_name === 'string' ? item.table_name : null;
    case 'connections':
      return typeof item.state === 'string' ? item.state : null;
    case 'locks':
      return typeof item.mode === 'string' ? item.mode : null;
    case 'index_suggestion':
      return typeof item.queryid === 'string' ? item.queryid : null;
    case 'rls_coverage':
      return typeof item.subject === 'string' ? item.subject : null;
    default:
      return null;
  }
}

/** Turns the snapshot RPC's arrays into flat `{category, subject, payload}`
 *  rows ready for `record_db_analysis_sample`'s `p_rows`. A category whose
 *  array is empty writes zero rows for that category — the read side
 *  treats "no rows this window for category X" as "nothing to report", not
 *  as "collector broken", so this is intentional, not a gap.
 *
 *  `rls_coverage` is shaped differently from the other five (one object
 *  with two named arrays, not one flat array) so it gets two synthetic
 *  rows instead — `subject: 'tables_missing_policies'` and
 *  `subject: 'over_privileged_definers'` — each carrying its own findings
 *  array plus a `count`, so `summarizeChangeSince` can still diff a single
 *  number per window without re-parsing the payload shape. */
export function flattenAnalysisSnapshot(snapshot: AnalysisSnapshotRaw): AnalysisRow[] {
  const rows: AnalysisRow[] = [];
  const categories: Array<[AnalysisCategory, Record<string, unknown>[]]> = [
    ['unused_index', snapshot.unused_indexes ?? []],
    ['bloat', snapshot.bloat ?? []],
    ['seq_scan_ratio', snapshot.seq_scan_ratio ?? []],
    ['connections', snapshot.connections ?? []],
    ['locks', snapshot.locks ?? []],
    ['index_suggestion', snapshot.index_suggestions ?? []],
  ];
  for (const [category, items] of categories) {
    for (const item of items) {
      rows.push({ category, subject: subjectFor(category, item), payload: item });
    }
  }

  // Same "empty means no row" contract as the five array categories above —
  // a `rls_coverage` finding is only written when it found something,
  // never an unconditional zero-count row every window.
  const rlsCoverage = snapshot.rls_coverage;
  if (rlsCoverage) {
    const tablesMissingPolicies = rlsCoverage.tables_missing_policies ?? [];
    const overPrivilegedDefiners = rlsCoverage.over_privileged_definers ?? [];
    if (tablesMissingPolicies.length > 0) {
      rows.push({
        category: 'rls_coverage',
        subject: 'tables_missing_policies',
        payload: { subject: 'tables_missing_policies', count: tablesMissingPolicies.length, findings: tablesMissingPolicies },
      });
    }
    if (overPrivilegedDefiners.length > 0) {
      rows.push({
        category: 'rls_coverage',
        subject: 'over_privileged_definers',
        payload: { subject: 'over_privileged_definers', count: overPrivilegedDefiners.length, findings: overPrivilegedDefiners },
      });
    }
  }

  return rows;
}

export interface AnalysisChangeSummary {
  category: AnalysisCategory;
  countLatest: number;
  countPrior: number | null;
  delta: number | null;
}

/** One line per category comparing today's row count to ~24h-ago's row
 *  count. `countPrior`/`delta` are null when there was no prior window at
 *  all (collector too new), never coerced to 0 — a genuine "no prior
 *  sample" must read differently from "prior sample had zero findings". */
export function summarizeChangeSince(
  latest: readonly AnalysisRow[],
  prior: readonly AnalysisRow[] | null,
): AnalysisChangeSummary[] {
  const categories: AnalysisCategory[] = [
    'index_suggestion',
    'unused_index',
    'bloat',
    'seq_scan_ratio',
    'connections',
    'locks',
    'rls_coverage',
  ];

  return categories.map((category) => {
    const countLatest = latest.filter((r) => r.category === category).length;
    if (prior === null) {
      return { category, countLatest, countPrior: null, delta: null };
    }
    const countPrior = prior.filter((r) => r.category === category).length;
    return { category, countLatest, countPrior, delta: countLatest - countPrior };
  });
}
