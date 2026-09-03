// Pure half only — `fetchCurrentReleaseWatch` is the I/O boundary (Vercel /
// release-ledger / Supabase Management API reads) and is intentionally NOT
// unit-tested here, matching `fetchDeployFreshness` and
// `fetchProductionMigrationHead`'s own convention (see release-watch.ts's
// module header).

import { describe, it, expect } from 'vitest';
import { classifyIncidentReleaseRelationship } from '../release-watch';
import type { UnifiedIncident } from '../types';

function lifecycle(state: UnifiedIncident['lifecycle']['state']): UnifiedIncident['lifecycle'] {
  return { state, headline: 'h', because: [] };
}

describe('classifyIncidentReleaseRelationship', () => {
  it('unknown when the release deploy time is unknown', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-02T12:00:00Z', lifecycle: lifecycle('new'), featureId: null },
      releaseDeployedAtMs: null,
      featureRegressedInRelease: false,
    });
    expect(verdict.relationship).toBe('unknown');
  });

  it('existed-before-release for an unchanged pre-existing incident', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-08-01T00:00:00Z', lifecycle: lifecycle('new'), featureId: null },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
      featureRegressedInRelease: false,
    });
    expect(verdict.relationship).toBe('existed-before-release');
  });

  it('regressed-after-release when a pre-existing incident is in the "regressed" lifecycle state', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-08-01T00:00:00Z', lifecycle: lifecycle('regressed'), featureId: null },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
      featureRegressedInRelease: false,
    });
    expect(verdict.relationship).toBe('regressed-after-release');
  });

  it('new-after-release only when proximity is corroborated by a real feature-delta signal', () => {
    const bare = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-02T12:07:00Z', lifecycle: lifecycle('new'), featureId: 'round_tracking' },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
      featureRegressedInRelease: false,
    });
    // Proximity alone is not causation — brief's own rule.
    expect(bare.relationship).toBe('no-causal-signal');
    expect(bare.confidence).toBe(0);

    const corroborated = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-02T12:07:00Z', lifecycle: lifecycle('new'), featureId: 'round_tracking' },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
      featureRegressedInRelease: true,
    });
    expect(corroborated.relationship).toBe('new-after-release');
    expect(corroborated.confidence).toBeLessThan(1);
    expect(corroborated.confidence).toBeGreaterThan(0);
  });

  it('no-causal-signal when first seen well after the release deploy', () => {
    const verdict = classifyIncidentReleaseRelationship({
      incident: { firstSeen: '2026-09-05T00:00:00Z', lifecycle: lifecycle('new'), featureId: 'round_tracking' },
      releaseDeployedAtMs: Date.parse('2026-09-02T12:00:00Z'),
      featureRegressedInRelease: true,
    });
    expect(verdict.relationship).toBe('no-causal-signal');
  });
});
