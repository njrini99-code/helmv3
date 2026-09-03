import { describe, it, expect } from 'vitest';
import { buildInvariantLattice } from '../invariant-lattice';
import type { QualifierInvariantResult } from '@/lib/admin/qualifier-invariants';
import type { IntegrityRow } from '@/lib/admin/data/jobs';
import type { InvariantCheckOutcome } from '@/lib/reliability/invariants/run-checks';

function qualifierResult(overrides: Partial<QualifierInvariantResult> = {}): QualifierInvariantResult {
  return {
    id: 'ownership',
    label: 'Qualifier ownership',
    rule: 'Every qualifier round belongs to exactly one qualifier.',
    consequence: 'A misattributed round corrupts standings.',
    severity: 'critical',
    violations: 0,
    sampleRoundIds: [],
    ...overrides,
  };
}

function integrityRow(overrides: Partial<IntegrityRow> = {}): IntegrityRow {
  return {
    check: 'orphans',
    status: 'pass',
    count: 0,
    lastRunAt: '2026-09-03T00:00:00.000Z',
    sample: [],
    ...overrides,
  };
}

function roundGraphCheck(overrides: Partial<InvariantCheckOutcome> = {}): InvariantCheckOutcome {
  return {
    id: 'round-graph-orphaned-shots',
    label: 'Shots reference a persisted hole',
    featureId: 'shot_tracking',
    severity: 'critical',
    state: 'pass',
    detail: 'no violations found',
    violations: 0,
    sampleIds: [],
    checkedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildInvariantLattice', () => {
  it('always includes the two unreadable CI-only sources as unknown, never fabricated pass/fail', () => {
    const view = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [] });
    const schema = view.rows.find((r) => r.id === 'schema-invariants')!;
    const business = view.rows.find((r) => r.id === 'business-contracts')!;
    expect(schema.state).toBe('unknown');
    expect(business.state).toBe('unknown');
  });

  it('a qualifier invariant with zero violations reads pass, never fail', () => {
    const view = buildInvariantLattice({ qualifierInvariants: [qualifierResult({ violations: 0 })], integrityRows: [] });
    const row = view.rows.find((r) => r.id === 'qualifier-ownership')!;
    expect(row.state).toBe('pass');
    expect(row.severity).toBeNull();
  });

  it('a qualifier invariant with violations reads fail and carries its own severity, never a fabricated total', () => {
    const view = buildInvariantLattice({
      qualifierInvariants: [qualifierResult({ violations: 3, severity: 'critical' })],
      integrityRows: [],
    });
    const row = view.rows.find((r) => r.id === 'qualifier-ownership')!;
    expect(row.state).toBe('fail');
    expect(row.severity).toBe('critical');
    expect(row.detail).toBe('3 violations');
  });

  it('qualifier read failure (null) reads a single unknown row, distinct from a clean empty read', () => {
    const failed = buildInvariantLattice({ qualifierInvariants: null, integrityRows: [] });
    expect(failed.rows.find((r) => r.id === 'qualifiers-unreadable')!.state).toBe('unknown');

    const cleanEmpty = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [] });
    expect(cleanEmpty.rows.find((r) => r.id === 'qualifiers-unreadable')).toBeUndefined();
  });

  it('a failing integrity check is always severity critical — a silent violation outranks a warning', () => {
    const view = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [integrityRow({ status: 'fail', count: 5 })] });
    const row = view.rows.find((r) => r.id === 'integrity-orphans')!;
    expect(row.state).toBe('fail');
    expect(row.severity).toBe('critical');
    expect(row.detail).toBe('5 rows affected');
  });

  it('integrity read failure (null) reads unknown, distinct from a clean empty read', () => {
    const failed = buildInvariantLattice({ qualifierInvariants: [], integrityRows: null });
    expect(failed.rows.find((r) => r.id === 'integrity-unreadable')!.state).toBe('unknown');
  });

  it('anyFailing is true only from a real fail row, never from an unknown one', () => {
    const onlyUnknown = buildInvariantLattice({ qualifierInvariants: null, integrityRows: null });
    expect(onlyUnknown.anyFailing).toBe(false);

    const withFail = buildInvariantLattice({ qualifierInvariants: [qualifierResult({ violations: 1 })], integrityRows: [] });
    expect(withFail.anyFailing).toBe(true);
  });

  it('groups rows so a caller can render by feature/category without re-deriving the grouping', () => {
    const view = buildInvariantLattice({
      qualifierInvariants: [qualifierResult()],
      integrityRows: [integrityRow()],
    });
    const groups = new Set(view.rows.map((r) => r.group));
    expect(groups).toEqual(new Set(['Qualifiers', 'Platform integrity', 'Round graph', 'Schema', 'Business contracts']));
  });

  it('omitting roundGraphChecks (a caller predating Phase D.4.3) still compiles and renders one unknown row', () => {
    const view = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [] });
    const row = view.rows.find((r) => r.id === 'round-graph-unreadable')!;
    expect(row.state).toBe('unknown');
  });

  it('a passing round-graph check reads pass with no severity', () => {
    const view = buildInvariantLattice({
      qualifierInvariants: [],
      integrityRows: [],
      roundGraphChecks: [roundGraphCheck({ state: 'pass' })],
    });
    const row = view.rows.find((r) => r.id === 'round-graph-round-graph-orphaned-shots')!;
    expect(row.state).toBe('pass');
    expect(row.severity).toBeNull();
  });

  it('a failing round-graph check reads fail and keeps its own severity', () => {
    const view = buildInvariantLattice({
      qualifierInvariants: [],
      integrityRows: [],
      roundGraphChecks: [roundGraphCheck({ state: 'fail', severity: 'critical', violations: 4, detail: '4 violations' })],
    });
    const row = view.rows.find((r) => r.id === 'round-graph-round-graph-orphaned-shots')!;
    expect(row.state).toBe('fail');
    expect(row.severity).toBe('critical');
    expect(row.detail).toBe('4 violations');
    expect(view.anyFailing).toBe(true);
  });

  it('a round-graph check reported unknown (timeout) never carries a severity, even when its declared severity is critical', () => {
    const view = buildInvariantLattice({
      qualifierInvariants: [],
      integrityRows: [],
      roundGraphChecks: [roundGraphCheck({ state: 'unknown', severity: 'critical', violations: null, detail: 'Could not be evaluated this run: timed out.' })],
    });
    const row = view.rows.find((r) => r.id === 'round-graph-round-graph-orphaned-shots')!;
    expect(row.state).toBe('unknown');
    expect(row.severity).toBeNull();
    expect(view.anyFailing).toBe(false);
  });

  it('roundGraphChecks: null (a failed read) reads a single unknown row, distinct from an empty array', () => {
    const failed = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [], roundGraphChecks: null });
    expect(failed.rows.find((r) => r.id === 'round-graph-unreadable')!.state).toBe('unknown');

    const cleanEmpty = buildInvariantLattice({ qualifierInvariants: [], integrityRows: [], roundGraphChecks: [] });
    expect(cleanEmpty.rows.find((r) => r.id === 'round-graph-unreadable')).toBeUndefined();
  });
});
