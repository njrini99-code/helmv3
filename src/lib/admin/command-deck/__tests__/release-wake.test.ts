import { describe, it, expect } from 'vitest';
import { buildReleaseWake, type BuildReleaseWakeInput } from '../release-wake';
import { NOW, DEPLOY_AT, incident } from './fixtures';

function baseInput(overrides: Partial<BuildReleaseWakeInput> = {}): BuildReleaseWakeInput {
  return {
    incidents: [],
    releaseSha: '8e4c5b7d1234567890',
    deployedAtMs: DEPLOY_AT,
    sourceCoverageBlind: false,
    now: NOW,
    selfHealActionsSinceDeploy: 0,
    ...overrides,
  };
}

describe('buildReleaseWake', () => {
  it('healthy: no incidents, full coverage, past the proven-healthy window -> proven-healthy, every known lane at zero', () => {
    const farAfterDeploy = DEPLOY_AT + 7 * 24 * 3600_000;
    const result = buildReleaseWake(baseInput({ now: farAfterDeploy }));
    expect(result.watchState).toBe('proven-healthy');
    expect(result.lanes.incidents).toEqual({ count: 0, unknown: false, unknownReason: null });
    expect(result.lanes.userImpact.count).toBe(0);
  });

  it('blind source: sourceCoverageBlind true past the proof window -> unknown, never proven-healthy', () => {
    const farAfterDeploy = DEPLOY_AT + 7 * 24 * 3600_000;
    const result = buildReleaseWake(baseInput({ now: farAfterDeploy, sourceCoverageBlind: true }));
    expect(result.watchState).toBe('unknown');
  });

  it('regression: a regressed active incident after deploy -> regression-detected, counted in the incidents lane', () => {
    const regressed = incident('reg-1', {
      severity: 'error',
      lifecycle: { state: 'regressed', headline: 'Regressed', because: [] },
      firstSeen: new Date(DEPLOY_AT - 2 * 24 * 3600_000).toISOString(),
      lastSeen: new Date(DEPLOY_AT + 3600_000).toISOString(),
    });
    const result = buildReleaseWake(baseInput({ incidents: [regressed] }));
    expect(result.watchState).toBe('regression-detected');
  });

  it('critical regression recommends rollback', () => {
    const regressed = incident('reg-2', {
      severity: 'critical',
      lifecycle: { state: 'regressed', headline: 'Regressed', because: [] },
      lastSeen: new Date(DEPLOY_AT + 3600_000).toISOString(),
    });
    const result = buildReleaseWake(baseInput({ incidents: [regressed] }));
    expect(result.watchState).toBe('rollback-recommended');
  });

  it('an incident that existed before the deploy never counts toward the "since deploy" lanes', () => {
    const preExisting = incident('pre-1', {
      firstSeen: new Date(DEPLOY_AT - 5 * 24 * 3600_000).toISOString(),
      lastSeen: new Date(DEPLOY_AT - 5 * 24 * 3600_000).toISOString(),
      affectedUsers: 10,
      affectedUsersKnown: true,
    });
    const result = buildReleaseWake(baseInput({ incidents: [preExisting] }));
    expect(result.incidents).toHaveLength(0);
    expect(result.lanes.incidents.count).toBe(0);
  });

  it('latency and invariants lanes are always honestly unknown — no read model backs them yet', () => {
    const result = buildReleaseWake(baseInput());
    expect(result.lanes.latency.unknown).toBe(true);
    expect(result.lanes.invariants.unknown).toBe(true);
    expect(result.lanes.latency.count).toBe(0);
  });

  it('all-unknown: deploy time unknown -> watch state unknown and every deploy-dependent lane honestly unknown, never a fabricated zero claimed as clean', () => {
    const result = buildReleaseWake(baseInput({ deployedAtMs: null, releaseSha: null }));
    expect(result.watchState).toBe('unknown');
    expect(result.lanes.incidents.unknown).toBe(true);
    expect(result.lanes.userImpact.unknown).toBe(true);
    expect(result.lanes.databaseErrors.unknown).toBe(true);
    // Even with selfHealActionsSinceDeploy defaulted to 0 by the caller, an
    // unknown deploy time must make this lane unknown too — 0 would read as
    // "confirmed nothing happened", which nobody actually confirmed.
    expect(result.lanes.selfHealActions.unknown).toBe(true);
    expect(result.deployedAt).toBeNull();
    expect(result.ageHours).toBeNull();
  });
});
