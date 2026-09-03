// Pure half only — `fetchCurrentReleaseWatch` is the I/O boundary (Vercel /
// release-ledger / Supabase Management API reads) and is intentionally NOT
// unit-tested here, matching `fetchDeployFreshness` and
// `fetchProductionMigrationHead`'s own convention (see release-watch.ts's
// module header).

import { describe, it, expect } from 'vitest';
import {
  classifyIncidentReleaseRelationship,
  newFingerprintsTotalFor,
  toBaselineSnapshotFacts,
  toCurrentSnapshotFacts,
  classifyReleaseWatch,
  type ReleaseRelationshipInput,
} from '../release-watch';
import { PROVEN_HEALTHY_WINDOW_MS, type ReleaseWatchEvidence } from '../release-context';
import type { UnifiedIncident } from '../types';
import type { ReleaseCardData } from '@/lib/admin/data/release-ledger';
import type { CoverageSummary } from '../sources';

function lifecycle(state: UnifiedIncident['lifecycle']['state']): UnifiedIncident['lifecycle'] {
  return { state, headline: 'h', because: [] };
}

function releaseCard(overrides: Partial<ReleaseCardData> = {}): ReleaseCardData {
  return {
    uid: 'r1',
    commitSha: 'abc1234',
    commitMessage: 'm',
    commitRef: 'main',
    commitAuthor: 'a',
    createdAt: Date.parse('2026-09-02T12:00:00Z'),
    isLive: true,
    gatheringSignal: false,
    errorsBefore2h: 0,
    errorsAfter2h: 0,
    delta: 0,
    verdict: { tone: 'neutral', label: 'neutral' },
    resolvedAndQuietSince: 0,
    newFingerprintsSince: 0,
    topFeatureDeltas: [],
    newFingerprintSamples: [],
    ...overrides,
  };
}

describe('classifyIncidentReleaseRelationship', () => {
  it('unknown when the release deploy time is unknown', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-02T12:00:00Z', lifecycle: lifecycle('new'), featureId: null },
      releaseDeployedAtMs: null,
    });
    expect(verdict.relationship).toBe('unknown');
  });

  it('existed-before-release for an unchanged pre-existing incident', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-08-01T00:00:00Z', lifecycle: lifecycle('new'), featureId: null },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    });
    expect(verdict.relationship).toBe('existed-before-release');
  });

  it('regressed-after-release when a pre-existing incident is in the "regressed" lifecycle state', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-08-01T00:00:00Z', lifecycle: lifecycle('regressed'), featureId: null },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    });
    expect(verdict.relationship).toBe('regressed-after-release');
  });

  it('never fabricates new-after-release from proximity alone, even for a feature with a positive error delta', () => {
    // Regression test for PR #1789 review defect #3: this used to pass the
    // incident's own feature's post-deploy error-count delta as
    // `featureChangedInRelease` "corroborating" evidence. That delta is
    // computed from the SAME occurrences as the incident being classified —
    // a brand-new incident's own first occurrences are what move its
    // feature's delta positive — so it was never independent evidence, only
    // proximity measuring itself. No real code-changed signal exists in this
    // codebase yet, so this must always resolve to 'no-causal-signal' for a
    // proximate incident, regardless of how "worsened" the feature looks.
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-02T12:07:00Z', lifecycle: lifecycle('new'), featureId: 'round_tracking' },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    });
    expect(verdict.relationship).toBe('no-causal-signal');
    expect(verdict.confidence).toBe(0);
  });

  it('no-causal-signal when first seen well after the release deploy', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-05T00:00:00Z', lifecycle: lifecycle('new'), featureId: 'round_tracking' },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    });
    expect(verdict.relationship).toBe('no-causal-signal');
  });

  it('ReleaseRelationshipInput can never regain a feature-delta corroboration key (type-level pin)', () => {
    // The runtime test above ("never fabricates new-after-release...") calls
    // classifyIncidentReleaseRelationship WITHOUT any feature-delta field, so
    // it would pass equally well against a reverted module that re-added
    // `featureRegressedInRelease` as an OPTIONAL field left unset — it proves
    // "no evidence given -> no-causal-signal", not "the field is gone". This
    // pins the actual fix: if `featureRegressedInRelease` (or any same-shaped
    // key) is ever reintroduced on ReleaseRelationshipInput, HasFeatureDeltaKey
    // resolves to `true` and the `const` assignment below fails to COMPILE
    // (caught by `npx tsc --noEmit`, before any test runs), not just at
    // runtime.
    type HasFeatureDeltaKey = 'featureRegressedInRelease' extends keyof ReleaseRelationshipInput ? true : false;
    const hasFeatureDeltaKey: HasFeatureDeltaKey = false;
    expect(hasFeatureDeltaKey).toBe(false);
  });
});

describe('newFingerprintsTotalFor', () => {
  it('reads the uncapped newFingerprintsSince counter, never newFingerprintSamples.length', () => {
    // Regression test for defect #1: release-ledger.ts caps newFingerprintSamples
    // at 5 (a display sample) but newFingerprintsSince is the true count.
    const card = releaseCard({
      newFingerprintsSince: 23,
      newFingerprintSamples: Array.from({ length: 5 }, (_, i) => ({
        fingerprint: `fp-${i}`,
        title: 't',
        severity: 'error',
        firstSeen: '2026-09-02T12:05:00Z',
      })),
    });
    expect(newFingerprintsTotalFor(card)).toBe(23);
    expect(card.newFingerprintSamples).toHaveLength(5); // sanity: the cap is real
  });

  it('is 0, never null-crashing, when there is no current card', () => {
    expect(newFingerprintsTotalFor(null)).toBe(0);
  });
});

describe('newFingerprintsTotalFor feeding classifyReleaseWatch (PR #1789 second review)', () => {
  function watchEvidence(overrides: Partial<ReleaseWatchEvidence> = {}): ReleaseWatchEvidence {
    return {
      releaseDeployedAtMs: Date.parse('2026-09-01T00:00:00Z'),
      now: Date.parse('2026-09-01T00:00:00Z') + PROVEN_HEALTHY_WINDOW_MS + 1,
      newIncidentsCount: 0,
      regressedIncidentsCount: 0,
      rollbackRecommended: false,
      sourceCoverageBlind: false,
      ...overrides,
    };
  }

  it('a release with real new fingerprints and no regression must never read proven-healthy or clean-so-far', () => {
    // Regression test for the defect fix #3 exposed: with every
    // classifyIncidentReleaseRelationship corroboration field null (see that
    // function's own header), 'new-after-release' became structurally
    // unreachable, so a `newIncidentsCount` sourced from counting
    // relationships was ALWAYS 0 — classifyReleaseWatch's
    // `newIncidentsCount > 0 -> 'degraded'` rule went permanently dead, and a
    // release with real new fingerprints fell through to 'clean-so-far' /
    // 'proven-healthy' (a green pill) purely because enough wall-clock time
    // had passed, regardless of the fingerprints panel showing "N new"
    // alongside it. newIncidentsCount must come from the real,
    // release-ledger-derived fingerprint count (newFingerprintsTotalFor),
    // not from the relationship classifier.
    const card = releaseCard({ newFingerprintsSince: 23 });
    const state = classifyReleaseWatch(watchEvidence({ newIncidentsCount: newFingerprintsTotalFor(card) }));
    expect(state).toBe('degraded');
    expect(state).not.toBe('proven-healthy');
    expect(state).not.toBe('clean-so-far');
  });

  it('a release with zero new fingerprints and no regression correctly reaches proven-healthy after the window', () => {
    const card = releaseCard({ newFingerprintsSince: 0 });
    const state = classifyReleaseWatch(watchEvidence({ newIncidentsCount: newFingerprintsTotalFor(card) }));
    expect(state).toBe('proven-healthy');
  });
});

function coverage(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    reading: 4,
    partial: 0,
    blind: 0,
    unknown: 0,
    total: 4,
    anyBlind: false,
    blindSources: [],
    oldestAgeMs: 1000,
    worst: 'reading',
    ...overrides,
  };
}

describe('toBaselineSnapshotFacts / toCurrentSnapshotFacts', () => {
  const cleanCoverage: CoverageSummary = coverage();

  function incident(id: string, overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
    return {
      id,
      linkTarget: `/admin/errors/${id}`,
      title: id,
      description: id,
      severity: 'error',
      lifecycle: lifecycle('new'),
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
      isFixture: false,
      analysis: null,
      repair: null,
      deployProof: null,
      resolution: null,
      proof: [],
      proofGaps: [],
      evidenceCoverage: { dimensions: [], present: 0, total: 7 },
      report: '',
      computedAt: '2026-09-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('baseline never reuses the live board for rootIncidentCount/affectedUsers — always unknown', () => {
    // Regression test for defect #2: baseline and current used to both read
    // `board.incidents` (the same, live board), so a board with e.g. 5
    // actionable incidents produced baseline=5, current=5 -> a comparison
    // that reports "unchanged" for a quantity that was never measured for
    // the baseline release at all. Baseline must be unknown until this
    // codebase has a reign-scoped incident model.
    const board = [incident('a'), incident('b')];
    const baseline = toBaselineSnapshotFacts(releaseCard());
    expect(baseline.rootIncidentCount).toBeNull();
    expect(baseline.affectedUsers).toBeNull();

    const current = toCurrentSnapshotFacts(releaseCard(), board, cleanCoverage);
    expect(current.rootIncidentCount).toBe(2);
  });

  it('a comparison built from these never reports "unchanged" for an unmeasured baseline', async () => {
    const { buildReleaseComparison } = await import('../release-compare');
    const board = [incident('a'), incident('b'), incident('c')];
    const comparison = buildReleaseComparison({
      baseline: toBaselineSnapshotFacts(releaseCard()),
      current: toCurrentSnapshotFacts(releaseCard(), board, cleanCoverage),
    });
    expect(comparison.rootIncidents.state).toBe('unknown');
    expect(comparison.rootIncidents.baseline).toBeNull();
    expect(comparison.rootIncidents.current).toBe(3);
  });
});
