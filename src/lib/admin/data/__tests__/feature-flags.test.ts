import { describe, it, expect } from 'vitest';
import { fetchFeatureFlags, rolloutStatusFor } from '../feature-flags';
import type { FlagDefinition } from '@/lib/flags/types';
import { FLAG_REGISTRY } from '@/lib/flags/registry.generated';

const NOW = new Date('2026-09-03T00:00:00Z');

function synthFlag(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    feature_id: 'synthetic_flag',
    owner: 'test',
    purpose: 'A synthetic flag for status-derivation tests.',
    type: 'release',
    status: 'active',
    created_at: '2026-01-01',
    expires_at: null,
    default: false,
    environment: { production: false, preview: false, development: false },
    kill_switch_behavior: null,
    cleanup_plan: 'Delete after the test.',
    ...overrides,
  };
}

/**
 * Exercises the real generated registry rather than mocking it: this read
 * model's only job is deriving rollout status from FLAG_REGISTRY, so a test
 * against the actual seeded config/feature-flags.yml data (regenerated via
 * `npm run flags:generate`) doubles as a smoke test that the two seed
 * entries (`flight_recorder`, `coachhelm_v2_availability`) are shaped as
 * expected, without duplicating scripts/flags/__tests__/lib.test.mjs's
 * schema coverage.
 */
describe('fetchFeatureFlags', () => {
  // Derived from FLAG_REGISTRY rather than pinned to a literal list. The
  // literal version read ['coachhelm_v2_availability', 'flight_recorder'] and
  // went red the moment a third flag was registered — a legitimate change
  // failing a gate that was only ever asserting "nobody added a flag". The
  // contract worth holding is that fetchFeatureFlags surfaces EVERY
  // registered flag and computes a status for each, which is what this now
  // says, and it still fails if the read model drops or invents one.
  it('returns every registered flag with a computed rolloutStatus for each', () => {
    const { flags } = fetchFeatureFlags(new Date('2026-09-03T00:00:00Z'));
    const ids = flags.map((f) => f.feature_id).sort();
    expect(ids).toEqual([...FLAG_REGISTRY].map((f) => f.feature_id).sort());
    expect(ids.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(['active', 'expiring_soon', 'expired', 'archived', 'no_expiry']).toContain(flag.rolloutStatus);
    }
  });

  it('a null expires_at reports no_expiry with a null daysUntilExpiry', () => {
    const { flags } = fetchFeatureFlags(new Date('2026-09-03T00:00:00Z'));
    // Both seeded flags carry expires_at: null (permanent ops lever /
    // long-lived release toggle) — see config/feature-flags.yml.
    for (const flag of flags) {
      expect(flag.expires_at).toBeNull();
      expect(flag.rolloutStatus).toBe('no_expiry');
      expect(flag.daysUntilExpiry).toBeNull();
    }
  });

  // Asserts the ordering PROPERTY, not one frozen sequence. Every seed flag
  // currently shares a created_at, so a literal expectation here was really
  // only testing the alpha tiebreak while looking like it tested the sort —
  // and it broke on the next flag either way.
  it('sorts newest-created first, feature_id as the tiebreaker', () => {
    const { flags } = fetchFeatureFlags(new Date('2026-09-03T00:00:00Z'));
    const dates = flags.map((f) => f.created_at);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (let i = 1; i < flags.length; i++) {
      if (flags[i].created_at !== flags[i - 1].created_at) continue;
      expect(flags[i - 1].feature_id < flags[i].feature_id).toBe(true);
    }
  });

  it('countsByStatus sums to the total flag count', () => {
    const { flags, countsByStatus } = fetchFeatureFlags(new Date('2026-09-03T00:00:00Z'));
    const sum = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(flags.length);
  });

  it('degraded is always false — this read model has no I/O to fail', () => {
    expect(fetchFeatureFlags().degraded).toBe(false);
  });
});

describe('rolloutStatusFor — pure per-flag derivation, synthetic fixtures', () => {
  it('no_expiry: expires_at null', () => {
    expect(rolloutStatusFor(synthFlag({ expires_at: null }), NOW)).toEqual({
      rolloutStatus: 'no_expiry',
      daysUntilExpiry: null,
    });
  });

  it('active: far in the future (> 14 days out)', () => {
    const result = rolloutStatusFor(synthFlag({ expires_at: '2026-12-01' }), NOW);
    expect(result.rolloutStatus).toBe('active');
    expect(result.daysUntilExpiry).toBeGreaterThan(14);
  });

  it('expiring_soon: within the 14-day window, not yet past due', () => {
    const tenDaysOut = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = rolloutStatusFor(synthFlag({ expires_at: tenDaysOut }), NOW);
    expect(result.rolloutStatus).toBe('expiring_soon');
    expect(result.daysUntilExpiry).toBeGreaterThanOrEqual(0);
    expect(result.daysUntilExpiry).toBeLessThanOrEqual(14);
  });

  it('expiring_soon boundary: exactly 14 days out counts as expiring_soon, not active', () => {
    const exactlyFourteen = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = rolloutStatusFor(synthFlag({ expires_at: exactlyFourteen }), NOW);
    expect(result.rolloutStatus).toBe('expiring_soon');
  });

  it('expired: expires_at in the past, status still active', () => {
    const result = rolloutStatusFor(synthFlag({ expires_at: '2020-01-01' }), NOW);
    expect(result.rolloutStatus).toBe('expired');
    expect(result.daysUntilExpiry).toBeLessThan(0);
  });

  it('archived: reported as archived even with a past expires_at, never as expired', () => {
    const result = rolloutStatusFor(synthFlag({ status: 'archived', expires_at: '2020-01-01' }), NOW);
    expect(result.rolloutStatus).toBe('archived');
  });

  it('archived with no expires_at reports a null daysUntilExpiry', () => {
    const result = rolloutStatusFor(synthFlag({ status: 'archived', expires_at: null }), NOW);
    expect(result).toEqual({ rolloutStatus: 'archived', daysUntilExpiry: null });
  });
});
