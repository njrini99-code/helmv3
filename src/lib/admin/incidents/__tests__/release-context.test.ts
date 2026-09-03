import { describe, it, expect } from 'vitest';
import {
  buildAiConfigIdentity,
  buildRuntimeIdentityTriplet,
  classifyReleaseRelationship,
  classifyReleaseWatch,
  buildReleaseContext,
  OBSERVING_WINDOW_MS,
  PROVEN_HEALTHY_WINDOW_MS,
  type ReleaseRelationshipEvidence,
  type ReleaseWatchEvidence,
} from '../release-context';

describe('buildAiConfigIdentity', () => {
  it('is deterministic regardless of input key order', () => {
    const a = buildAiConfigIdentity({ coach_chat: 'x', round_review: 'y', hero_narrative: 'z' });
    const b = buildAiConfigIdentity({ hero_narrative: 'z', round_review: 'y', coach_chat: 'x' });
    expect(a).toBe(b);
    expect(a).toBe('coach_chat=x|hero_narrative=z|round_review=y');
  });

  it('changes when any task->model mapping changes', () => {
    const a = buildAiConfigIdentity({ coach_chat: 'sonnet', round_review: 'haiku', hero_narrative: 'haiku' });
    const b = buildAiConfigIdentity({ coach_chat: 'sonnet-5', round_review: 'haiku', hero_narrative: 'haiku' });
    expect(a).not.toBe(b);
  });

  it('defaults to the real MODEL_FOR_TASK when called with no argument', () => {
    const identity = buildAiConfigIdentity();
    expect(identity).toContain('coach_chat=');
    expect(identity).toContain('round_review=');
    expect(identity).toContain('hero_narrative=');
  });
});

describe('buildRuntimeIdentityTriplet', () => {
  it('carries the app sha and migration head straight through, with a derived AI identity', () => {
    const triplet = buildRuntimeIdentityTriplet({
      appSha: '8e4c5b7d',
      dbMigrationHead: '20260902120000',
      dbMigrationHeadState: 'known',
      modelForTask: { coach_chat: 'sonnet', round_review: 'haiku', hero_narrative: 'haiku' },
    });
    expect(triplet.appSha).toBe('8e4c5b7d');
    expect(triplet.dbMigrationHead).toBe('20260902120000');
    expect(triplet.dbMigrationHeadState).toBe('known');
    expect(triplet.aiConfigIdentity).toBe('coach_chat=sonnet|hero_narrative=haiku|round_review=haiku');
  });

  it('an unknown migration head is null with state unknown, never a fabricated value', () => {
    const triplet = buildRuntimeIdentityTriplet({
      appSha: '8e4c5b7d',
      dbMigrationHead: null,
      dbMigrationHeadState: 'unknown',
    });
    expect(triplet.dbMigrationHead).toBeNull();
    expect(triplet.dbMigrationHeadState).toBe('unknown');
  });
});

function evidence(overrides: Partial<ReleaseRelationshipEvidence> = {}): ReleaseRelationshipEvidence {
  return {
    firstSeenMs: Date.parse('2026-09-02T12:07:00Z'),
    releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    occurrenceTrend: 'unknown',
    featureChangedInRelease: null,
    codeInTraceChangedInRelease: null,
    candidateCohortOnly: null,
    baselineCohortClean: null,
    replayReproducesOnNewShaOnly: null,
    ...overrides,
  };
}

describe('classifyReleaseRelationship', () => {
  it('unknown deploy time -> UNKNOWN, never guessed', () => {
    const v = classifyReleaseRelationship(evidence({ releaseDeployedAtMs: null }));
    expect(v.relationship).toBe('unknown');
    expect(v.confidence).toBe(0);
  });

  it('first seen before deploy, trend unchanged -> EXISTED BEFORE RELEASE', () => {
    const v = classifyReleaseRelationship(
      evidence({ firstSeenMs: Date.parse('2026-08-01T00:00:00Z'), occurrenceTrend: 'unchanged' }),
    );
    expect(v.relationship).toBe('existed-before-release');
  });

  it('first seen before deploy, trend worsened -> REGRESSED AFTER RELEASE', () => {
    const v = classifyReleaseRelationship(
      evidence({ firstSeenMs: Date.parse('2026-08-01T00:00:00Z'), occurrenceTrend: 'worsened' }),
    );
    expect(v.relationship).toBe('regressed-after-release');
  });

  it('first seen before deploy, trend improved -> IMPROVED AFTER RELEASE', () => {
    const v = classifyReleaseRelationship(
      evidence({ firstSeenMs: Date.parse('2026-08-01T00:00:00Z'), occurrenceTrend: 'improved' }),
    );
    expect(v.relationship).toBe('improved-after-release');
  });

  it('proximity ALONE (new, shortly after deploy, no corroborating signal) -> NO CAUSAL SIGNAL, not NEW AFTER RELEASE', () => {
    const v = classifyReleaseRelationship(evidence()); // 7 minutes after deploy, nothing else set
    expect(v.relationship).toBe('no-causal-signal');
    expect(v.evidenceAgainst[0]).toMatch(/proximity alone is not causation/i);
  });

  it('proximity + one corroborating signal -> NEW AFTER RELEASE, confidence below 1', () => {
    const v = classifyReleaseRelationship(evidence({ featureChangedInRelease: true }));
    expect(v.relationship).toBe('new-after-release');
    expect(v.confidence).toBeLessThan(1);
    expect(v.confidence).toBeGreaterThan(0);
  });

  it('confidence rises with more corroborating signals, but is capped below 1 even with every signal', () => {
    const one = classifyReleaseRelationship(evidence({ featureChangedInRelease: true }));
    const all = classifyReleaseRelationship(
      evidence({
        featureChangedInRelease: true,
        codeInTraceChangedInRelease: true,
        candidateCohortOnly: true,
        baselineCohortClean: true,
        replayReproducesOnNewShaOnly: true,
      }),
    );
    expect(all.confidence).toBeGreaterThan(one.confidence);
    expect(all.confidence).toBeLessThan(1);
    expect(all.evidenceFor).toHaveLength(5);
  });

  it('new, but first seen well outside the proximity window -> NO CAUSAL SIGNAL even with a supporting signal set', () => {
    const v = classifyReleaseRelationship(
      evidence({
        firstSeenMs: Date.parse('2026-09-05T00:00:00Z'), // 3 days after deploy
        featureChangedInRelease: true,
      }),
    );
    expect(v.relationship).toBe('no-causal-signal');
  });

  it('a custom proximity window changes the boundary', () => {
    const tenMinutesAfter = evidence({
      firstSeenMs: Date.parse('2026-09-02T12:10:00Z'),
      featureChangedInRelease: true,
    });
    expect(classifyReleaseRelationship({ ...tenMinutesAfter, proximityWindowMs: 5 * 60_000 }).relationship).toBe(
      'no-causal-signal',
    );
    expect(classifyReleaseRelationship({ ...tenMinutesAfter, proximityWindowMs: 15 * 60_000 }).relationship).toBe(
      'new-after-release',
    );
  });
});

function watchEvidence(overrides: Partial<ReleaseWatchEvidence> = {}): ReleaseWatchEvidence {
  return {
    releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
    now: Date.parse('2026-09-02T12:00:00Z'),
    newIncidentsCount: 0,
    regressedIncidentsCount: 0,
    rollbackRecommended: false,
    sourceCoverageBlind: false,
    ...overrides,
  };
}

describe('classifyReleaseWatch', () => {
  it('unknown deploy time -> UNKNOWN', () => {
    expect(classifyReleaseWatch(watchEvidence({ releaseDeployedAtMs: null }))).toBe('unknown');
  });

  it('freshly deployed, nothing bad yet -> OBSERVING', () => {
    expect(classifyReleaseWatch(watchEvidence({ now: watchEvidence().now + 5 * 60_000 }))).toBe('observing');
  });

  it('past the observing window, still nothing bad, not yet proven -> CLEAN SO FAR', () => {
    const w = watchEvidence();
    expect(
      classifyReleaseWatch({ ...w, now: w.releaseDeployedAtMs! + OBSERVING_WINDOW_MS + 60_000 }),
    ).toBe('clean-so-far');
  });

  it('a regressed incident -> REGRESSION DETECTED, regardless of elapsed time', () => {
    expect(classifyReleaseWatch(watchEvidence({ regressedIncidentsCount: 1 }))).toBe('regression-detected');
  });

  it('a regressed incident with rollback recommended -> ROLLBACK RECOMMENDED outranks REGRESSION DETECTED', () => {
    expect(
      classifyReleaseWatch(watchEvidence({ regressedIncidentsCount: 1, rollbackRecommended: true })),
    ).toBe('rollback-recommended');
  });

  it('a new incident, no regression -> DEGRADED', () => {
    expect(classifyReleaseWatch(watchEvidence({ newIncidentsCount: 1 }))).toBe('degraded');
  });

  it('regression outranks a new incident when both are present', () => {
    expect(
      classifyReleaseWatch(watchEvidence({ newIncidentsCount: 3, regressedIncidentsCount: 1 })),
    ).toBe('regression-detected');
  });

  it('past the proven-healthy window with full coverage and nothing bad -> PROVEN HEALTHY', () => {
    const w = watchEvidence();
    expect(
      classifyReleaseWatch({ ...w, now: w.releaseDeployedAtMs! + PROVEN_HEALTHY_WINDOW_MS + 60_000 }),
    ).toBe('proven-healthy');
  });

  it('bad news always wins over elapsed time — a week-old release with a live regression is still REGRESSION DETECTED', () => {
    const w = watchEvidence();
    expect(
      classifyReleaseWatch({
        ...w,
        now: w.releaseDeployedAtMs! + 7 * 24 * 3600_000,
        regressedIncidentsCount: 1,
      }),
    ).toBe('regression-detected');
  });

  it('past the proven-healthy window but a source is blind -> UNKNOWN, never PROVEN HEALTHY on silence', () => {
    const w = watchEvidence();
    expect(
      classifyReleaseWatch({
        ...w,
        now: w.releaseDeployedAtMs! + PROVEN_HEALTHY_WINDOW_MS + 60_000,
        sourceCoverageBlind: true,
      }),
    ).toBe('unknown');
  });
});

describe('buildReleaseContext', () => {
  it('assembles a full ReleaseContext, deriving releaseWatch from classifyReleaseWatch', () => {
    const ctx = buildReleaseContext({
      releaseSha: '8e4c5b7d',
      deployedAt: '2026-09-02T12:00:00Z',
      baselineReleaseSha: 'a1b2c3d4',
      runtimeIdentity: buildRuntimeIdentityTriplet({
        appSha: '8e4c5b7d',
        dbMigrationHead: null,
        dbMigrationHeadState: 'unknown',
      }),
      includedPrs: [{ number: 1780, title: 'fix(golf): x', mergedAt: '2026-09-02T11:00:00Z', url: 'https://x' }],
      watchEvidence: watchEvidence(),
      newFingerprints: ['fp-1'],
      regressedFingerprints: [],
    });
    expect(ctx.releaseSha).toBe('8e4c5b7d');
    // newFingerprints/regressedFingerprints are carried through as-is; the
    // releaseWatch STATE comes only from watchEvidence (freshly deployed here).
    expect(ctx.releaseWatch).toBe('observing');
    expect(ctx.includedPrs).toHaveLength(1);
    expect(ctx.cohort).toBeNull();
  });

  it('cohort defaults to null when omitted, and passes through when provided', () => {
    const base = {
      releaseSha: 'sha',
      deployedAt: null,
      baselineReleaseSha: null,
      runtimeIdentity: buildRuntimeIdentityTriplet({ appSha: null, dbMigrationHead: null, dbMigrationHeadState: 'unknown' as const }),
      includedPrs: [],
      watchEvidence: watchEvidence({ releaseDeployedAtMs: null }),
      newFingerprints: [],
      regressedFingerprints: [],
    };
    expect(buildReleaseContext(base).cohort).toBeNull();
    expect(buildReleaseContext({ ...base, cohort: 'canary-5pct' }).cohort).toBe('canary-5pct');
  });
});
