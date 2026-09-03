import { describe, it, expect } from 'vitest';
import { buildReleaseComparison, deriveRootIncidentFacts, type ReleaseSnapshotFacts } from '../release-compare';
import type { UnifiedIncident } from '../types';
import type { CoverageSummary } from '../sources';

function facts(overrides: Partial<ReleaseSnapshotFacts> = {}): ReleaseSnapshotFacts {
  return {
    releaseSha: 'sha',
    rootIncidentCount: 2,
    affectedUsers: 10,
    journeySuccessRate: 0.95,
    dbP95Ms: 120,
    sqlstates: ['42501'],
    invariantBreaches: 0,
    dbSourceBlind: false,
    ...overrides,
  };
}

describe('buildReleaseComparison — non-DB metrics degrade independently of DB blindness', () => {
  it('all-known baseline vs current computes deltas and directional state', () => {
    const result = buildReleaseComparison({
      baseline: facts({ rootIncidentCount: 3, affectedUsers: 20, journeySuccessRate: 0.9, dbP95Ms: 150, invariantBreaches: 1 }),
      current: facts({ rootIncidentCount: 1, affectedUsers: 5, journeySuccessRate: 0.98, dbP95Ms: 100, invariantBreaches: 0 }),
    });
    expect(result.rootIncidents).toEqual({ baseline: 3, current: 1, delta: -2, state: 'improved' });
    expect(result.affectedUsers).toEqual({ baseline: 20, current: 5, delta: -15, state: 'improved' });
    expect(result.journeySuccessRate.state).toBe('improved'); // higher is better
    expect(result.dbP95Ms).toEqual({ baseline: 150, current: 100, delta: -50, state: 'improved' });
    expect(result.invariantBreaches).toEqual({ baseline: 1, current: 0, delta: -1, state: 'improved' });
  });

  it('more root incidents or affected users after the release is worsened, not improved', () => {
    const result = buildReleaseComparison({
      baseline: facts({ rootIncidentCount: 1, affectedUsers: 2 }),
      current: facts({ rootIncidentCount: 4, affectedUsers: 9 }),
    });
    expect(result.rootIncidents.state).toBe('worsened');
    expect(result.affectedUsers.state).toBe('worsened');
  });

  it('a lower journey success rate after the release is worsened', () => {
    const result = buildReleaseComparison({
      baseline: facts({ journeySuccessRate: 0.95 }),
      current: facts({ journeySuccessRate: 0.8 }),
    });
    expect(result.journeySuccessRate.state).toBe('worsened');
  });

  it('root incidents unknown on either side yields unknown, even when the DB side is fully known', () => {
    const result = buildReleaseComparison({
      baseline: facts({ rootIncidentCount: null }),
      current: facts({ rootIncidentCount: 2 }),
    });
    expect(result.rootIncidents.state).toBe('unknown');
    expect(result.rootIncidents.delta).toBeNull();
    // DB metrics are unaffected — root-incident blindness is not DB blindness.
    expect(result.dbP95Ms.state).not.toBe('unknown');
  });

  it('identical values on both sides -> unchanged, not improved or worsened', () => {
    const result = buildReleaseComparison({ baseline: facts(), current: facts() });
    expect(result.rootIncidents.state).toBe('unchanged');
    expect(result.dbP95Ms.state).toBe('unchanged');
  });
});

describe('buildReleaseComparison — DB blindness forces DB-derived metrics unknown together', () => {
  it('current DB source blind forces dbP95Ms, invariantBreaches and newSqlstates to unknown', () => {
    const result = buildReleaseComparison({
      baseline: facts(),
      current: facts({ dbSourceBlind: true, dbP95Ms: 999, invariantBreaches: 0, sqlstates: ['99999'] }),
    });
    expect(result.dbBlind).toBe(true);
    expect(result.dbP95Ms).toEqual({ baseline: null, current: null, delta: null, state: 'unknown' });
    expect(result.invariantBreaches.state).toBe('unknown');
    expect(result.newSqlstates).toBeNull();
  });

  it('baseline DB source blind ALSO forces the delta unknown, even though current is fully known', () => {
    const result = buildReleaseComparison({
      baseline: facts({ dbSourceBlind: true }),
      current: facts(),
    });
    expect(result.dbBlind).toBe(true);
    expect(result.dbP95Ms.state).toBe('unknown');
  });

  it('a blind DB source with invariantBreaches: 0 does NOT render as a real zero', () => {
    // The exact trap the header warns about: a caller passed a raw 0 while
    // the source that would have counted it could not be read.
    const result = buildReleaseComparison({
      baseline: facts({ invariantBreaches: 0 }),
      current: facts({ invariantBreaches: 0, dbSourceBlind: true }),
    });
    expect(result.invariantBreaches).not.toEqual({ baseline: 0, current: 0, delta: 0, state: 'unchanged' });
    expect(result.invariantBreaches.state).toBe('unknown');
  });

  it('neither side blind -> newSqlstates is the real set difference, current minus baseline', () => {
    const result = buildReleaseComparison({
      baseline: facts({ sqlstates: ['42501', '23505'] }),
      current: facts({ sqlstates: ['42501', '57014'] }),
    });
    expect(result.newSqlstates).toEqual(['57014']);
  });

  it('no new sqlstates is a real, trustworthy empty array when neither side is blind', () => {
    const result = buildReleaseComparison({
      baseline: facts({ sqlstates: ['42501'] }),
      current: facts({ sqlstates: ['42501'] }),
    });
    expect(result.newSqlstates).toEqual([]);
    expect(result.dbBlind).toBe(false);
  });
});

function incident(id: string, overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: `incident ${id}`,
    description: '',
    severity: 'error',
    lifecycle: { state: 'new', headline: '', because: [] },
    firstSeen: '2026-09-01T00:00:00Z',
    lastSeen: '2026-09-01T00:00:00Z',
    occurrences: 1,
    affectedUsers: 0,
    affectedUsersKnown: false,
    sources: [],
    corroboration: 1,
    appFingerprints: [id],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: null,
    featureId: null,
    actionName: null,
    errorCode: null,
    sport: null,
    klass: 'defect',
    actionable: true,
    klassReason: 'r',
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: '2026-09-01T00:00:00Z',
    isFixture: false,
    ...overrides,
  };
}

function coverage(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    reading: 4,
    partial: 0,
    blind: 0,
    unknown: 0,
    total: 4,
    anyBlind: false,
    blindSources: [],
    oldestAgeMs: 0,
    worst: 'reading',
    ...overrides,
  };
}

describe('deriveRootIncidentFacts', () => {
  it('counts only actionable, non-resolved/non-not-a-defect incidents', () => {
    const incidents = [
      incident('a', { actionable: true, lifecycle: { state: 'new', headline: '', because: [] } }),
      incident('b', { actionable: true, lifecycle: { state: 'resolved', headline: '', because: [] } }),
      incident('c', { actionable: false, lifecycle: { state: 'new', headline: '', because: [] } }),
      incident('d', { actionable: true, lifecycle: { state: 'not-a-defect', headline: '', because: [] } }),
    ];
    const result = deriveRootIncidentFacts(incidents, coverage());
    expect(result.rootIncidentCount).toBe(1);
  });

  it('applies the Truth Strip exclusions: expected recurrences and QA fixtures never count', () => {
    const incidents = [
      incident('a', { actionable: true, lifecycle: { state: 'new', headline: '', because: [] } }),
      incident('fixture', { actionable: true, isFixture: true, affectedUsers: 9, affectedUsersKnown: true }),
      incident('expected', {
        actionable: true,
        lifecycle: { state: 'expected-recurrence', headline: '', because: [] },
        affectedUsers: 4,
        affectedUsersKnown: true,
      }),
    ];
    const result = deriveRootIncidentFacts(incidents, coverage());
    expect(result.rootIncidentCount).toBe(1);
    expect(result.affectedUsers).toBe(incidents[0].affectedUsersKnown ? incidents[0].affectedUsers : 0);
  });

  it('sums affectedUsers only across incidents whose count is KNOWN', () => {
    const incidents = [
      incident('a', { affectedUsers: 5, affectedUsersKnown: true }),
      incident('b', { affectedUsers: 3, affectedUsersKnown: true }),
      incident('c', { affectedUsers: 0, affectedUsersKnown: false }), // unknown, not a real zero — excluded
    ];
    const result = deriveRootIncidentFacts(incidents, coverage());
    expect(result.affectedUsers).toBe(8);
  });

  it('any blind source in coverage yields unknown for BOTH facts, never a partial count', () => {
    const incidents = [incident('a')];
    const result = deriveRootIncidentFacts(incidents, coverage({ anyBlind: true, blind: 1 }));
    expect(result.rootIncidentCount).toBeNull();
    expect(result.affectedUsers).toBeNull();
  });
});
