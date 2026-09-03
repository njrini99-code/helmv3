import { describe, expect, it } from 'vitest';

import {
  correlateHealthRegressionWithRelease,
  correlateWithRelease,
  DEFAULT_PROXIMITY_WINDOW_MS,
  type OccurrenceFacts,
  type ReleaseFacts,
} from '../release-correlation';

const DEPLOY_MS = Date.parse('2026-09-03T10:00:00.000Z');

/** Every release-side fact `null` — "not determined", never "false". */
function release(overrides: Partial<ReleaseFacts> = {}): ReleaseFacts {
  return {
    releaseSha: 'abc1234',
    deployedAtMs: DEPLOY_MS,
    featureChanged: null,
    rpcOrRelationChanged: null,
    codeInTraceChanged: null,
    migrationNamesObject: null,
    candidateCohortOnly: null,
    baselineCohortClean: null,
    replayReproducesOnNewShaOnly: null,
    providerOutageOverlaps: null,
    recurredAfterUnrelatedReleases: null,
    presentOnBaselineSha: null,
    ...overrides,
  };
}

function occurrence(overrides: Partial<OccurrenceFacts> = {}): OccurrenceFacts {
  return {
    firstSeenMs: DEPLOY_MS + 5 * 60_000,
    eventReleaseSha: 'abc1234',
    sqlstate: '42501',
    ...overrides,
  };
}

describe('correlateWithRelease — proximity can never corroborate itself (the #1789 shape)', () => {
  it('proximity alone reaches POSSIBLE and no higher, with an EMPTY corroborating list', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release() });
    expect(result.confidence).toBe('possible');
    expect(result.corroborating).toEqual([]);
    expect(result.because).toContain('Proximity alone is not causation');
  });

  it('records proximity in notCorroborating, so a reader sees it was considered and rejected', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release() });
    expect(result.notCorroborating.join(' ')).toContain('Timing proximity');
  });

  it('emits no numeric confidence field at all — a number invites accumulation', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release() });
    expect(result).not.toHaveProperty('confidenceScore');
    expect(Object.values(result).every((v) => typeof v !== 'number')).toBe(true);
  });

  it('adding MORE proximity (a closer first-seen) does not move the rung', () => {
    const far = correlateWithRelease({
      occurrence: occurrence({ firstSeenMs: DEPLOY_MS + 20 * 3_600_000 }),
      release: release(),
    });
    const near = correlateWithRelease({ occurrence: occurrence({ firstSeenMs: DEPLOY_MS + 1_000 }), release: release() });
    expect(far.confidence).toBe('possible');
    expect(near.confidence).toBe('possible');
  });
});

describe('correlateWithRelease — the ladder', () => {
  it('is unknown when the deploy time is unknown', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release({ deployedAtMs: null }) });
    expect(result.confidence).toBe('unknown');
    expect(result.withinProximityWindow).toBeNull();
  });

  it('is no-signal when the incident predates the release', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ firstSeenMs: DEPLOY_MS - 60_000 }),
      release: release(),
    });
    expect(result.confidence).toBe('no-signal');
    expect(result.exculpatory.join(' ')).toContain('first seen before this release deployed');
  });

  it('is no-signal well outside the proximity window', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ firstSeenMs: DEPLOY_MS + DEFAULT_PROXIMITY_WINDOW_MS + 1 }),
      release: release(),
    });
    expect(result.confidence).toBe('no-signal');
    expect(result.withinProximityWindow).toBe(false);
  });

  it('rises to LIKELY on one release-side signal inside the window', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release({ featureChanged: true }) });
    expect(result.confidence).toBe('likely');
    expect(result.corroborating).toHaveLength(1);
  });

  it('does NOT rise past LIKELY however many observational signals accumulate', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ featureChanged: true, rpcOrRelationChanged: true, codeInTraceChanged: true }),
    });
    expect(result.confidence).toBe('likely');
    expect(result.corroborating).toHaveLength(3);
    expect(result.because).toContain('Not REPRODUCED CAUSE');
  });

  it('reaches REPRODUCED CAUSE only on experimental evidence — a replay that separates the SHAs', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ replayReproducesOnNewShaOnly: true }),
    });
    expect(result.confidence).toBe('reproduced-cause');
  });

  it('reaches REPRODUCED CAUSE on a candidate/control cohort split', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ candidateCohortOnly: true, baselineCohortClean: true }),
    });
    expect(result.confidence).toBe('reproduced-cause');
  });

  it('a candidate-only cohort WITHOUT a clean baseline is only LIKELY — half an experiment is not one', () => {
    const result = correlateWithRelease({ occurrence: occurrence(), release: release({ candidateCohortOnly: true }) });
    expect(result.confidence).toBe('likely');
  });

  it('treats null as "not determined", never as false', () => {
    const allNull = correlateWithRelease({ occurrence: occurrence(), release: release() });
    expect(allNull.corroborating).toEqual([]);
    expect(allNull.exculpatory).toEqual([]);
    expect(allNull.confidence).toBe('possible');
  });
});

describe('correlateWithRelease — SQLSTATE mechanism fit is PAIRED, never standalone', () => {
  it('a missing-object SQLSTATE alone does not corroborate — it is listed as rejected', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ sqlstate: '42P01' }),
      release: release({ migrationNamesObject: null }),
    });
    expect(result.corroborating).toEqual([]);
    expect(result.confidence).toBe('possible');
    expect(result.notCorroborating.join(' ')).toContain('42P01 on its own');
  });

  it('the same SQLSTATE corroborates once a migration in this release names the object', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ sqlstate: '42P01' }),
      release: release({ migrationNamesObject: true }),
    });
    expect(result.confidence).toBe('likely');
    expect(result.corroborating.join(' ')).toContain('carried a migration naming the failing object');
  });

  it('a migration in the release does NOT corroborate a mechanism it could not produce', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ sqlstate: '40P01' }), // deadlock, not a missing object
      release: release({ migrationNamesObject: true }),
    });
    expect(result.corroborating).toEqual([]);
    expect(result.confidence).toBe('possible');
  });
});

describe('correlateWithRelease — exculpatory facts only ever lower the rung', () => {
  it('presence on the baseline SHA drops even a reproduced cause to no-signal', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ replayReproducesOnNewShaOnly: true, presentOnBaselineSha: true }),
    });
    expect(result.confidence).toBe('no-signal');
    expect(result.exculpatory.join(' ')).toContain('observed on the baseline SHA');
  });

  it('an overlapping provider outage caps a LIKELY at POSSIBLE', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ featureChanged: true, providerOutageOverlaps: true }),
    });
    expect(result.confidence).toBe('possible');
    expect(result.because).toContain('competing explanation');
  });

  it('historical recurrence after unrelated releases caps at POSSIBLE', () => {
    const result = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ featureChanged: true, codeInTraceChanged: true, recurredAfterUnrelatedReleases: true }),
    });
    expect(result.confidence).toBe('possible');
  });

  it('an exculpatory fact never raises the rung', () => {
    const withOut = correlateWithRelease({ occurrence: occurrence(), release: release() });
    const withIn = correlateWithRelease({
      occurrence: occurrence(),
      release: release({ providerOutageOverlaps: true }),
    });
    expect(withOut.confidence).toBe('possible');
    expect(withIn.confidence).toBe('possible');
  });
});

describe('release identity source', () => {
  it('an app error carries its own release identity', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ eventReleaseSha: 'eventsha' }),
      release: release({ releaseSha: 'ledgersha' }),
    });
    expect(result.releaseIdentitySource).toBe('event');
    expect(result.releaseSha).toBe('eventsha');
  });

  it('a scheduled sample falls back to the deployment ledger, and says so', () => {
    const result = correlateHealthRegressionWithRelease({
      regressionFirstSeenMs: DEPLOY_MS + 60_000,
      release: release({ releaseSha: 'ledgersha' }),
    });
    expect(result.releaseIdentitySource).toBe('deployment-ledger');
    expect(result.releaseSha).toBe('ledgersha');
  });

  it('is unknown when neither source names a release', () => {
    const result = correlateWithRelease({
      occurrence: occurrence({ eventReleaseSha: null }),
      release: release({ releaseSha: null }),
    });
    expect(result.releaseIdentitySource).toBe('unknown');
    expect(result.releaseSha).toBeNull();
  });

  it('a health regression never gains a SQLSTATE-paired signal it does not have', () => {
    const result = correlateHealthRegressionWithRelease({
      regressionFirstSeenMs: DEPLOY_MS + 60_000,
      release: release({ migrationNamesObject: true }),
    });
    expect(result.corroborating).toEqual([]);
  });
});
