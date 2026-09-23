import { describe, expect, it } from 'vitest';
import { flattenAnalysisSnapshot, summarizeChangeSince, type AnalysisSnapshotRaw, type AnalysisRow } from '../db-analysis';

function emptySnapshot(overrides: Partial<AnalysisSnapshotRaw> = {}): AnalysisSnapshotRaw {
  return {
    unused_indexes: [],
    bloat: [],
    seq_scan_ratio: [],
    connections: [],
    locks: [],
    index_suggestions: [],
    rls_coverage: { tables_missing_policies: [], over_privileged_definers: [] },
    has_pgstattuple: false,
    has_index_advisor: false,
    ...overrides,
  };
}

describe('flattenAnalysisSnapshot', () => {
  it('flattens each category into rows with a derived subject', () => {
    const rows = flattenAnalysisSnapshot(
      emptySnapshot({
        unused_indexes: [{ index_name: 'idx_foo', schema_name: 'public' }],
        connections: [{ state: 'idle', count: 3 }],
      }),
    );

    expect(rows).toEqual([
      { category: 'unused_index', subject: 'idx_foo', payload: { index_name: 'idx_foo', schema_name: 'public' } },
      { category: 'connections', subject: 'idle', payload: { state: 'idle', count: 3 } },
    ]);
  });

  it('produces zero rows for an all-empty snapshot', () => {
    expect(flattenAnalysisSnapshot(emptySnapshot())).toEqual([]);
  });

  it('falls back to a null subject when the expected field is missing', () => {
    const rows = flattenAnalysisSnapshot(emptySnapshot({ bloat: [{ note: 'pgstattuple not installed' }] }));
    expect(rows).toEqual([{ category: 'bloat', subject: null, payload: { note: 'pgstattuple not installed' } }]);
  });
});

describe('summarizeChangeSince', () => {
  const latest: AnalysisRow[] = [
    { category: 'unused_index', subject: 'a', payload: {} },
    { category: 'unused_index', subject: 'b', payload: {} },
    { category: 'bloat', subject: 'c', payload: {} },
  ];

  it('returns null delta when there is no prior window', () => {
    const summary = summarizeChangeSince(latest, null);
    const unused = summary.find((s) => s.category === 'unused_index')!;
    expect(unused.countLatest).toBe(2);
    expect(unused.countPrior).toBeNull();
    expect(unused.delta).toBeNull();
  });

  it('computes a positive delta when findings increased', () => {
    const prior: AnalysisRow[] = [{ category: 'unused_index', subject: 'a', payload: {} }];
    const summary = summarizeChangeSince(latest, prior);
    const unused = summary.find((s) => s.category === 'unused_index')!;
    expect(unused).toEqual({ category: 'unused_index', countLatest: 2, countPrior: 1, delta: 1 });
  });

  it('reports a category with zero findings in both windows as a real zero, not null', () => {
    const summary = summarizeChangeSince(latest, []);
    const locks = summary.find((s) => s.category === 'locks')!;
    expect(locks).toEqual({ category: 'locks', countLatest: 0, countPrior: 0, delta: 0 });
  });

  it('covers all seven categories even when absent from both windows', () => {
    const summary = summarizeChangeSince([], []);
    expect(summary.map((s) => s.category).sort()).toEqual(
      ['bloat', 'connections', 'index_suggestion', 'locks', 'rls_coverage', 'seq_scan_ratio', 'unused_index'].sort(),
    );
  });
});

describe('flattenAnalysisSnapshot — rls_coverage', () => {
  it('produces a synthetic row only for the finding that has entries', () => {
    const rows = flattenAnalysisSnapshot(
      emptySnapshot({
        rls_coverage: {
          tables_missing_policies: [{ schema: 'helm_debug', table: 'db_stat_deltas' }],
          over_privileged_definers: [],
        },
      }),
    );

    expect(rows).toEqual([
      {
        category: 'rls_coverage',
        subject: 'tables_missing_policies',
        payload: {
          subject: 'tables_missing_policies',
          count: 1,
          findings: [{ schema: 'helm_debug', table: 'db_stat_deltas' }],
        },
      },
    ]);
  });

  it('produces zero rls_coverage rows when both findings are empty', () => {
    expect(flattenAnalysisSnapshot(emptySnapshot())).toEqual([]);
  });

  it('produces two rows when both findings are non-empty', () => {
    const rows = flattenAnalysisSnapshot(
      emptySnapshot({
        rls_coverage: {
          tables_missing_policies: [{ schema: 'public', table: 'no_rls' }],
          over_privileged_definers: [{ schema: 'public', name: 'unsafe_fn', granted_to: ['authenticated'] }],
        },
      }),
    );
    expect(rows.map((r) => r.subject).sort()).toEqual(['over_privileged_definers', 'tables_missing_policies']);
  });
});
